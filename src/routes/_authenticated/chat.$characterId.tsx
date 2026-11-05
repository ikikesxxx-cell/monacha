import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PhotoWindow } from "@/components/PhotoWindow";
import { detectMood, music, trackFor } from "@/lib/music";
import { toast } from "sonner";
import { ArrowLeft, Camera, RotateCcw, Share2, Sparkles, Trash2, UserRound, Lightbulb } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { authHeaders, type Character } from "@/lib/api";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputFooter, PromptInputSubmit, PromptInputTextarea } from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import { StoryMemory } from "@/components/StoryMemory";
import { EMPTY_MEMORY, normalizeMemory, type StoryMemory as Memory } from "@/lib/conversation-memory";

async function getChatUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("Please sign in again to view this conversation.");
  return data.user.id;
}

const chatQuery = (id: string, userId: string) =>
  queryOptions({
    queryKey: ["messages", userId, id],
    queryFn: async () => {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (authData.user?.id !== userId) throw new Error("Your account changed. Refresh to reload this conversation.");
      const [
        { data: c, error: characterError },
        { data: rows, error: messagesError },
        { data: memory, error: memoryError },
      ] = await Promise.all([
        supabase.from("characters").select("*").eq("id", id).single(),
        supabase.from("messages").select("ui_id,role,parts").eq("user_id", userId).eq("character_id", id).order("created_at"),
        supabase.from("conversation_memories").select("facts,summary").eq("user_id", userId).eq("character_id", id).maybeSingle(),
      ]);
      if (characterError) throw characterError;
      if (messagesError) throw messagesError;
      if (memoryError) throw memoryError;
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
  loader: async ({ context, params }) => {
    const userId = await getChatUserId();
    await context.queryClient.ensureQueryData(chatQuery(params.characterId, userId));
    return userId;
  },
  component: ChatPage,
});

function ChatPage() {
  const { characterId } = Route.useParams();
  const userId = Route.useLoaderData();
  const { data } = useSuspenseQuery(chatQuery(characterId, userId));
  return <ChatWindow key={characterId} character={data.character} initial={data.messages} initialMemory={data.memory} />;
}

function ChatWindow({ character, initial, initialMemory }: { character: Character; initial: UIMessage[]; initialMemory: Memory }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [memory, setMemory] = useState(initialMemory);
  const [readingMemory, setReadingMemory] = useState(false);
  const [sceneUrl, setSceneUrl] = useState<string | null>(null);
  const [sceneSetupNeeded, setSceneSetupNeeded] = useState(false);
  const [sceneError, setSceneError] = useState<string | null>(null);
  const requestedLocation = useRef<string | null>(null);
  const loadScene = useCallback(async (nextMemory: Memory) => {
    const location = nextMemory.facts.find((fact) => fact.key === "player.location")?.detail.trim();
    if (!location) {
      requestedLocation.current = null;
      setSceneUrl(null);
      setSceneSetupNeeded(false);
      setSceneError(null);
      return;
    }
    if (location === requestedLocation.current) return;
    requestedLocation.current = location;
    setSceneUrl(null);
    setSceneSetupNeeded(false);
    setSceneError(null);
    try {
      const response = await fetch("/api/scene", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ characterId: character.id }),
      });
      if (response.status === 412) {
        if (requestedLocation.current !== location) return;
        setSceneSetupNeeded(true);
        setSceneError(null);
        return;
      }
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { error?: string } | null;
        if (requestedLocation.current !== location) return;
        setSceneError(result?.error ?? "Could not load the scene background.");
        return;
      }
      const result = (await response.json()) as { url?: string | null };
      if (requestedLocation.current === location) {
        setSceneUrl(result.url ?? null);
        setSceneError(null);
        setSceneSetupNeeded(false);
      }
    } catch (error) {
      console.error("could not load scene background", error instanceof Error ? error.name : "request error");
      if (requestedLocation.current === location) setSceneError("Could not load the scene background.");
    }
  }, [character.id]);
  useEffect(() => { void loadScene(initialMemory); }, [initialMemory, loadScene]);
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
      if (part.type === "data-ai-warning") toast.warning(String((part.data as { message?: string })?.message ?? ""));
      if (part.type === "data-story-memory") {
        const nextMemory = normalizeMemory(part.data);
        setMemory(nextMemory);
        setReadingMemory(false);
        void loadScene(nextMemory);
      }
    },
    onError: (e) => { setReadingMemory(false); toast.error(e.message || "Something went wrong."); },
    onFinish: () => { qc.invalidateQueries({ queryKey: ["messages", character.id] }); void loadSuggestions(); },
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

  const [snap, setSnap] = useState<string | null>(null);
  const [snapping, setSnapping] = useState(false);
  const [camMenu, setCamMenu] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  async function loadSuggestions() {
    setSuggesting(true);
    try {
      const res = await fetch("/api/suggest", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify({ characterId: character.id }) });
      const out = (await res.json().catch(() => ({}))) as { suggestions?: string[] };
      setSuggestions(out.suggestions ?? []);
    } catch { setSuggestions([]); } finally { setSuggesting(false); }
  }
  const [personaOpen, setPersonaOpen] = useState(false);
  const [persona, setPersona] = useState("");
  useEffect(() => {
    void (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase.from("profiles").select("persona_look").eq("id", u.user.id).maybeSingle();
      setPersona(data?.persona_look ?? "");
    })();
  }, []);
  async function savePersona() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("profiles").update({ persona_look: persona.slice(0, 1000) }).eq("id", u.user.id);
    if (error) { toast.error("Couldn't save your look."); return; }
    toast.success("Saved — characters now know what you look like.");
    setPersonaOpen(false);
  }
  async function takePhoto(view: "portrait" | "two-shot" | "scene") {
    setCamMenu(false);
    setSnapping(true);
    try {
      const recentText = messages.slice(-4).map((m) => m.parts.map((p) => (p.type === "text" ? p.text : "")).join(" ")).join(" ").slice(-700);
      const form = new FormData();
      const look = `${character.name}. Appearance and personality: ${character.behavior.slice(0, 600)}.`;
      const moment = `Current moment in the story: ${recentText}`;
      const framing = view === "portrait"
        ? `First-person POV close portrait looking straight at ${look} ${moment}`
        : view === "two-shot"
          ? `Two people together in one candid photo: ${look} Together with the player, who looks like: ${persona.trim() || "an ordinary adult"}. ${moment}`
          : `Wide cinematic establishing shot of the surroundings, environment, weather and atmosphere, the character small in frame: ${look} ${moment}`;
      form.set("prompt", framing);
      const res = await fetch("/api/avatar", { method: "POST", headers: await authHeaders(), body: form });
      const out = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !out.url) throw new Error(out.error ?? "Photo failed.");
      setSnap(out.url);
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setSnapping(false); }
  }

  async function share() {
    const withHistory = confirm("Share WITH the chat history?\n\nOK = with history · Cancel = character only");
    const { data, error } = await supabase.from("chat_shares").insert({ character_id: character.id, include_history: withHistory }).select("id").single();
    if (error || !data) { toast.error("Only the maker of this character can share it."); return; }
    const url = `${window.location.origin}/share/${data.id}`;
    await navigator.clipboard.writeText(url).catch(() => {});
    toast.success(`Share link copied${withHistory ? " (with history)" : ""}: ${url}`);
  }

  async function remove() {
    if (!confirm(`Move ${character.name} to the trash? You can restore it from your characters page.`)) return;
    const { error } = await supabase.from("characters").update({ deleted_at: new Date().toISOString() }).eq("id", character.id);
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
        <Button variant="ghost" size="icon" className="rounded-full" onClick={() => setPersonaOpen((v) => !v)} aria-label="Your look">
          <UserRound className="h-5 w-5" />
        </Button>
        <div className="relative">
          <Button variant="ghost" size="icon" className="rounded-full" onClick={() => setCamMenu((v) => !v)} disabled={snapping} aria-label="Take a photo of this moment">
            <Camera className={`h-5 w-5 ${snapping ? "animate-pulse" : ""}`} />
          </Button>
          {camMenu && (
            <div className="absolute right-0 z-20 mt-2 w-52 rounded-2xl border border-border bg-popover p-1 shadow-soft">
              {([["portrait", "Portrait (your eyes)"], ["two-shot", "Two-shot (you + them)"], ["scene", "Cinematic scene"]] as const).map(([v, l]) => (
                <button key={v} type="button" onClick={() => takePhoto(v)} className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-muted">{l}</button>
              ))}
            </div>
          )}
        </div>
        {character.owner_id && (
          <Button variant="ghost" size="icon" className="rounded-full" onClick={share} aria-label="Share this chat">
            <Share2 className="h-5 w-5" />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="rounded-full" onClick={restart} disabled={busy} aria-label="Start over">
          <RotateCcw className="h-5 w-5" />
        </Button>
        {character.owner_id && (
          <Button variant="ghost" size="icon" className="rounded-full" onClick={remove} disabled={busy} aria-label="Delete character">
            <Trash2 className="h-5 w-5" />
          </Button>
        )}
      </div>
      {personaOpen && (
        <div className="mb-3 rounded-2xl bg-card p-3 shadow-soft">
          <label htmlFor="persona" className="text-sm font-semibold">Your look (characters see this, and it's used in two-shot photos)</label>
          <textarea id="persona" value={persona} onChange={(e) => setPersona(e.target.value)} rows={3} maxLength={1000}
            placeholder="e.g. 24, tall, messy black hair, freckles, grey hoodie, scar on left eyebrow"
            className="mt-2 w-full rounded-xl border border-border bg-background p-2 text-sm" />
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" className="rounded-full" onClick={() => setPersonaOpen(false)}>Close</Button>
            <Button size="sm" className="rounded-full" onClick={savePersona}>Save</Button>
          </div>
        </div>
      )}
      {sceneSetupNeeded && (
        <p className="mb-2 text-center text-xs text-muted-foreground">
          Add a Pollinations key in <Link to="/settings" className="underline">Settings</Link> to enable scene backgrounds.
        </p>
      )}
      {!sceneSetupNeeded && sceneError && (
        <p className="mb-2 text-center text-xs text-muted-foreground">
          {sceneError} Check your <Link to="/settings" className="underline">provider settings</Link>.
        </p>
      )}

      <Conversation
        className={`flex-1 rounded-[2rem] border border-border ${sceneUrl ? "bg-cover bg-center" : "bg-card/70"}`}
        style={sceneUrl ? {
          backgroundImage: `linear-gradient(to bottom, rgb(0 0 0 / 45%), rgb(0 0 0 / 55%)), url("${sceneUrl}")`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        } : undefined}
      >
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
        {!busy && messages.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {suggestions.map((sug) => (
              <button key={sug} type="button" onClick={() => { setSuggestions([]); sendMessage({ text: sug }); }}
                className="rounded-full bg-card px-3 py-1.5 text-sm shadow-soft hover:bg-muted">{sug}</button>
            ))}
            <button type="button" onClick={loadSuggestions} disabled={suggesting}
              className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted">
              <Lightbulb className={`h-3.5 w-3.5 ${suggesting ? "animate-pulse" : ""}`} /> {suggestions.length ? "New ideas" : "Ideas"}
            </button>
          </div>
        )}
        <PromptInput
          onSubmit={(msg) => {
            const t = msg.text?.trim();
            if (!t || busy) return;
            sendMessage({ text: t });
            setSuggestions([]);
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
      {snap && <PhotoWindow src={snap} title={`${character.name} — this moment`} onClose={() => setSnap(null)} />}
      {pip && avatar && <PhotoWindow src={avatar} title={character.name} onClose={() => setPip(false)} />}
    </main>
  );
}
