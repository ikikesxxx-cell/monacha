import { createFileRoute } from "@tanstack/react-router";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const MODEL = "openai/gpt-image-2.5-sunburst";

function errorFor(status: number) {
  if (status === 429) return "Too many photo requests. Please wait a moment.";
  if (status === 402) return "AI credits have run out.";
  if (status === 400) return "That couldn't be turned into a photo. Try describing it differently.";
  return "Photo generation failed. Please try again.";
}

export const Route = createFileRoute("/api/avatar")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { getRequestUser } = await import("@/lib/server/user");
        const { buildLearningNotes } = await import("@/lib/photo-learning");
        const session = await getRequestUser(request);
        if (!session) return Response.json({ error: "Please sign in again." }, { status: 401 });
        // photo_generations is newer than the generated types
        const db = session.supabase as unknown as { from: (t: string) => any };

        const form = await request.formData();
        const prompt = String(form.get("prompt") ?? "").trim();
        const change = String(form.get("change") ?? "").trim();
        const base = String(form.get("base") ?? "");
        let reference: unknown = form.get("reference");
        let editing = false;
        if (change && base) {
          // Only allow editing the caller's own stored photos
          const m = base.match(/\/avatars\/([^?]+)/);
          const path = m ? decodeURIComponent(m[1]!) : "";
          if (!path.startsWith(`${session.user.id}/`)) {
            return Response.json({ error: "That photo can't be edited." }, { status: 403 });
          }
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: blob, error } = await supabaseAdmin.storage.from("avatars").download(path);
          if (error || !blob) return Response.json({ error: "Couldn't load that photo." }, { status: 404 });
          reference = new File([blob], "base.png", { type: "image/png" });
          editing = true;
        }
        const hasRef = reference instanceof File && reference.size > 0;
        if (prompt.length < 3 && !hasRef) {
          return Response.json({ error: "Describe the photo or add a real photo first." }, { status: 400 });
        }
        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return Response.json({ error: "AI is not configured." }, { status: 500 });

        const { data: history } = await db
          .from("photo_generations")
          .select("prompt,status")
          .eq("user_id", session.user.id)
          .neq("status", "pending")
          .order("reviewed_at", { ascending: false })
          .limit(30);
        const rows = (history ?? []) as { prompt: string; status: string }[];
        const learning = buildLearningNotes(
          rows.filter((r) => r.status === "accepted").map((r) => r.prompt),
          rows.filter((r) => r.status === "declined").map((r) => r.prompt),
        );

        const subject = editing ? `${prompt ? prompt + " — " : ""}change: ${change}` : prompt || "the subject of the reference photo";
        const fidelity =
          "Follow every detail of the description exactly, especially skin tone, ethnicity, hair color, eye color, age and expression. Never lighten, darken or change the described skin tone.";
        const fullPrompt = [
          editing
            ? `Edit this photo. Apply ONLY this change: ${change}. Keep everything else identical — same person or animal, face, skin tone, pose, lighting, background and photo style. Keep it ultra-realistic.`
            : hasRef
            ? `Study the reference photo (subject, features, lighting, setting) and create a brand-new, original ultra-realistic portrait photograph inspired by it — not a copy. Subject: ${subject}.`
            : `Ultra realistic portrait photograph, natural lighting, sharp focus, looking at the camera, square framing. Subject: ${subject}.`,
          editing ? "" : fidelity,
          editing ? "" : learning,
        ]
          .filter(Boolean)
          .join(" ");

        let upstream: Response;
        if (hasRef) {
          const f = new FormData();
          f.set("model", MODEL);
          f.set("prompt", fullPrompt);
          f.set("image", reference as File);
          f.set("size", "1024x1024");
          upstream = await fetch(`${GATEWAY}/images/edits`, {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}` },
            body: f,
          });
        } else {
          upstream = await fetch(`${GATEWAY}/images/generations`, {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: MODEL, prompt: fullPrompt, size: "1024x1024" }),
          });
        }
        if (!upstream.ok) {
          console.error("image gen failed", upstream.status, await upstream.text());
          return Response.json({ error: errorFor(upstream.status) }, { status: upstream.status });
        }
        const json = (await upstream.json()) as { data?: { b64_json?: string }[] };
        const b64 = json.data?.[0]?.b64_json;
        if (!b64) return Response.json({ error: "No photo was returned." }, { status: 502 });

        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const path = `${session.user.id}/${crypto.randomUUID()}.png`;
        const { error: upErr } = await supabaseAdmin.storage.from("avatars").upload(path, bytes, { contentType: "image/png" });
        if (upErr) return Response.json({ error: "Could not save the photo." }, { status: 500 });
        const { data: signed } = await supabaseAdmin.storage
          .from("avatars")
          .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
        if (!signed) return Response.json({ error: "Could not save the photo." }, { status: 500 });

        const { error: logErr } = await db.from("photo_generations").insert({
          user_id: session.user.id,
          prompt: subject,
          url: signed.signedUrl,
          from_reference: hasRef,
        });
        if (logErr) console.error("could not record generation for review", logErr);
        return Response.json({ url: signed.signedUrl });
      },
    },
  },
});
