import { createFileRoute } from "@tanstack/react-router";
import type { LanguageModel } from "ai";
import { z } from "zod";

const draftSchema = z.object({
  name: z.string(),
  tagline: z.string(),
  behavior: z.string(),
  rules: z.string(),
  questions: z.array(z.string()),
  reply: z.string(),
});

const BRAINSTORM_SYSTEM =
  "You are a friendly creative partner chatting with a player who wants to make a character or game for an interactive chat game. " +
  "Talk casually like a friend in short messages, in the player's language. If they just say hi or chat, answer naturally and gently ask what they'd like to make. " +
  "Put your chat message in 'reply'. Ask at most one or two easy questions at a time. " +
  "Whenever you know enough, fill in name, tagline, a 2-4 paragraph 'behavior' (second person, e.g. 'You are Sir Pemberton...'; for stories/RPGs the AI is narrator) and 'rules' (empty string if none), " +
  "and keep improving them as the chat continues. If you don't know enough yet, leave name, tagline, behavior and rules as empty strings. Set 'questions' to an empty array.";

export const Route = createFileRoute("/api/character-helper")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { getRequestUser } = await import("@/lib/server/user");
        const session = await getRequestUser(request);
        if (!session) return Response.json({ error: "Please sign in again." }, { status: 401 });

        const body = (await request.json().catch(() => null)) as { idea?: unknown; brainstorm?: unknown; chat?: unknown } | null;
        const chat = Array.isArray(body?.chat)
          ? (body.chat as { role?: unknown; text?: unknown }[])
              .filter((m) => (m.role === "player" || m.role === "ai") && typeof m.text === "string" && m.text.trim())
              .slice(-40)
              .map((m) => ({ role: m.role === "ai" ? ("assistant" as const) : ("user" as const), content: String(m.text).slice(0, 4000) }))
          : null;
        const idea = typeof body?.idea === "string" ? body.idea.trim() : "";
        if (chat && chat.length) {
          const { getPlayerTextModel } = await import("@/lib/server/player-ai.server");
          const { generateText, Output } = await import("ai");
          try {
            const model = await getPlayerTextModel(session.user.id);
            const { output } = await generateText({ model, system: BRAINSTORM_SYSTEM, messages: chat, output: Output.object({ schema: draftSchema }), abortSignal: request.signal, maxRetries: 0 });
            if (!output) return Response.json({ error: "The AI gave a broken answer. Please try again." }, { status: 502 });
            return Response.json(output);
          } catch (error) {
            console.error("brainstorm chat failed", error instanceof Error ? error.name : "provider error");
            return Response.json({ error: "The AI couldn't answer right now. Please try again." }, { status: 502 });
          }
        }
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
              "Set 'reply' to an empty string. Also write 'rules': short scenario rules / things that can never happen in this story (empty string if none are implied). " +
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
