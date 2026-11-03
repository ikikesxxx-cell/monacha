import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Character } from "@/lib/api";

export const Route = createFileRoute("/_authenticated/share/$shareId")({
  head: () => ({
    meta: [
      { title: "Shared chat — Hearthtalk" },
      { name: "description", content: "A character and chat shared with you." },
      { property: "og:title", content: "Shared chat — Hearthtalk" },
      { property: "og:description", content: "A character and chat shared with you." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SharePage,
});

function SharePage() {
  const { shareId } = Route.useParams();
  const q = useQuery({
    queryKey: ["share", shareId],
    queryFn: async () => {
      const { data: share } = await supabase.from("chat_shares").select("*").eq("id", shareId).maybeSingle();
      if (!share) return null;
      const { data: c } = await supabase.from("characters").select("*").eq("id", share.character_id).maybeSingle();
      const { data: msgs } = share.include_history
        ? await supabase.from("messages").select("role,parts").eq("character_id", share.character_id).eq("user_id", share.owner_id).order("created_at")
        : { data: [] };
      return { share, character: c as Character | null, msgs: msgs ?? [] };
    },
  });
  if (q.isLoading) return null;
  if (!q.data?.character) return <main className="mx-auto max-w-xl px-4 py-20 text-center text-muted-foreground">This share link doesn't work anymore.</main>;
  const { character, msgs } = q.data;
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-center gap-4">
        {character.avatar_url && <img src={character.avatar_url} alt="" className="h-20 w-20 rounded-[1.25rem] object-cover shadow-soft" />}
        <div className="flex-1">
          <h1 className="text-3xl font-semibold">{character.name}</h1>
          <p className="text-muted-foreground">{character.tagline}</p>
        </div>
        <Link to="/chat/$characterId" params={{ characterId: character.id }} className="rounded-full bg-primary px-4 py-2 font-semibold text-primary-foreground">Start my own chat</Link>
      </div>
      <div className="mt-8 space-y-3 rounded-[1.5rem] bg-card p-5 shadow-soft">
        {msgs.length === 0 ? (
          <p className="text-muted-foreground">Shared without chat history.</p>
        ) : (
          msgs.map((m, i) => (
            <p key={i} className={m.role === "user" ? "" : "text-muted-foreground"}>
              <b>{m.role === "user" ? "Player" : character.name}:</b>{" "}
              {Array.isArray(m.parts) ? (m.parts as { type?: string; text?: string }[]).map((p) => (p.type === "text" ? p.text : "")).join(" ") : ""}
            </p>
          ))
        )}
      </div>
    </main>
  );
}
