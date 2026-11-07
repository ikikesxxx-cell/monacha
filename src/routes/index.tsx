import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { claimGuestProgress, startGuest } from "@/lib/guest";
import type { Character } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { GoogleButton } from "@/components/GoogleButton";
import { Button } from "@/components/ui/button";
import logo from "@/assets/logo.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Hearthtalk — make your own AI characters and chat" },
      {
        name: "description",
        content: "Design AI characters with realistic generated photos, tell them how to behave, and play stories together.",
      },
      { property: "og:title", content: "Hearthtalk — make your own AI characters and chat" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      {
        property: "og:description",
        content: "Design AI characters with realistic generated photos, tell them how to behave, and play stories together.",
      },
    ],
  }),
  component: Index,
});

const faces = [
  { src: "/images/elara.jpg", name: "Elara", bg: "bg-peach", rot: "-rotate-6" },
  { src: "/images/biscuit.jpg", name: "Biscuit", bg: "bg-mint", rot: "rotate-3" },
  { src: "/images/mara.jpg", name: "Captain Mara", bg: "bg-lavender", rot: "-rotate-2" },
];

function Index() {
  const navigate = useNavigate();
  const [signedIn, setSignedIn] = useState(false);
  const [nickname, setNickname] = useState("");
  const [joining, setJoining] = useState(false);
  const [games, setGames] = useState<Character[]>([]);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSignedIn(!!data.session);
      if (data.session && !data.session.user.is_anonymous) void claimGuestProgress();
    });
    supabase.from("characters").select("id,owner_id,name,tagline,behavior,avatar_url,avatar_kind,is_public")
      .is("deleted_at", null).or("owner_id.is.null,is_public.eq.true").order("created_at", { ascending: false }).limit(24)
      .then(({ data }) => setGames((data ?? []) as Character[]));
  }, []);

  async function play(characterId?: string) {
    if (!signedIn) {
      setJoining(true);
      try { await startGuest(nickname); setSignedIn(true); }
      catch (e) { toast.error((e as Error).message); setJoining(false); return; }
      setJoining(false);
    }
    if (characterId) navigate({ to: "/chat/$characterId", params: { characterId } });
    else navigate({ to: "/characters" });
  }

  return (
    <main className="min-h-screen bg-cozy">
      <header className="mx-auto flex max-w-6xl items-center gap-2 px-6 py-5">
        <img src={logo} alt="" width={40} height={40} className="h-10 w-10" />
        <span className="font-display text-2xl font-semibold">Hearthtalk</span>
      </header>
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-8 md:grid-cols-2">
        <div>
          <p className="inline-block rounded-full bg-butter px-4 py-1 text-sm font-bold text-foreground">
            A cozy AI chat game
          </p>
          <h1 className="mt-5 text-5xl font-semibold leading-[1.05] md:text-6xl">
            Dream up a character. Then talk to them.
          </h1>
          <p className="mt-5 max-w-md text-lg text-muted-foreground">
            Generate a realistic photo of any person or animal, tell the AI how to behave, and play — a quiet chat, a
            wild RPG, or a whole cast of people.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {signedIn ? (
              <Button asChild size="lg" className="h-12 rounded-full px-6 text-base shadow-soft">
                <Link to="/characters">Open my characters</Link>
              </Button>
            ) : (
              <GoogleButton label="Start with Google" />
            )}
          </div>
          {!signedIn && (
            <form className="mt-4 flex max-w-md flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void play(); }}>
              <input aria-label="Nickname" value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={30}
                placeholder="Pick a nickname" className="h-12 min-w-0 flex-1 rounded-full border border-border bg-card px-5" />
              <Button type="submit" variant="outline" size="lg" disabled={joining} className="h-12 rounded-full px-6">
                {joining ? "Joining…" : "Play as guest"}
              </Button>
            </form>
          )}
        </div>
        <div className="relative flex justify-center gap-4">
          {faces.map((f, i) => (
            <figure
              key={f.name}
              className={`${f.bg} ${f.rot} w-40 rounded-[1.75rem] p-2 pb-3 shadow-soft md:w-48 ${i === 1 ? "mt-12" : ""}`}
            >
              <img src={f.src} alt={f.name} width={192} height={192} className="aspect-square w-full rounded-[1.4rem] object-cover" />
              <figcaption className="mt-2 text-center font-display font-semibold">{f.name}</figcaption>
            </figure>
          ))}
        </div>
      </section>
      {games.length > 0 && (
        <section className="mx-auto max-w-6xl px-6 pb-20">
          <h2 className="text-3xl font-semibold">Play now</h2>
          {!signedIn && <p className="mt-1 text-muted-foreground">Type a nickname above, then pick a game. No password needed.</p>}
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {games.map((g) => (
              <button key={g.id} type="button" onClick={() => void play(g.id)} disabled={joining}
                className="rounded-[1.5rem] bg-card p-3 text-left shadow-soft transition-transform hover:-translate-y-1">
                {g.avatar_kind !== "none" && (
                  <img src={g.avatar_url ?? "/images/elara.jpg"} alt={g.name} loading="lazy" className="aspect-square w-full rounded-[1.1rem] object-cover" />
                )}
                <div className="mt-2 font-display text-lg font-semibold">{g.name}</div>
                <div className="line-clamp-2 text-sm text-muted-foreground">{g.tagline}</div>
              </button>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
