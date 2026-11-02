import { createFileRoute } from "@tanstack/react-router";

function errorFor(status: number) {
  if (status === 429) return "Pollinations is rate limited. Please wait a moment.";
  if (status === 402) return "Your Pollinations budget is empty or payment is required.";
  if (status === 401 || status === 403) return "Your Pollinations key was rejected. Check it in Settings.";
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
        const { getPollinationsApiKey, MissingPlayerProviderKeyError } = await import("@/lib/server/player-ai.server");
        const { generatePollinationsImage, imageExtension, PollinationsRequestError } = await import("@/lib/server/pollinations.server");
        const form = await request.formData();
        const prompt = String(form.get("prompt") ?? "").trim();
        const change = String(form.get("change") ?? "").trim();
        const base = String(form.get("base") ?? "");
        let reference: unknown = form.get("reference");
        let editing = false;
        if (change && base) {
          const match = base.match(/\/avatars\/([^?]+)/);
          const path = match ? decodeURIComponent(match[1]!) : "";
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

        let apiKey: string;
        try {
          apiKey = await getPollinationsApiKey(session.user.id);
        } catch (error) {
          if (error instanceof MissingPlayerProviderKeyError) return Response.json({ error: error.message }, { status: 412 });
          console.error("could not load player photo provider", error);
          return Response.json({ error: "Could not load your photo provider settings." }, { status: 500 });
        }

        const { data: history } = await session.supabase
          .from("photo_generations")
          .select("prompt,status")
          .eq("user_id", session.user.id)
          .neq("status", "pending")
          .order("reviewed_at", { ascending: false })
          .limit(30);
        const rows = (history ?? []) as { prompt: string; status: string }[];
        const learning = buildLearningNotes(
          rows.filter((row) => row.status === "accepted").map((row) => row.prompt),
          rows.filter((row) => row.status === "declined").map((row) => row.prompt),
        );

        const subject = editing ? `${prompt ? `${prompt} — ` : ""}change: ${change}` : prompt || "the subject of the reference photo";
        const fidelity =
          "Follow every detail of the description exactly, especially skin tone, ethnicity, hair color, eye color, age and expression. Never lighten, darken or change the described skin tone.";
        const fullPrompt = [
          editing
            ? `Edit this photo. The change request may be short and casual (e.g. "longer hair") — interpret it naturally. Apply ONLY this change: ${change}. Keep everything else identical — same person or animal, face, skin tone, pose, lighting, background and photo style. Keep it ultra-realistic, sharp and high detail, never blurry.`
            : hasRef
              ? `Study the reference photo (subject, features, lighting, setting) and create a brand-new, original ultra-realistic portrait photograph inspired by it — not a copy. Subject: ${subject}.`
              : `Ultra realistic portrait photograph, natural lighting, tack-sharp focus, high detail, crisp textures, no blur, no grain, looking at the camera, square framing. Subject: ${subject}.`,
          editing ? "" : fidelity,
          "Make it look like a real, imperfect living being — never a flawless, airbrushed or plastic face. Include natural skin texture and visible pores, slight facial asymmetry, small blemishes, freckles, fine lines or stray hairs, uneven natural lighting and real-world details. Perfect symmetry or doll-like smoothness is wrong.",
          editing ? "" : learning,
        ]
          .filter(Boolean)
          .join(" ");

        let image: Awaited<ReturnType<typeof generatePollinationsImage>>;
        try {
          image = await generatePollinationsImage({
            prompt: fullPrompt,
            apiKey,
            ...(hasRef && reference instanceof File ? { reference } : {}),
            signal: request.signal,
          });
        } catch (error) {
          if (error instanceof PollinationsRequestError) {
            console.error("image generation failed", error.status);
            return Response.json({ error: error.message }, { status: error.status });
          }
          console.error("image generation failed", error instanceof Error ? error.name : "provider error");
          return Response.json({ error: errorFor(502) }, { status: 502 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const path = `${session.user.id}/${crypto.randomUUID()}.${imageExtension(image.contentType)}`;
        const { error: uploadError } = await supabaseAdmin.storage.from("avatars").upload(path, image.bytes, { contentType: image.contentType });
        if (uploadError) return Response.json({ error: "Could not save the photo." }, { status: 500 });
        const { data: signed } = await supabaseAdmin.storage.from("avatars").createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
        if (!signed) return Response.json({ error: "Could not save the photo." }, { status: 500 });

        let parentId: string | null = null;
        if (editing) {
          const { data: parent } = await session.supabase
            .from("photo_generations")
            .select("id")
            .eq("url", base)
            .eq("user_id", session.user.id)
            .maybeSingle();
          parentId = parent?.id ?? null;
        }
        const { error: logError } = await session.supabase.from("photo_generations").insert({
          parent_id: parentId,
          user_id: session.user.id,
          prompt: subject,
          url: signed.signedUrl,
          from_reference: hasRef,
        });
        if (logError) console.error("could not record generation for review", logError);
        return Response.json({ url: signed.signedUrl });
      },
      DELETE: async ({ request }) => {
        const { getRequestUser } = await import("@/lib/server/user");
        const session = await getRequestUser(request);
        if (!session) return Response.json({ error: "Please sign in again." }, { status: 401 });
        const { id } = (await request.json().catch(() => ({}))) as { id?: string };
        if (!id) return Response.json({ error: "Missing photo." }, { status: 400 });
        const { data: row } = await session.supabase
          .from("photo_generations")
          .select("id,url")
          .eq("id", id)
          .eq("user_id", session.user.id)
          .maybeSingle();
        if (!row) return Response.json({ error: "Photo not found." }, { status: 404 });
        const match = String(row.url).match(/\/avatars\/([^?]+)/);
        const path = match ? decodeURIComponent(match[1]!) : "";
        if (path.startsWith(`${session.user.id}/`)) {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin.storage.from("avatars").remove([path]);
        }
        const { error } = await session.supabase.from("photo_generations").delete().eq("id", id);
        if (error) return Response.json({ error: "Couldn't delete." }, { status: 500 });
        return Response.json({ ok: true });
      },
    },
  },
});
