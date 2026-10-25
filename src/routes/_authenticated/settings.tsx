import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const profileQuery = queryOptions({
  queryKey: ["profile"],
  queryFn: async () => {
    const { data: u } = await supabase.auth.getUser();
    const { data } = await supabase.from("profiles").select("*").eq("id", u.user!.id).maybeSingle();
    return { id: u.user!.id, email: u.user!.email, display_name: data?.display_name ?? "", reply_length: data?.reply_length ?? "medium" };
  },
});

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Hearthtalk" },
      { name: "description", content: "Change your name, reply length and account options." },
      { property: "og:title", content: "Settings — Hearthtalk" },
      { property: "og:description", content: "Change your name, reply length and account options." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(profileQuery),
  component: SettingsPage,
});

const lengths = [
  { v: "short", l: "Short" },
  { v: "medium", l: "Medium" },
  { v: "long", l: "Long" },
];

function SettingsPage() {
  const { data } = useSuspenseQuery(profileQuery);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState(data.display_name);
  const [len, setLen] = useState(data.reply_length);

  async function save() {
    const { error } = await supabase.from("profiles").upsert({ id: data.id, display_name: name.trim(), reply_length: len });
    if (error) { toast.error("Couldn't save settings."); return; }
    qc.invalidateQueries({ queryKey: ["profile"] });
    toast.success("Settings saved");
  }

  async function clearChats() {
    if (!confirm("Delete all your chat history and story memories?")) return;
    const { error } = await supabase.from("messages").delete().eq("user_id", data.id);
    if (error) { toast.error("Couldn't clear chats."); return; }
    qc.removeQueries({ queryKey: ["messages"] });
    toast.success("All chats cleared");
  }

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-4xl font-semibold">Settings</h1>
      <div className="mt-6 space-y-6 rounded-[2rem] border border-border bg-card/90 p-6 shadow-soft">
        <div className="space-y-2">
          <Label htmlFor="dn">Your name (characters will call you this)</Label>
          <Input id="dn" value={name} onChange={(e) => setName(e.target.value)} />
          <p className="text-xs text-muted-foreground">Signed in as {data.email}</p>
        </div>
        <div className="space-y-2">
          <Label>Reply length</Label>
          <div className="flex gap-2">
            {lengths.map((o) => (
              <Button key={o.v} type="button" variant={len === o.v ? "default" : "outline"} className="flex-1 rounded-full" onClick={() => setLen(o.v)}>
                {o.l}
              </Button>
            ))}
          </div>
        </div>
        <Button onClick={save} className="w-full rounded-full">Save settings</Button>
      </div>
      <div className="mt-6 flex flex-col gap-3 rounded-[2rem] border border-border bg-card/90 p-6 shadow-soft">
        <Button variant="outline" className="rounded-full" onClick={clearChats}>Clear all chat history</Button>
        <Button variant="destructive" className="rounded-full" onClick={signOut}>Sign out</Button>
      </div>
    </main>
  );
}
