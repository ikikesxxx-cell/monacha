import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useState } from "react";
import { PhotoWindow } from "@/components/PhotoWindow";
import { detectMood, music, trackFor } from "@/lib/music";
import { toast } from "sonner";
import { ArrowLeft, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { authHeaders, type Character } from "@/lib/api";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputFooter, PromptInputSubmit, PromptInputTextarea } from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import { StoryMemory } from "@/components/StoryMemory";
import { EMPTY_MEMORY, normalizeMemory, type StoryMemory as Memory } from "@/lib/conversation-memory";

const chatQuery = (id: string) =>
  queryOptions({
    queryKey: ["messages", id],
    queryFn: async () => {
      const [{ data: c, error }, { data: rows }, { data: memory }] = await Promise.all([
        supabase.from("characters").select("*").eq("id", id).single(),
        supabase.from("messages").select("ui_id,role,parts").eq("character_id", id).order("created_at"),
        supabase.from("conversation_memories").select("facts,summary").eq("character_id", id).maybeSingle(),
      ]);
      if (error) throw error;
      const messages = (rows ?? []).map((r) => ({ id: r.ui_id, role: r.role, parts: r.parts }) as UIMessage);
      return { character: c as Character, messages, memory: memory ? normalizeMemory(memory) : EMPTY_MEMORY };
    },
  });

export const Route = createFileRoute("/_authenticated/chat/$characterId")({
  head: () => ({
    meta: [
      { title: "Chat — Hearthtalk" },
      { name: "description", content: "Chat and play stories with your AI character." },
      { property: "og:title", content: "Chat — Hearthtalk" },
      { property: "og:description", content: "Chat and play stories with your AI character." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(chatQuery(params.characterId)),
  component: ChatPage,
});

function ChatPage() {
  const { characterId } = Route.useParams();
  const { data } = useSuspenseQuery(chatQuery(characterId));
  return <ChatWindow key={characterId} character={data.character} initial={data.messages} initialMemory={data.memory} />;
}

function ChatWindow({ character, initial, initialMemory }: { character: Character; initial: UIMessage[]; initialMemory: Memory }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [memory, setMemory] = useState(initialMemory);
  const [readingMemory, setReadingMemory] = useState(false);
  const transport = useMemo(
    () => new DefaultChatTransport({
      api: "/api/chat", headers: authHeaders,
      prepareSendMessagesRequest: ({ messages }) => ({ body: { characterId: character.id, messages: messages.slice(-1) } }),
    }),
    [character.id],
  );
  const { messages, sendMessage, status, stop, setMessages } = useChat({
    id: character.id,
    messages: initial,
    transport,
    onData: (part) => {
      if (part.type === "data-memory-status") setReadingMemory(true);
      if (part.type === "data-story-memory") { setMemory(normalizeMemory(part.data)); setReadingMemory(false); }
    },
    onError: (e) => { setReadingMemory(false); toast.error(e.message || "Something went wrong."); },
    onFinish: () => qc.invalidateQueries({ queryKey: ["messages", character.id] }),
  });
  const busy = status === "submitted" || status === "streaming";
  const entity = character.avatar_kind === "none";
  const avatar = entity ? null : (character.avatar_url ?? "/images/elara.jpg");
  const [pip, setPip] = useState(false);
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const lastText = lastAssistant?.parts.map((p) => (p.type === "text" ? p.text : "")).join(" ") ?? "";
  useEffect(() => {
    if (status === "streaming") return;
    music.set({ track: trackFor(character.music, detectMood(lastText)) });
  }, [lastText, status, character.music]);

  async function restart() {
    if (!confirm("Start over? This clears this conversation and its story memory.")) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { toast.error("Please sign in again."); return; }
    const { error } = await supabase.from("messages").delete().eq("character_id", character.id).eq("user_id", u.user.id);
    if (error) { toast.error("Couldn't clear the chat."); return; }
    setMessages([]);
    setMemory(EMPTY_MEMORY);
    qc.invalidateQueries({ queryKey: ["messages", character.id] });
  }

  async function remove() {
    if (!confirm(`Delete ${character.name} forever?`)) return;
    const { error } = await supabase.from("characters").delete().eq("id", character.id);
    if (error) { toast.error("Couldn't delete."); return; }
    await qc.invalidateQueries({ queryKey: ["characters"] });
    navigate({ to: "/characters" });
  }

  return (
    <main className="mx-auto flex h-[calc(100vh-65px)] max-w-3xl flex-col px-4">
      <div className="flex items-center gap-3 py-4">
        <Button asChild variant="ghost" size="icon" className="rounded-full">
          <Link to="/characters" aria-label="Back"><ArrowLeft className="h-5 w-5" /></Link>
        </Button>
        {avatar ? (
          <button type="button" onClick={() => setPip(true)} aria-label="Open photo">
            <img src={avatar} alt="" className="h-12 w-12 rounded-full object-cover shadow-soft" />
          </button>
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-lavender shadow-soft"><Sparkles className="h-5 w-5 text-primary" /></div>
        )}
        <div className="min-w-0 flex-1">
          <div className="font-display text-xl font-semibold leading-tight">{character.name}</div>
          <div className="truncate text-sm text-muted-foreground">{character.tagline}</div>
        </div>
        <StoryMemory memory={memory} />
        <Button variant="ghost" size="icon" className="rounded-full" onClick={restart} disabled={busy} aria-label="Start over">
          <RotateCcw className="h-5 w-5" />
        </Button>
        {character.owner_id && (
          <Button variant="ghost" size="icon" className="rounded-full" onClick={remove} disabled={busy} aria-label="Delete character">
            <Trash2 className="h-5 w-5" />
          </Button>
        )}
      </div>

      <Conversation className="flex-1 rounded-[2rem] border border-border bg-card/70">
        <ConversationContent>
          {messages.length === 0 && (
            <div className="flex flex-col items-center py-12 text-center">
              {avatar && <img src={avatar} alt={character.name} className="h-32 w-32 rounded-[1.75rem] object-cover shadow-soft" />}
              <p className="mt-4 max-w-sm text-muted-foreground">
                Say hello to {character.name} — or describe a scene and start your story.
              </p>
            </div>
          )}
          {messages.map((m) => (
            <Message key={m.id} from={m.role}>
              {m.role === "assistant" && avatar && <img src={avatar} alt="" className="h-8 w-8 shrink-0 self-start rounded-full object-cover" />}
              <MessageContent>
                {m.parts.map((p, i) =>
                  p.type === "text" ? <MessageResponse key={i}>{p.text}</MessageResponse> : null,
                )}
              </MessageContent>
            </Message>
          ))}
          {status === "submitted" && (
            <div className="flex items-center gap-3">
              {avatar && <img src={avatar} alt="" className="h-8 w-8 rounded-full object-cover" />}
              <Shimmer>{readingMemory ? "Reading story memory…" : `${character.name} is thinking…`}</Shimmer>
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="py-4">
        <PromptInput
          onSubmit={(msg) => {
            const t = msg.text?.trim();
            if (!t || busy) return;
            sendMessage({ text: t });
            setText("");
          }}
          className="rounded-[1.5rem] bg-card shadow-soft"
        >
          <PromptInputTextarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Message ${character.name}…`}
          />
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit status={status} onStop={stop} disabled={!busy && !text.trim()} />
          </PromptInputFooter>
        </PromptInput>
      </div>
      {pip && avatar && <PhotoWindow src={avatar} title={character.name} onClose={() => setPip(false)} />}
    </main>
  );
}
