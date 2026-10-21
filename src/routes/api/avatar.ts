import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/avatar")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { getRequestUser } = await import("@/lib/server/user");
        const session = await getRequestUser(request);
        if (!session) return Response.json({ error: "Please sign in again." }, { status: 401 });

        const { prompt } = (await request.json()) as { prompt?: string };
        if (!prompt || prompt.trim().length < 3) {
          return Response.json({ error: "Describe the photo first." }, { status: 400 });
        }
        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return Response.json({ error: "AI is not configured." }, { status: 500 });

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "openai/gpt-image-2.5-sunburst",
            prompt: `Ultra realistic portrait photograph, natural lighting, sharp focus, looking at the camera, square framing. Subject: ${prompt.trim()}`,
            size: "1024x1024",
          }),
        });
        if (!upstream.ok) {
          const text = await upstream.text();
          console.error("image gen failed", upstream.status, text);
          const msg =
            upstream.status === 429
              ? "Too many photo requests. Please wait a moment."
              : upstream.status === 402
                ? "AI credits have run out."
                : upstream.status === 400
                  ? "That description couldn't be turned into a photo. Try describing it differently."
                  : "Photo generation failed. Please try again.";
          return Response.json({ error: msg }, { status: upstream.status });
        }
        const json = (await upstream.json()) as { data?: { b64_json?: string }[] };
        const b64 = json.data?.[0]?.b64_json;
        if (!b64) return Response.json({ error: "No photo was returned." }, { status: 502 });

        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const path = `${session.user.id}/${crypto.randomUUID()}.png`;
        const { error: upErr } = await supabaseAdmin.storage
          .from("avatars")
          .upload(path, bytes, { contentType: "image/png" });
        if (upErr) return Response.json({ error: "Could not save the photo." }, { status: 500 });
        const { data: signed, error: sErr } = await supabaseAdmin.storage
          .from("avatars")
          .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
        if (sErr || !signed) return Response.json({ error: "Could not save the photo." }, { status: 500 });
        return Response.json({ url: signed.signedUrl });
      },
    },
  },
});
