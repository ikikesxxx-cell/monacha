import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Globe, MessageCircle, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Character } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ProVote } from "@/components/ProVote";

type PublicCharacter = Character & { maker: string };

async function makerNames(ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map<string, string>();
  const { data } = await supabase.rpc("get_maker_names", { _ids: unique });
  return new Map((data ?? []).map((r: { id: string; display_name: string }) => [r.id, r.display_name]));
}

export const publicCharactersQuery = queryOptions({
  queryKey: ["public-characters"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("characters")
      .select("*")
      .eq("is_public", true)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const rows = data as Character[];
    const names = await makerNames(rows.map((c) => c.owner_id ?? ""));
    return rows.map((c) => ({ ...c, maker: names.get(c.owner_id ?? "") ?? "Player" })) as PublicCharacter[];
  },
});

const postsQuery = (characterId: string) =>
  queryOptions({
    queryKey: ["game-posts", characterId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("game_posts")
        .select("id,user_id,body,created_at")
        .eq("character_id", characterId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      const names = await makerNames((data ?? []).map((p) => p.user_id));
      return (data ?? []).map((p) => ({ ...p, author: names.get(p.user_id) ?? "Player" }));
    },
  });

export const Route = createFileRoute("/_authenticated/chats")({
  head: () => ({
    meta: [
      { title: "Chats — Hearthtalk" },
      { name: "description", content: "Browse every published character, see who made it and talk with other players." },
      { property: "og:title", content: "Chats — Hearthtalk" },
      { property: "og:description", content: "Browse every published character, see who made it and talk with other players." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(publicCharactersQuery),
  component: ChatsPage,
});

const tints = ["bg-peach", "bg-mint", "bg-lavender", "bg-butter"];

function ChatsPage() {
  const { data } = useSuspenseQuery(publicCharactersQuery);
  const [open, setOpen] = useState<PublicCharacter | null>(null);
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="flex items-center gap-2 text-4xl font-semibold">
        <Globe className="h-8 w-8" /> Chats
      </h1>
      <p className="mt-2 text-muted-foreground">
        Every published game, made by all players. Tap one to play it or talk with everyone on its public wall.
      </p>
      <ProVote />
      {data.length === 0 ? (
        <div className="mt-10 rounded-[1.5rem] bg-card p-8 text-center shadow-soft">
          <p className="font-semibold">Nothing published yet.</p>
          <Link to="/create" className="mt-4 inline-block rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground">
            Create a character
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
          {data.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setOpen(c)}
              className={`${tints[i % 4]} group rounded-[1.75rem] p-2 pb-4 text-left shadow-soft transition hover:-translate-y-1`}
            >
              <img src={c.avatar_url ?? "/images/elara.jpg"} alt={c.name} loading="lazy" className="aspect-square w-full rounded-[1.4rem] object-cover" />
              <div className="px-2 pt-3">
                <div className="font-display text-lg font-semibold leading-tight">{c.name}</div>
                <div className="mt-0.5 text-xs font-semibold text-primary">by {c.maker}</div>
                <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">{c.tagline}</div>
              </div>
            </button>
          ))}
        </div>
      )}
      {open && <GameHub c={open} onClose={() => setOpen(null)} />}
    </main>
  );
}

function GameHub({ c, onClose }: { c: PublicCharacter; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: posts = [] } = useQuery(postsQuery(c.id));
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null });
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  async function post() {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    const { error } = await supabase.from("game_posts").insert({ character_id: c.id, body: body.slice(0, 1000) });
    setSending(false);
    if (error) { toast.error("Couldn't post your message."); return; }
    setText("");
    qc.invalidateQueries({ queryKey: ["game-posts", c.id] });
  }
  async function remove(id: string) {
    await supabase.from("game_posts").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["game-posts", c.id] });
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-[1.75rem] bg-card p-5 shadow-soft" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <img src={c.avatar_url ?? "/images/elara.jpg"} alt="" className="h-16 w-16 rounded-2xl object-cover" />
          <div className="min-w-0 flex-1">
            <div className="font-display text-xl font-semibold">{c.name}</div>
            <div className="text-sm font-semibold text-primary">Made by {c.maker}</div>
            <div className="line-clamp-2 text-sm text-muted-foreground">{c.tagline}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1 hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>
        <Button asChild className="mt-4 rounded-full">
          <Link to="/chat/$characterId" params={{ characterId: c.id }}><MessageCircle className="mr-1 h-4 w-4" /> Open my chat</Link>
        </Button>
        <h3 className="mt-5 text-sm font-semibold text-muted-foreground">Public wall — everyone can see this</h3>
        <div className="mt-2 flex-1 space-y-2 overflow-y-auto">
          {posts.length === 0 && <p className="text-sm text-muted-foreground">No messages yet. Say something about this game!</p>}
          {posts.map((p) => (
            <div key={p.id} className="rounded-xl bg-muted/60 px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{p.author}</span>
                {p.user_id === me && (
                  <button type="button" onClick={() => remove(p.id)} aria-label="Delete message" className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                )}
              </div>
              <p className="whitespace-pre-wrap">{p.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void post(); }}
            maxLength={1000}
            placeholder="Write on the public wall…"
            className="flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm"
          />
          <Button size="icon" className="rounded-full" onClick={post} disabled={sending || !text.trim()} aria-label="Post"><Send className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  );
}
