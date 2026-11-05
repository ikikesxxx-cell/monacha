import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Character } from "@/lib/api";
import { ownerQuery } from "@/lib/owner";
import { isReviewDue } from "@/lib/photo-learning";
import { reviewQuery } from "./review";

export const charactersQuery = queryOptions({
  queryKey: ["characters"],
  queryFn: async () => {
    const { data, error } = await supabase.from("characters").select("*").order("created_at", { ascending: true });
    if (error) throw error;
    return data as Character[];
  },
});

export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null,
});

export const Route = createFileRoute("/_authenticated/characters")({
  head: () => ({
    meta: [
      { title: "Your characters — Hearthtalk" },
      { name: "description", content: "Pick an AI character to chat with or create your own." },
      { property: "og:title", content: "Your characters — Hearthtalk" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:description", content: "Pick an AI character to chat with or create your own." },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(charactersQuery),
      context.queryClient.ensureQueryData(meQuery),
      context.queryClient.ensureQueryData(reviewQuery).catch(() => null),
    ]),
  component: CharactersPage,
});

const tints = ["bg-peach", "bg-mint", "bg-lavender", "bg-butter"];

function CharactersPage() {
  const { data } = useSuspenseQuery(charactersQuery);
  const { data: review } = useSuspenseQuery(reviewQuery);
  const due = isReviewDue(review.lastReviewAt, review.pending.length);
  const { data: me } = useSuspenseQuery(meQuery);
  const qc = useQueryClient();
  const live = data.filter((c) => !c.deleted_at);
  const trash = data.filter((c) => c.deleted_at && c.owner_id === me);
  const mine = live.filter((c) => c.owner_id && c.owner_id === me);
  const community = live.filter((c) => c.owner_id && c.owner_id !== me);
  const starters = live.filter((c) => !c.owner_id);
  async function restore(id: string) {
    const { error } = await supabase.from("characters").update({ deleted_at: null }).eq("id", id);
    if (error) { toast.error("Couldn't restore."); return; }
    toast.success("Restored!");
    await qc.invalidateQueries({ queryKey: ["characters"] });
  }
  async function purge(id: string, name: string) {
    if (!confirm(`Delete ${name} forever? This also erases its chats and can't be undone.`)) return;
    const { error } = await supabase.from("characters").delete().eq("id", id);
    if (error) { toast.error("Couldn't delete."); return; }
    await qc.invalidateQueries({ queryKey: ["characters"] });
  }
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      {due && (
        <Link to="/review" className="mb-6 flex items-center justify-between gap-4 rounded-[1.5rem] bg-butter px-5 py-4 shadow-soft">
          <span className="font-semibold">Weekly photo review: {review.pending.length} new photos are waiting for your verdict.</span>
          <span className="rounded-full bg-primary px-4 py-1.5 text-sm font-bold text-primary-foreground">Review</span>
        </Link>
      )}
      <h1 className="text-4xl font-semibold">Who do you want to talk to?</h1>
      <Section title="Your creations">
        <Link
          to="/create"
          className="flex aspect-[3/4] flex-col items-center justify-center gap-3 rounded-[1.75rem] border-2 border-dashed border-primary/40 bg-card/60 text-primary transition hover:bg-card"
        >
          <Plus className="h-10 w-10" />
          <span className="font-display text-lg font-semibold">Create a character</span>
        </Link>
        {mine.map((c, i) => <Card key={c.id} c={c} tint={tints[i % 4]!} />)}
      </Section>
      <Section title="Starter characters">
        {starters.map((c, i) => <Card key={c.id} c={c} tint={tints[(i + 1) % 4]!} />)}
      </Section>
      {community.length > 0 && (
        <Section title="Made by other players">
          {community.map((c, i) => <Card key={c.id} c={c} tint={tints[(i + 2) % 4]!} />)}
        </Section>
      )}
      {trash.length > 0 && (
        <section className="mt-12 rounded-[1.5rem] bg-card/60 p-5">
          <h2 className="mb-3 text-xl font-semibold text-muted-foreground">Trash bin</h2>
          <ul className="space-y-2">
            {trash.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 rounded-xl bg-card px-4 py-2">
                <span className="font-semibold">{c.name}</span>
                <span className="flex gap-2">
                  <button type="button" onClick={() => restore(c.id)} className="flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-sm font-bold text-primary-foreground"><RotateCcw className="h-3.5 w-3.5" /> Restore</button>
                  <button type="button" onClick={() => purge(c.id, c.name)} className="rounded-full px-3 py-1 text-sm text-destructive hover:bg-muted">Delete forever</button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="mb-4 text-xl font-semibold text-muted-foreground">{title}</h2>
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">{children}</div>
    </section>
  );
}

function Card({ c, tint }: { c: Character; tint: string }) {
  return (
    <Link
      to="/chat/$characterId"
      params={{ characterId: c.id }}
      className={`${tint} group rounded-[1.75rem] p-2 pb-4 shadow-soft transition hover:-translate-y-1`}
    >
      <img
        src={c.avatar_url ?? "/images/elara.jpg"}
        alt={c.name}
        loading="lazy"
        className="aspect-square w-full rounded-[1.4rem] object-cover"
      />
      <div className="px-2 pt-3">
        <div className="font-display text-lg font-semibold leading-tight">{c.name}</div>
        <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">{c.tagline}</div>
      </div>
    </Link>
  );
}
