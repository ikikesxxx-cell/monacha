import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Character } from "@/lib/api";
import { ownerQuery } from "@/lib/owner";

const sharedQuery = queryOptions({
  queryKey: ["owner-shared"],
  queryFn: async () => {
    const [{ data: chars, error }, { data: msgs, error: e2 }] = await Promise.all([
      supabase.from("characters").select("*").not("owner_id", "is", null).is("deleted_at", null).order("created_at"),
      supabase.from("messages").select("character_id,user_id,role,parts,created_at").order("created_at"),
    ]);
    if (error) throw error;
    if (e2) throw e2;
    return { chars: (chars ?? []) as Character[], msgs: msgs ?? [] };
  },
});

export const Route = createFileRoute("/_authenticated/shared")({
  head: () => ({
    meta: [
      { title: "Shared owner tab — Hearthtalk" },
      { name: "description", content: "Everything from both owner accounts in one place." },
      { property: "og:title", content: "Shared owner tab — Hearthtalk" },
      { property: "og:description", content: "Everything from both owner accounts in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SharedPage,
});

function textOf(parts: unknown) {
  return Array.isArray(parts) ? parts.map((p: { type?: string; text?: string }) => (p.type === "text" ? p.text : "")).join(" ") : "";
}

function SharedPage() {
  const owner = useQuery(ownerQuery);
  const data = useQuery({ ...sharedQuery, enabled: owner.data === true });
  const [open, setOpen] = useState<string | null>(null);
  if (owner.isLoading) return null;
  if (!owner.data) return <main className="mx-auto max-w-xl px-4 py-20 text-center text-muted-foreground">This page doesn't exist.</main>;
  const chars = data.data?.chars ?? [];
  const msgs = data.data?.msgs ?? [];
  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="flex items-center gap-2 text-3xl font-semibold"><Users className="h-6 w-6" /> Shared tab</h1>
      <p className="mt-1 text-muted-foreground">Every character and chat from both of your owner accounts, together.</p>
      <div className="mt-6 space-y-4">
        {chars.map((c) => {
          const chat = msgs.filter((m) => m.character_id === c.id);
          return (
            <div key={c.id} className="rounded-[1.5rem] bg-card p-4 shadow-soft">
              <div className="flex items-center gap-3">
                {c.avatar_url && <img src={c.avatar_url} alt="" className="h-12 w-12 rounded-full object-cover" />}
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{c.name}</div>
                  <div className="truncate text-sm text-muted-foreground">{c.tagline} · {chat.length} messages</div>
                </div>
                <Link to="/chat/$characterId" params={{ characterId: c.id }} className="rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground">Chat</Link>
                {chat.length > 0 && (
                  <button className="text-sm underline" onClick={() => setOpen(open === c.id ? null : c.id)}>
                    {open === c.id ? "Hide history" : "Show history"}
                  </button>
                )}
              </div>
              {open === c.id && (
                <div className="mt-3 max-h-96 space-y-2 overflow-y-auto border-t border-border pt-3 text-sm">
                  {chat.map((m, i) => (
                    <p key={i} className={m.role === "user" ? "text-foreground" : "text-muted-foreground"}>
                      <b>{m.role === "user" ? "You" : c.name}:</b> {textOf(m.parts)}
                    </p>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
