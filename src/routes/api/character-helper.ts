import { createFileRoute } from "@tanstack/react-router";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const MODEL = "openai/gpt-6-astra";

export const Route = createFileRoute("/api/character-helper")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { getRequestUser } = await import("@/lib/server/user");
        const session = await getRequestUser(request);
        if (!session) return Response.json({ error: "Please sign in again." }, { status: 401 });

        const body = (await request.json().catch(() => null)) as { idea?: string } | null;
        const idea = body?.idea?.trim() ?? "";
        if (idea.length < 3) return Response.json({ error: "Describe your character idea first." }, { status: 400 });

        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return Response.json({ error: "AI is not configured." }, { status: 500 });

        const upstream = await fetch(`${GATEWAY}/responses`, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: MODEL,
            instructions:
              "You help a player design a character for an interactive chat game. From their short idea, invent: " +
              "a fitting name, a one-line tagline, and a 'behavior' text of 2-4 short paragraphs that tells the game AI how to play this character " +
              "(personality, way of talking, world or setting; if the idea sounds like a story or RPG, describe the AI as narrator who invents people and events). " +
              "Write the behavior in second person, addressed to the character, e.g. 'You are Sir Pemberton, a grumpy cat...'. Keep it vivid but concise.",
            input: idea,
            reasoning: { effort: "low" },
            text: {
              format: {
                type: "json_schema",
                name: "character_draft",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    tagline: { type: "string" },
                    behavior: { type: "string" },
                  },
                  required: ["name", "tagline", "behavior"],
                  additionalProperties: false,
                },
              },
            },
          }),
        });
        if (!upstream.ok) {
          console.error("character helper failed", upstream.status, await upstream.text());
          const msg =
            upstream.status === 429
              ? "The AI is busy right now. Please wait a moment and try again."
              : upstream.status === 402
                ? "AI credits have run out. Please add credits to keep creating."
                : "The helper couldn't write a draft. Please try again.";
          return Response.json({ error: msg }, { status: upstream.status });
        }
        const json = (await upstream.json()) as { output_text?: string };
        let draft: { name: string; tagline: string; behavior: string };
        try {
          draft = JSON.parse(json.output_text ?? "");
        } catch {
          return Response.json({ error: "The helper gave a broken answer. Please try again." }, { status: 502 });
        }
        return Response.json(draft);
      },
    },
  },
});
