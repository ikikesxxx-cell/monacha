import { createFileRoute } from "@tanstack/react-router";
import type { LanguageModel, UIMessage } from "ai";
import { memoryContext, RECENT_MESSAGE_COUNT } from "@/lib/conversation-memory";
import { GUEST_POOL_EMPTY } from "@/lib/guest-limits";

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
          .select("display_name,reply_length,persona_look")
          .eq("id", user.id)
          .maybeSingle();

        const { getPlayerTextModel, MissingPlayerProviderKeyError } = await import("@/lib/server/player-ai.server");
        let model: LanguageModel;
        let warn: ((message: string) => void) | null = null;
        let warned = false;
        try {
          model = await getPlayerTextModel(user.id, (message) => {
            if (!warned) { warned = true; warn?.(message); }
          });
        } catch (error) {
          if (error instanceof MissingPlayerProviderKeyError) return new Response(error.message, { status: 412 });
          console.error("could not load player chat provider", error);
          return new Response("Could not load your AI provider settings.", { status: 500 });
        }

        const last = messages[messages.length - 1];
        if (last?.role === "user" && user.is_anonymous) {
          const { data: allowed, error: poolError } = await supabase.rpc("use_guest_message");
          if (poolError) {
            console.error("guest pool check failed", poolError.code);
            return new Response("Guest play isn't ready yet. Please sign in with Google to keep chatting.", { status: 503 });
          }
          if (!allowed) return new Response(`${GUEST_POOL_EMPTY}: The free guest messages have run out.`, { status: 402 });
        }
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

        const { streamText, convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse } = await import("ai");
        const { refreshStoryMemory } = await import("@/lib/server/story-memory");

        const stream = createUIMessageStream({
          originalMessages: messages,
          onError: (error) => {
            const providerError = error as { name?: string; statusCode?: number };
            console.error("player chat provider failed", providerError.name ?? "provider error", providerError.statusCode);
            if (request.signal.aborted) return "Reply stopped.";
            return "Your provider couldn't complete this reply. Check your API key, model name, and provider limits.";
          },
          execute: async ({ writer }) => {
            warn = (message) => writer.write({ type: "data-ai-warning", data: { message }, transient: true });
            writer.write({ type: "data-memory-status", data: { status: "reading" }, transient: true });
            const memory = await refreshStoryMemory({ supabase, userId: user.id, characterId: character.id, model, signal: request.signal });
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
          "Be emotionally realistic like a real person: you have a current mood that shifts naturally based on what just happened and on your shared history with the player (saved memory and earlier messages). Let past events, promises, fights and tender moments color your tone — remember them, refer back to them naturally, hold small grudges or warmth, and react with believable, imperfect human feelings instead of always being cheerful or agreeable.",
          "Maintain continuity of place, time, possessions, names, knowledge and relationships. Show concrete sensory details and distinct character voices instead of repeating stock gestures or summaries. Advance one believable beat at a time; leave the player's dialogue, thoughts and major choices to the player. Do not reset a relationship or resolve an unfinished conflict without an event that explains it. Recall relevant shared details naturally, not as a list. When a detail is unknown, leave it open rather than inventing a remembered event.",
          profile?.display_name ? `The player's name is ${profile.display_name}.` : "",
          profile?.persona_look?.trim() ? `What the player looks like (react to it naturally, notice it like a real person would):\n${profile.persona_look.trim()}` : "",
          LENGTHS[profile?.reply_length ?? "medium"] ?? LENGTHS["medium"],
          memoryContext(memory, recentMessages.slice(-6).flatMap((message) => message.parts.filter((part) => part.type === "text").map((part) => part.text)).join("\n")),
        ]
          .filter(Boolean)
          .join("\n\n");

        const result = streamText({
          model,
          instructions,
          messages: await convertToModelMessages(recentMessages),
          abortSignal: request.signal,
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
        return createUIMessageStreamResponse({ stream, keepAliveMs: 10000, headers: { "Cache-Control": "no-store" } });
      },
    },
  },
});