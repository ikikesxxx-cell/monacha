import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Globe } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Character } from "@/lib/api";

export const publicCharactersQuery = queryOptions({
  queryKey: ["public-characters"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("characters")
      .select("*")
      .eq("is_public", true)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data as Character[];
  },
});

export const Route = createFileRoute("/_authenticated/chats")({
  head: () => ({
    meta: [
      { title: "Chats — Hearthtalk" },
      { name: "description", content: "Browse every published character and start a chat." },
      { property: "og:title", content: "Chats — Hearthtalk" },
      { property: "og:description", content: "Browse every published character and start a chat." },
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
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="flex items-center gap-2 text-4xl font-semibold">
        <Globe className="h-8 w-8" /> Chats
      </h1>
      <p className="mt-2 text-muted-foreground">
        Every published character, made by all players. Scroll, pick one, and start talking.
      </p>
      {data.length === 0 ? (
        <div className="mt-10 rounded-[1.5rem] bg-card p-8 text-center shadow-soft">
          <p className="font-semibold">Nothing published yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a character and flip it to Public — it will show up here for everyone.
          </p>
          <Link
            to="/create"
            className="mt-4 inline-block rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground"
          >
            Create a character
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
          {data.map((c, i) => (
            <Link
              key={c.id}
              to="/chat/$characterId"
              params={{ characterId: c.id }}
              className={`${tints[i % 4]} group rounded-[1.75rem] p-2 pb-4 shadow-soft transition hover:-translate-y-1`}
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
          ))}
        </div>
      )}
    </main>
  );
}
