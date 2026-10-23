import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Wand2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/create")({
  head: () => ({
    meta: [
      { title: "Create a character — Hearthtalk" },
      { name: "description", content: "Generate a realistic photo and write how your AI character behaves." },
      { property: "og:title", content: "Create a character — Hearthtalk" },
      { property: "og:description", content: "Generate a realistic photo and write how your AI character behaves." },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { photo?: string } =>
    typeof s["photo"] === "string" ? { photo: s["photo"] } : {},
  component: CreatePage,
});

function CreatePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [behavior, setBehavior] = useState("");
  const { photo: photoParam } = Route.useSearch();
  const photo = photoParam ?? null;
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim() || !behavior.trim()) { toast.error("Give your character a name and a behavior."); return; }
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("characters")
      .insert({ owner_id: u.user!.id, name: name.trim(), tagline: tagline.trim(), behavior: behavior.trim(), avatar_url: photo })
      .select("id")
      .single();
    setSaving(false);
    if (error) { toast.error("Couldn't save the character."); return; }
    await qc.invalidateQueries({ queryKey: ["characters"] });
    navigate({ to: "/chat/$characterId", params: { characterId: data.id } });
  }

  return (
    <main className="mx-auto grid max-w-5xl gap-8 px-4 py-10 md:grid-cols-[320px_1fr]">
      <div className="space-y-4">
        <div className="aspect-square overflow-hidden rounded-[1.75rem] bg-lavender shadow-soft">
          {photo ? (
            <img src={photo} alt="Character" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-accent-foreground">
              No photo yet
            </div>
          )}
        </div>
        <Button asChild variant="secondary" className="w-full rounded-full">
          <Link to="/studio">
            <Wand2 className="h-4 w-4" /> {photo ? "Make a different photo" : "Open photo studio"}
          </Link>
        </Button>
      </div>

      <div className="space-y-5 rounded-[2rem] border border-border bg-card/90 p-6 shadow-soft">
        <h1 className="text-3xl font-semibold">Create your AI</h1>
        <div className="space-y-2">
          <Label htmlFor="n">Name</Label>
          <Input id="n" value={name} onChange={(e) => setName(e.target.value)} placeholder="Sir Pemberton" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="t">Short description</Label>
          <Input id="t" value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="A grumpy cat who rules a castle" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="b">How must the AI behave?</Label>
          <Textarea
            id="b"
            rows={9}
            value={behavior}
            onChange={(e) => setBehavior(e.target.value)}
            placeholder="Describe personality, way of talking, the world… You can make it one character, or say it's an RPG game where the AI is the narrator and invents new people as the story goes."
          />
        </div>
        <Button onClick={save} disabled={saving} size="lg" className="w-full rounded-full shadow-soft">
          {saving ? "Saving…" : "Save & start chatting"}
        </Button>
      </div>
    </main>
  );
}
