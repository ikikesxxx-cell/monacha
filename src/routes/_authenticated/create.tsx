import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Wand2, Sparkles, Loader2, PenLine, MessagesSquare } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MOODS } from "@/lib/music";
import { authHeaders } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/create")({
  head: () => ({
    meta: [
      { title: "Create a character — Hearthtalk" },
      { name: "description", content: "Generate a realistic photo and write how your AI character behaves." },
      { property: "og:title", content: "Create a character — Hearthtalk" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:description", content: "Generate a realistic photo and write how your AI character behaves." },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { photo?: string } =>
    typeof s["photo"] === "string" ? { photo: s["photo"] } : {},
  component: CreatePage,
});

type Mode = "solo" | "directed" | "brainstorm";
const MODES: { key: Mode; title: string; text: string; icon: typeof PenLine }[] = [
  { key: "solo", title: "On my own", text: "Fill in everything yourself, no AI help.", icon: PenLine },
  { key: "directed", title: "AI follows my orders", text: "Tell the AI what to make, it writes it for you.", icon: Wand2 },
  { key: "brainstorm", title: "Think together", text: "Not sure how to say it? The AI asks questions with you.", icon: MessagesSquare },
];

function CreatePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode | null>(null);
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [behavior, setBehavior] = useState("");
  const [rules, setRules] = useState("");
  const [tracks, setTracks] = useState<Record<string, string>>({});
  const { photo: photoParam } = Route.useSearch();
  const [noPhoto, setNoPhoto] = useState(false);
  const photo = noPhoto ? null : (photoParam ?? null);
  const [saving, setSaving] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [idea, setIdea] = useState("");
  const [answers, setAnswers] = useState("");
  const [questions, setQuestions] = useState<string[]>([]);
  const [helping, setHelping] = useState(false);

  async function askHelper() {
    if (idea.trim().length < 3) { toast.error("Describe your character idea first."); return; }
    setHelping(true);
    try {
      const full = questions.length && answers.trim()
        ? `${idea}\n\nThe AI asked:\n${questions.join("\n")}\n\nMy answers:\n${answers}`
        : idea;
      const res = await fetch("/api/character-helper", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ idea: full, brainstorm: mode === "brainstorm" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "The helper couldn't write a draft.");
      setName(json.name ?? "");
      setTagline(json.tagline ?? "");
      setBehavior(json.behavior ?? "");
      if (json.rules) setRules(json.rules);
      setQuestions(Array.isArray(json.questions) ? json.questions : []);
      setAnswers("");
      toast.success("Draft ready — change anything you like before saving.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setHelping(false);
    }
  }

  async function save() {
    if (!name.trim() || !behavior.trim()) { toast.error("Give your character a name and a behavior."); return; }
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const musicMap = Object.fromEntries(Object.entries(tracks).filter(([, v]) => v.trim()));
    const { data, error } = await supabase
      .from("characters")
      .insert({ owner_id: u.user!.id, name: name.trim(), tagline: tagline.trim(), behavior: behavior.trim(), rules: rules.trim(),
        avatar_url: photo, avatar_kind: noPhoto ? "none" : "photo", music: musicMap, is_public: isPublic })
      .select("id")
      .single();
    setSaving(false);
    if (error) { toast.error("Couldn't save the character."); return; }
    await qc.invalidateQueries({ queryKey: ["characters"] });
    navigate({ to: "/chat/$characterId", params: { characterId: data.id } });
  }

  if (!mode) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-4xl font-semibold">How do you want to create?</h1>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {MODES.map((m) => (
            <button key={m.key} type="button" onClick={() => setMode(m.key)}
              className="rounded-[2rem] border border-border bg-card/90 p-6 text-left shadow-soft transition-transform hover:-translate-y-1">
              <m.icon className="h-8 w-8 text-primary" />
              <div className="mt-3 font-display text-xl font-semibold">{m.title}</div>
              <p className="mt-1 text-sm text-muted-foreground">{m.text}</p>
            </button>
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto grid max-w-5xl gap-8 px-4 py-10 md:grid-cols-[320px_1fr]">
      <div className="space-y-4">
        <div className="aspect-square overflow-hidden rounded-[1.75rem] bg-lavender shadow-soft">
          {photo ? (
            <img src={photo} alt="Character" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-accent-foreground">
              {noPhoto ? <><Sparkles className="h-10 w-10" /> No photo — perfect for crowds or nameless beings</> : "No photo yet"}
            </div>
          )}
        </div>
        {!noPhoto && (
          <Button asChild variant="secondary" className="w-full rounded-full">
            <Link to="/studio"><Wand2 className="h-4 w-4" /> {photo ? "Make a different photo" : "Open photo studio"}</Link>
          </Button>
        )}
        <Button variant="ghost" className="w-full rounded-full" onClick={() => setNoPhoto(!noPhoto)}>
          {noPhoto ? "Use a photo after all" : "No photo at all"}
        </Button>
        <Button variant="ghost" className="w-full rounded-full text-muted-foreground" onClick={() => setMode(null)}>
          Change how I create
        </Button>
      </div>

      <div className="space-y-5 rounded-[2rem] border border-border bg-card/90 p-6 shadow-soft">
        <h1 className="text-3xl font-semibold">Create your AI</h1>
        {mode !== "solo" && (
          <div className="space-y-3 rounded-3xl bg-muted/60 p-4">
            <Label htmlFor="idea">{mode === "brainstorm" ? "Tell the AI roughly what you're thinking of" : "Tell the AI what to make"}</Label>
            <Textarea id="idea" rows={2} value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="a grumpy cat who rules a castle…" />
            {questions.length > 0 && (
              <div className="space-y-2 rounded-2xl bg-card p-3">
                <p className="text-sm font-semibold">To make it perfect, the AI would like to know:</p>
                <ul className="list-disc pl-5 text-sm text-muted-foreground">{questions.map((q) => <li key={q}>{q}</li>)}</ul>
                <Textarea rows={3} value={answers} onChange={(e) => setAnswers(e.target.value)} placeholder="Your answers…" />
              </div>
            )}
            <Button type="button" variant="secondary" className="w-full rounded-full" disabled={helping || idea.trim().length < 3} onClick={askHelper}>
              {helping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {helping ? "The AI is writing…" : questions.length ? "Improve with my answers" : "Let the AI write it"}
            </Button>
          </div>
        )}
        <Tabs defaultValue="profile">
          <TabsList className="w-full rounded-full">
            <TabsTrigger value="profile" className="flex-1 rounded-full">Profile</TabsTrigger>
            <TabsTrigger value="behavior" className="flex-1 rounded-full">Behavior</TabsTrigger>
            <TabsTrigger value="rules" className="flex-1 rounded-full">Rules</TabsTrigger>
            <TabsTrigger value="music" className="flex-1 rounded-full">Music</TabsTrigger>
          </TabsList>
          <TabsContent value="profile" className="space-y-4 pt-3">
            <div className="space-y-2">
              <Label htmlFor="n">Name</Label>
              <Input id="n" value={name} onChange={(e) => setName(e.target.value)} placeholder="Sir Pemberton" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="t">Short description</Label>
              <Input id="t" value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="A grumpy cat who rules a castle" />
            </div>
          </TabsContent>
          <TabsContent value="behavior" className="space-y-2 pt-3">
            <Label htmlFor="b">How must the AI behave?</Label>
            <Textarea id="b" rows={9} value={behavior} onChange={(e) => setBehavior(e.target.value)}
              placeholder="Personality, way of talking, the world… One character, a crowd of hundreds, or a narrator who runs a whole game." />
          </TabsContent>
          <TabsContent value="rules" className="space-y-2 pt-3">
            <Label htmlFor="r">Rules of your scenario</Label>
            <Textarea id="r" rows={8} value={rules} onChange={(e) => setRules(e.target.value)}
              placeholder="World rules and things that can never happen, e.g. no modern phones in this medieval world, magic costs energy…" />
            <p className="text-xs text-muted-foreground">Players can't change these during the chat — only you can, here.</p>
          </TabsContent>
          <TabsContent value="music" className="space-y-3 pt-3">
            <p className="text-sm text-muted-foreground">Paste YouTube links. Leave empty to use the game's own music.</p>
            {[{ key: "default", label: "Main music" }, ...MOODS].map((m) => (
              <div key={m.key} className="space-y-1">
                <Label htmlFor={`m-${m.key}`}>{m.label}</Label>
                <Input id={`m-${m.key}`} value={tracks[m.key] ?? ""} onChange={(e) => setTracks({ ...tracks, [m.key]: e.target.value })} placeholder="https://www.youtube.com/watch?v=…" />
              </div>
            ))}
          </TabsContent>
        </Tabs>
        <label className="flex items-center justify-between gap-3 rounded-2xl bg-card p-4 shadow-soft">
          <span>
            <span className="block font-semibold">{isPublic ? "Public" : "Private"}</span>
            <span className="text-sm text-muted-foreground">{isPublic ? "Every player can find and chat with it." : "Only you can see it."}</span>
          </span>
          <Switch checked={isPublic} onCheckedChange={setIsPublic} />
        </label>
        <Button onClick={save} disabled={saving} size="lg" className="w-full rounded-full shadow-soft">
          {saving ? "Saving…" : "Save & start chatting"}
        </Button>
      </div>
    </main>
  );
}
