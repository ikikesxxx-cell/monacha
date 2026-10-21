import { createFileRoute } from "@tanstack/react-router";
import type { UIMessage } from "ai";

const LENGTHS: Record<string, string> = {
  short: "Keep replies short: 1-3 sentences.",
  medium: "Keep replies to a short paragraph or two.",
  long: "Write rich, detailed replies of several paragraphs.",
};

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { getRequestUser } = await import("@/lib/server/user");
        const session = await getRequestUser(request);
        if (!session) return new Response("Please sign in again.", { status: 401 });
        const { user, supabase } = session;

        const body = (await request.json()) as { messages: UIMessage[]; characterId: string };
        const messages = body.messages;
        if (!Array.isArray(messages) || !body.characterId) return new Response("Bad request", { status: 400 });

        const { data: character } = await supabase
          .from("characters")
          .select("id,name,behavior")
          .eq("id", body.characterId)
          .maybeSingle();
        if (!character) return new Response("Character not found", { status: 404 });

        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name,reply_length")
          .eq("id", user.id)
          .maybeSingle();

        const last = messages[messages.length - 1];
        if (last?.role === "user") {
          const { error } = await supabase.from("messages").insert({
            character_id: character.id,
            user_id: user.id,
            ui_id: last.id,
            role: "user",
            parts: last.parts as never,
          });
          if (error) {
            console.error("save user message failed", error);
            return new Response("Could not save your message.", { status: 500 });
          }
        }

        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return new Response("AI is not configured.", { status: 500 });

        const { createOpenAI } = await import("@ai-sdk/openai");
        const { streamText, convertToModelMessages } = await import("ai");
        const { createLovableAiGatewayRunIdFetch, getLovableAiGatewayRunId, withLovableAiGatewayRunIdHeader } =
          await import("@/lib/server/run-id");

        const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));
        const provider = createOpenAI({
          baseURL: "https://ai.gateway.lovable.dev/v1",
          apiKey,
          headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
          fetch: runIdFetch.fetch,
        });

        const instructions = [
          `You are playing a character in an interactive chat game. Character name: ${character.name}.`,
          `How you must behave (written by the player):\n${character.behavior}`,
          "Stay in character. If the setup describes a story, RPG or world, act as narrator/game master: invent new people, places and events as the story goes, and voice several characters when needed (put each speaker's name in bold before their lines).",
          "Follow the player's lead and their choices. Describe actions in *italics*.",
          profile?.display_name ? `The player's name is ${profile.display_name}.` : "",
          LENGTHS[profile?.reply_length ?? "medium"] ?? LENGTHS.medium,
        ]
          .filter(Boolean)
          .join("\n\n");

        const result = streamText({
          model: provider.responses("openai/gpt-6-astra"),
          instructions,
          messages: await convertToModelMessages(messages),
          abortSignal: request.signal,
          providerOptions: {
            openai: {
              store: false,
              forceReasoning: true,
              reasoningEffort: "low",
              reasoningSummary: "auto",
              include: ["reasoning.encrypted_content"],
            },
          },
        });

        return withLovableAiGatewayRunIdHeader(
          result.toUIMessageStreamResponse({
            originalMessages: messages,
            onFinish: async ({ responseMessage }) => {
              const parts = responseMessage.parts.filter((p) => p.type === "text");
              if (parts.length === 0) return;
              const { error } = await supabase.from("messages").insert({
                character_id: character.id,
                user_id: user.id,
                ui_id: responseMessage.id,
                role: "assistant",
                parts: parts as never,
              });
              if (error) console.error("save assistant message failed", error);
            },
            onError: (error) => {
              console.error(error);
              const status = (error as { statusCode?: number })?.statusCode;
              if (status === 429) return "The AI is busy right now. Please wait a moment and try again.";
              if (status === 402) return "AI credits have run out. Please add credits to keep chatting.";
              return "Something went wrong getting a reply. Please try again.";
            },
          }),
          runIdFetch,
        );
      },
    },
  },
});
