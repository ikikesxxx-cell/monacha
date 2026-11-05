import { createFileRoute } from "@tanstack/react-router";

/** Returns 3 short, in-story things the player could say or do next. Uses free/player models only. */
export const Route = createFileRoute("/api/suggest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { getRequestUser } = await import("@/lib/server/user");
        const session = await getRequestUser(request);
        if (!session) return Response.json({ error: "Please sign in again." }, { status: 401 });
        const body = (await request.json().catch(() => null)) as { characterId?: string } | null;
        if (!body?.characterId) return Response.json({ error: "Bad request" }, { status: 400 });
        const { data: rows } = await session.supabase
          .from("messages")
          .select("role,parts")
          .eq("user_id", session.user.id)
          .eq("character_id", body.characterId)
          .order("created_at", { ascending: false })
          .limit(6);
        const transcript = (rows ?? [])
          .reverse()
          .map((r) => `${r.role === "user" ? "Player" : "Character"}: ${((r.parts as { type: string; text?: string }[]) ?? []).map((p) => p.text ?? "").join(" ")}`)
          .join("\n")
          .slice(-2500);
        if (!transcript) return Response.json({ suggestions: [] });
        const { getPlayerTextModel } = await import("@/lib/server/player-ai.server");
        const { generateText } = await import("ai");
        try {
          const model = await getPlayerTextModel(session.user.id);
          const { text } = await generateText({
            model,
            abortSignal: request.signal,
            prompt: `Story so far:\n${transcript}\n\nWrite exactly 3 short options (max 12 words each) for what the PLAYER could say or do next, written in first person as the player. Use *asterisks* for actions. Mix: one kind, one bold, one surprising. Output only the 3 lines, no numbers, no quotes.`,
          });
          const suggestions = text
            .split("\n")
            .map((l) => l.replace(/^[\s\-•\d.)]+/, "").replace(/^"|"$/g, "").trim())
            .filter((l) => l.length > 1)
            .slice(0, 3);
          return Response.json({ suggestions });
        } catch {
          return Response.json({ suggestions: [] });
        }
      },
    },
  },
});
