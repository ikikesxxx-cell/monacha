import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Wand2, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { authHeaders } from "@/lib/api";
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
  component: CreatePage,
});

const ideas = [
  "a fluffy orange cat wearing a tiny knitted scarf",
  "an elderly fisherman with a white beard on a misty dock",
  "a young knight with freckles in silver armor",
];

function CreatePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [behavior, setBehavior] = useState("");
  const [photoPrompt, setPhotoPrompt] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [reference, setReference] = useState<File | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  async function generate() {
    setGenerating(true);
    try {
      const form = new FormData();
      form.set("prompt", photoPrompt);
      if (reference) form.set("reference", reference);
      const res = await fetch("/api/avatar", {
        method: "POST",
        headers: await authHeaders(),
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Photo generation failed.");
      setPhoto(json.url);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function save() {
    if (!name.trim() || !behavior.trim()) return toast.error("Give your character a name and a behavior.");
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("characters")
      .insert({ owner_id: u.user!.id, name: name.trim(), tagline: tagline.trim(), behavior: behavior.trim(), avatar_url: photo })
      .select("id")
      .single();
    setSaving(false);
    if (error) return toast.error("Couldn't save the character.");
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
              {generating ? <Loader2 className="h-10 w-10 animate-spin" /> : "Your character's photo appears here"}
            </div>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="pp">Describe the photo (human, animal, anything)</Label>
          <Textarea id="pp" value={photoPrompt} onChange={(e) => setPhotoPrompt(e.target.value)} placeholder={ideas[0]} rows={3} />
          <div className="flex flex-wrap gap-1.5">
            {ideas.map((i) => (
              <button key={i} type="button" onClick={() => setPhotoPrompt(i)} className="rounded-full bg-card px-3 py-1 text-xs text-muted-foreground hover:text-foreground">
                {i}
              </button>
            ))}
          </div>
          <Button onClick={generate} disabled={generating || photoPrompt.trim().length < 3} variant="secondary" className="w-full rounded-full">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            {generating ? "Creating photo…" : photo ? "Make another photo" : "Generate photo"}
          </Button>
        </div>
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
