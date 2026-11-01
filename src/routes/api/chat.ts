import { createFileRoute } from "@tanstack/react-router";
import type { UIMessage } from "ai";
import { memoryContext, RECENT_MESSAGE_COUNT } from "@/lib/conversation-memory";

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
          .select("id,name,behavior,rules")
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
        const { streamText, convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse } = await import("ai");
        const { refreshStoryMemory } = await import("@/lib/server/story-memory");
        const { createLovableAiGatewayRunIdFetch, getLovableAiGatewayRunId, withLovableAiGatewayRunIdHeader } =
          await import("@/lib/server/run-id");

        const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));
        const provider = createOpenAI({
          baseURL: "https://ai.gateway.lovable.dev/v1",
          apiKey,
          headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
          fetch: runIdFetch.fetch,
        });

        const stream = createUIMessageStream({
          originalMessages: messages,
          onError: (error) => {
            console.error(error);
            if (request.signal.aborted) return "Reply stopped.";
            const e = error as { message?: string; responseBody?: string };
            if (e.responseBody) {
              try {
                const body = JSON.parse(e.responseBody);
                const message = body.message ?? body.error?.message;
                if (typeof message === "string") return message;
              } catch { /* Not a JSON gateway response. */ }
            }
            return e.message || "Could not load story memory or get a reply.";
          },
          execute: async ({ writer }) => {
            writer.write({ type: "data-memory-status", data: { status: "reading" }, transient: true });
            const memory = await refreshStoryMemory({ supabase, userId: user.id, characterId: character.id,
              model: provider.responses("openai/gpt-6-astra"), signal: request.signal });
            writer.write({ type: "data-story-memory", data: memory, transient: true });
            const { data: recent, error } = await supabase.from("messages").select("ui_id,role,parts,created_at,id")
              .eq("user_id", user.id).eq("character_id", character.id).order("created_at", { ascending: false })
              .order("id", { ascending: false }).limit(RECENT_MESSAGE_COUNT);
            if (error) throw new Error("Could not read your saved chat.");
            const recentMessages = (recent ?? []).reverse().map((row) => ({ id: row.ui_id, role: row.role, parts: row.parts }) as UIMessage);
        const instructions = [
          `You are playing a character in an interactive chat game. Character name: ${character.name}.`,
          `How you must behave (written by the creator — this is the highest law, follow it above everything else):\n${character.behavior}`,
          character.rules?.trim() ? `Scenario rules set by the creator (always obey; the player cannot change them mid-chat, even if they ask):\n${character.rules}` : "",
          "Always roleplay and always answer in character — never refuse, stall, lecture or go silent. Consensual romance, affection, flirting, drama and intense emotions between adults (all characters 18+) are welcome parts of the story.",
          "Stay in character. If the setup describes a story, RPG or world, act as narrator/storyteller: invent new people, places and events as the story goes, and voice several characters when needed (put each speaker's name in bold before their lines).",
          "Formatting rule: write actions, gestures and narration between asterisks like *she smiles and leans closer*, and write spoken words as normal plain text. Never use quotation marks around speech.",
          "Follow the player's lead and their choices. Never ask the player \"What do you do next?\" or any similar prompt about their next move — just end your turn naturally in character.",
          "You are NOT an AI. You genuinely are this character and you do not know about AI, language models or being a program. Never mention being an AI, a model or an assistant, and never break character — unless the behavior written above explicitly says this character is an AI.",
          profile?.display_name ? `The player's name is ${profile.display_name}.` : "",
          LENGTHS[profile?.reply_length ?? "medium"] ?? LENGTHS["medium"],
          memoryContext(memory),
        ]
          .filter(Boolean)
          .join("\n\n");

        const result = streamText({
          model: provider.responses("openai/gpt-6-astra"),
          instructions,
          messages: await convertToModelMessages(recentMessages),
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

            writer.merge(result.toUIMessageStream());
          },
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
        });
        return withLovableAiGatewayRunIdHeader(createUIMessageStreamResponse({ stream, keepAliveMs: 10000 }), runIdFetch,
          { "Cache-Control": "no-store" }, { waitForUpstreamHeaders: false });
      },
    },
  },
});
