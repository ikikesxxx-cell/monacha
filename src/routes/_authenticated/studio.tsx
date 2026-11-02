import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Wand2, Pencil, UserPlus, Undo2 } from "lucide-react";
import { authHeaders } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/studio")({
  validateSearch: (s: Record<string, unknown>): { photo?: string } =>
    typeof s["photo"] === "string" ? { photo: s["photo"] } : {},
  head: () => ({
    meta: [
      { title: "Photo studio — Hearthtalk" },
      { name: "description", content: "Generate and edit character photos with your Pollinations key." },
      { property: "og:title", content: "Photo studio — Hearthtalk" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:description", content: "Generate and edit character photos with your Pollinations key." },
    ],
  }),
  component: StudioPage,
});

const ideas = [
  "a woman with dark black skin, brown hair and a big smile",
  "a fluffy orange cat wearing a tiny knitted scarf",
  "an elderly fisherman with a white beard on a misty dock",
];

function StudioPage() {
  const navigate = useNavigate();
  const { photo: photoParam } = Route.useSearch();
  const [prompt, setPromptRaw] = useState("");
  const [undoText, setUndoText] = useState<string | null>(null);
  useEffect(() => { setPromptRaw(localStorage.getItem("studio-draft") ?? ""); }, []);
  const setPrompt = (v: string) => { setPromptRaw(v); localStorage.setItem("studio-draft", v); };
  function pickIdea(i: string) {
    if (prompt.trim() && prompt !== i && !confirm("Replace your text with this idea?")) return;
    if (prompt.trim()) setUndoText(prompt);
    setPrompt(i);
  }
  const [reference, setReference] = useState<File | null>(null);
  const [change, setChange] = useState("");
  const [history, setHistory] = useState<string[]>(photoParam ? [photoParam] : []);
  const [busy, setBusy] = useState(false);
  const photo = history[history.length - 1] ?? null;

  async function run(mode: "new" | "edit") {
    setBusy(true);
    try {
      const form = new FormData();
      form.set("prompt", prompt);
      if (mode === "edit" && photo) {
        form.set("base", photo);
        form.set("change", change);
      } else if (reference) {
        form.set("reference", reference);
      }
      const res = await fetch("/api/avatar", { method: "POST", headers: await authHeaders(), body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Photo generation failed.");
      setHistory((h) => (mode === "new" ? [json.url] : [...h, json.url]));
      if (mode === "edit") setChange("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto grid max-w-5xl gap-8 px-4 py-10 md:grid-cols-[1fr_380px]">
      <div className="space-y-3">
        <div className="relative aspect-square overflow-hidden rounded-[2rem] bg-lavender shadow-soft">
          {photo ? (
            <img src={photo} alt="Generated" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-accent-foreground">
              Your photo appears here
            </div>
          )}
          {busy && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
          )}
        </div>
        {history.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {history.map((h, i) => (
              <button key={h} type="button" onClick={() => setHistory(history.slice(0, i + 1))} title={`Version ${i + 1}`}>
                <img src={h} alt={`Version ${i + 1}`} className={`h-16 w-16 rounded-xl object-cover ${i === history.length - 1 ? "ring-2 ring-primary" : "opacity-70"}`} />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-5">
        <div className="space-y-3 rounded-[2rem] border border-border bg-card/90 p-6 shadow-soft">
          <h1 className="text-3xl font-semibold">Photo studio</h1>
          <Label htmlFor="pp">Describe the photo</Label>
          <Textarea id="pp" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={ideas[0]} />
          <div className="flex flex-wrap gap-1.5">
            {ideas.map((i) => (
              <button key={i} type="button" onClick={() => pickIdea(i)} className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground hover:text-foreground">
                {i}
              </button>
            ))}
          </div>
          {undoText !== null && (
            <button type="button" className="text-xs font-semibold text-primary underline" onClick={() => { setPrompt(undoText); setUndoText(null); }}>
              Bring back my text
            </button>
          )}
          <Label htmlFor="ref">Or start from a real photo (optional)</Label>
          <Input id="ref" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setReference(e.target.files?.[0] ?? null)} />
          <Button className="w-full rounded-full" disabled={busy || (prompt.trim().length < 3 && !reference)} onClick={() => run("new")}>
            <Wand2 className="h-4 w-4" /> {photo ? "Make a fully new photo" : "Generate photo"}
          </Button>
        </div>

        {photo && (
          <div className="space-y-3 rounded-[2rem] border border-border bg-card/90 p-6 shadow-soft">
            <Label htmlFor="ch">What should change?</Label>
            <Textarea id="ch" rows={2} value={change} onChange={(e) => setChange(e.target.value)} placeholder="just say it simply: longer hair, darker skin, add glasses…" />
            <Button variant="secondary" className="w-full rounded-full" disabled={busy || change.trim().length < 2} onClick={() => run("edit")}>
              <Pencil className="h-4 w-4" /> Apply change
            </Button>
            {history.length > 1 && (
              <Button variant="ghost" className="w-full rounded-full" disabled={busy} onClick={() => setHistory(history.slice(0, -1))}>
                <Undo2 className="h-4 w-4" /> Undo last change
              </Button>
            )}
            <Button size="lg" className="w-full rounded-full shadow-soft" onClick={() => navigate({ to: "/create", search: { photo } })}>
              <UserPlus className="h-4 w-4" /> Use for a new character
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
