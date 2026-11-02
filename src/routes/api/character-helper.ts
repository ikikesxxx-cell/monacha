import { createFileRoute } from "@tanstack/react-router";
import type { LanguageModel } from "ai";
import { z } from "zod";

const draftSchema = z.object({
  name: z.string(),
  tagline: z.string(),
  behavior: z.string(),
  rules: z.string(),
  questions: z.array(z.string()),
});

export const Route = createFileRoute("/api/character-helper")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { getRequestUser } = await import("@/lib/server/user");
        const session = await getRequestUser(request);
        if (!session) return Response.json({ error: "Please sign in again." }, { status: 401 });

        const body = (await request.json().catch(() => null)) as { idea?: unknown; brainstorm?: unknown } | null;
        const idea = typeof body?.idea === "string" ? body.idea.trim() : "";
        if (idea.length < 3) return Response.json({ error: "Describe your character idea first." }, { status: 400 });
        if (idea.length > 8000) return Response.json({ error: "Keep your character idea under 8,000 characters." }, { status: 400 });

        const { getPlayerTextModel, MissingPlayerProviderKeyError } = await import("@/lib/server/player-ai.server");
        let model: LanguageModel;
        try {
          model = await getPlayerTextModel(session.user.id);
        } catch (error) {
          if (error instanceof MissingPlayerProviderKeyError) return Response.json({ error: error.message }, { status: 412 });
          console.error("could not load player chat provider", error);
          return Response.json({ error: "Could not load your AI provider settings." }, { status: 500 });
        }

        const { generateText, Output } = await import("ai");
        try {
          const { output } = await generateText({
            model,
            system:
              "You help a player design a character for an interactive chat game. From their short idea, invent: " +
              "a fitting name, a one-line tagline, and a 'behavior' text of 2-4 short paragraphs that tells the game AI how to play this character " +
              "(personality, way of talking, world or setting; if the idea sounds like a story or RPG, describe the AI as narrator who invents people and events). " +
              "Write the behavior in second person, addressed to the character, e.g. 'You are Sir Pemberton, a grumpy cat...'. Keep it vivid but concise. " +
              "Also write 'rules': short scenario rules / things that can never happen in this story (empty string if none are implied). " +
              (body?.brainstorm
                ? "The player is unsure how to describe their idea. In 'questions', ask 2-4 short friendly questions about what is still missing to make it perfect."
                : "Set 'questions' to an empty array unless something essential is missing."),
            prompt: idea,
            output: Output.object({ schema: draftSchema }),
            abortSignal: request.signal,
            maxRetries: 0,
          });
          if (!output) return Response.json({ error: "The helper gave a broken answer. Please try again." }, { status: 502 });
          return Response.json(output);
        } catch (error) {
          console.error("character helper failed", error instanceof Error ? error.name : "provider error");
          return Response.json(
            { error: "The selected provider couldn't write a draft. Check your key, model name, and provider limits." },
            { status: 502 },
          );
        }
      },
    },
  },
});
