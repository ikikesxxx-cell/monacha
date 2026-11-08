import { createFileRoute } from "@tanstack/react-router";
import { EMPTY_MEMORY, normalizeMemory } from "@/lib/conversation-memory";

export const Route = createFileRoute("/api/scene")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { getRequestUser } = await import("@/lib/server/user");
        const session = await getRequestUser(request);
        if (!session) return Response.json({ error: "Please sign in again." }, { status: 401 });

        const body = (await request.json().catch(() => null)) as { characterId?: unknown } | null;
        if (typeof body?.characterId !== "string" || body.characterId.length > 100) {
          return Response.json({ error: "Invalid character." }, { status: 400 });
        }
        const { data: character, error: characterError } = await session.supabase
          .from("characters")
          .select("id")
          .eq("id", body.characterId)
          .maybeSingle();
        if (characterError) return Response.json({ error: "Could not load this story." }, { status: 500 });
        if (!character) return Response.json({ error: "Character not found." }, { status: 404 });

        const { data: savedMemory, error: memoryError } = await session.supabase
          .from("conversation_memories")
          .select("facts,summary")
          .eq("user_id", session.user.id)
          .eq("character_id", character.id)
          .maybeSingle();
        if (memoryError) return Response.json({ error: "Could not read your story memory." }, { status: 500 });
        const memory = savedMemory ? normalizeMemory(savedMemory) : EMPTY_MEMORY;
        const location = memory.facts.find((fact) => fact.key === "player.location")?.detail.trim().slice(0, 300) ?? "";
        if (!location) return Response.json({ url: null });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: cached, error: cacheError } = await supabaseAdmin
          .from("conversation_scenes")
          .select("storage_path")
          .eq("user_id", session.user.id)
          .eq("character_id", character.id)
          .eq("location", location)
          .maybeSingle();
        if (cacheError) {
          console.error("could not load saved scene", cacheError);
          return Response.json({ error: "Could not load the saved scene." }, { status: 500 });
        }
        if (cached) {
          const { data: signed, error } = await supabaseAdmin.storage
            .from("avatars")
            .createSignedUrl(cached.storage_path, 60 * 60 * 24 * 365 * 10);
          if (error || !signed) return Response.json({ error: "Could not load the saved scene." }, { status: 500 });
          return Response.json({ url: signed.signedUrl, location }, { headers: { "Cache-Control": "no-store" } });
        }

        const { getPollinationsApiKey, MissingPlayerProviderKeyError } = await import("@/lib/server/player-ai.server");
        let apiKey: string | null;
        try {
          apiKey = await getPollinationsApiKey(session.user.id);
        } catch (error) {
          if (error instanceof MissingPlayerProviderKeyError) return Response.json({ error: error.message }, { status: 412 });
          console.error("could not load player photo provider", error);
          return Response.json({ error: "Could not load your photo provider settings." }, { status: 500 });
        }

        const { generatePollinationsImage, imageExtension, PollinationsRequestError } = await import("@/lib/server/pollinations.server");
        let image: Awaited<ReturnType<typeof generatePollinationsImage>>;
        const scenePrompt = `A wide, realistic documentary photograph of the place: ${location}. Natural ambient light, real-world textures and small imperfections, subtle film grain, no people in focus, no text, borders, or user interface.`;
        try {
          try {
            image = await generatePollinationsImage({ prompt: scenePrompt, apiKey, width: 1024, height: 768, signal: request.signal });
          } catch (first) {
            // Own key first; when its budget is gone, fall back to the free service.
            if (!apiKey || request.signal.aborted) throw first;
            image = await generatePollinationsImage({ prompt: scenePrompt, apiKey: null, width: 1024, height: 768, signal: request.signal });
          }
        } catch (error) {
          if (error instanceof PollinationsRequestError) {
            console.error("scene generation failed", error.status);
            return Response.json({ error: error.message }, { status: error.status });
          }
          console.error("scene generation failed", error instanceof Error ? error.name : "provider error");
          return Response.json({ error: "Could not generate the scene background." }, { status: 502 });
        }

        const storagePath = `${session.user.id}/scenes/${crypto.randomUUID()}.${imageExtension(image.contentType)}`;
        const { error: uploadError } = await supabaseAdmin.storage
          .from("avatars")
          .upload(storagePath, image.bytes, { contentType: image.contentType });
        if (uploadError) return Response.json({ error: "Could not save the scene background." }, { status: 500 });

        const { error: saveError } = await supabaseAdmin.from("conversation_scenes").upsert(
          {
            user_id: session.user.id,
            character_id: character.id,
            location,
            storage_path: storagePath,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,character_id,location" },
        );
        if (saveError) {
          await supabaseAdmin.storage.from("avatars").remove([storagePath]);
          console.error("could not save generated scene", saveError);
          return Response.json({ error: "Could not save the scene background." }, { status: 500 });
        }

        const { data: signed, error: signError } = await supabaseAdmin.storage
          .from("avatars")
          .createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 10);
        if (signError || !signed) return Response.json({ error: "Could not load the scene background." }, { status: 500 });
        return Response.json({ url: signed.signedUrl, location }, { headers: { "Cache-Control": "no-store" } });
      },
    },
  },
});
