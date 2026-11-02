import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Lock, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ownerQuery } from "./characters";

type Item = { id: string; body: string; image_url: string | null; created_at: string };

const vaultQuery = queryOptions({
  queryKey: ["vault"],
  queryFn: async () => {
    const { data, error } = await supabase.from("vault_items").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data as Item[];
  },
});

export const Route = createFileRoute("/_authenticated/vault")({
  head: () => ({
    meta: [
      { title: "Owner vault — Hearthtalk" },
      { name: "description", content: "Private owner-only notes and photos." },
      { property: "og:title", content: "Owner vault — Hearthtalk" },
      { property: "og:description", content: "Private owner-only notes and photos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VaultPage,
});

function VaultPage() {
  const qc = useQueryClient();
  const owner = useQuery(ownerQuery);
  const items = useQuery({ ...vaultQuery, enabled: owner.data === true });
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  if (owner.isLoading) return null;
  if (!owner.data)
    return <main className="mx-auto max-w-xl px-4 py-20 text-center text-muted-foreground">This page doesn't exist.</main>;

  async function add() {
    if (!text.trim() && !file) return;
    setBusy(true);
    try {
      let image_url: string | null = null;
      if (file) {
        const { data: u } = await supabase.auth.getUser();
        const path = `${u.user!.id}/vault/${crypto.randomUUID()}-${file.name}`;
        const up = await supabase.storage.from("avatars").upload(path, file);
        if (up.error) throw up.error;
        const signed = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
        image_url = signed.data?.signedUrl ?? null;
      }
      const { error } = await supabase.from("vault_items").insert({ body: text.trim(), image_url });
      if (error) throw error;
      setText(""); setFile(null);
      qc.invalidateQueries({ queryKey: ["vault"] });
    } catch (e) {
      toast.error((e as Error).message || "Couldn't save.");
    } finally { setBusy(false); }
  }

  async function remove(id: string) {
    await supabase.from("vault_items").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["vault"] });
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="flex items-center gap-2 text-3xl font-semibold"><Lock className="h-6 w-6" /> Owner vault</h1>
      <p className="mt-1 text-muted-foreground">Only you can see this. Keep notes, ideas and photos here.</p>
      <div className="mt-6 space-y-3 rounded-[1.5rem] bg-card p-5 shadow-soft">
        <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a note or idea…" />
        <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
        <Button onClick={add} disabled={busy} className="rounded-full">{busy ? "Saving…" : "Save to vault"}</Button>
      </div>
      <div className="mt-8 space-y-4">
        {(items.data ?? []).map((it) => (
          <div key={it.id} className="rounded-[1.5rem] bg-card p-4 shadow-soft">
            {it.image_url && <img src={it.image_url} alt="" className="mb-3 max-h-96 rounded-xl object-contain" />}
            {it.body && <p className="whitespace-pre-wrap">{it.body}</p>}
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              {new Date(it.created_at).toLocaleString()}
              <button onClick={() => remove(it.id)} aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
