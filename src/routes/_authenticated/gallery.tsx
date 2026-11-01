import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, Pencil, Trash2, UserPlus } from "lucide-react";
import { authHeaders } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Gen = { id: string; parent_id: string | null; prompt: string; url: string; from_reference: boolean; status: string; created_at: string };
const db = supabase as unknown as { from: (t: string) => any };

const galleryQuery = queryOptions({
  queryKey: ["gallery"],
  queryFn: async () => {
    const { data } = await db
      .from("photo_generations")
      .select("id,parent_id,prompt,url,from_reference,status,created_at")
      .order("created_at", { ascending: false });
    return (data ?? []) as Gen[];
  },
});

export const Route = createFileRoute("/_authenticated/gallery")({
  head: () => ({
    meta: [
      { title: "My photos — Hearthtalk" },
      { name: "description", content: "Every photo you ever made — view it, change it, or use it for a character." },
      { property: "og:title", content: "My photos — Hearthtalk" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:description", content: "Every photo you ever made — view it, change it, or use it for a character." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(galleryQuery),
  component: GalleryPage,
});

const statusLabel: Record<string, string> = {
  accepted: "Perfect",
  declined: "Bad",
  pending: "Not reviewed yet",
};

function GalleryPage() {
  const { data: photos } = useSuspenseQuery(galleryQuery);
  const [open, setOpen] = useState<Gen | null>(null);
  const qc = useQueryClient();
  const byId = new Map(photos.map((p) => [p.id, p]));
  const hasChild = new Set(photos.map((p) => p.parent_id).filter(Boolean));
  const latest = photos.filter((p) => !hasChild.has(p.id));
  const earlier = (g: Gen) => {
    const out: Gen[] = [];
    let cur = g.parent_id ? byId.get(g.parent_id) : undefined;
    while (cur && out.length < 50) { out.push(cur); cur = cur.parent_id ? byId.get(cur.parent_id) : undefined; }
    return out;
  };
  async function remove(g: Gen) {
    if (!confirm("Delete this photo forever? This cannot be undone.")) return;
    const res = await fetch("/api/avatar", { method: "DELETE", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify({ id: g.id }) });
    if (!res.ok) { toast.error("Couldn't delete the photo."); return; }
    setOpen(null);
    await qc.invalidateQueries({ queryKey: ["gallery"] });
    toast.success("Photo deleted forever");
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-4xl font-semibold">My photos</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Every photo you ever made lives here. Open one to look at it, change it again, or turn it into a character.
      </p>
      {photos.length === 0 ? (
        <div className="mt-10 rounded-[2rem] border border-border bg-card/80 p-10 text-center">
          <p className="text-muted-foreground">No photos yet.</p>
          <Button asChild className="mt-4 rounded-full">
            <Link to="/studio">
              <Camera className="h-4 w-4" /> Make your first photo
            </Link>
          </Button>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
          {latest.map((g) => {
            const prev = earlier(g);
            return (
              <div key={g.id} className="rounded-[1.75rem] bg-card p-2 pb-3 shadow-soft">
                <button type="button" onClick={() => setOpen(g)} className="w-full text-left transition-transform hover:-translate-y-0.5">
                  <img src={g.url} alt={g.prompt} loading="lazy" className="aspect-square w-full rounded-[1.4rem] object-cover" />
                  <p className="mt-2 line-clamp-2 px-2 text-sm text-muted-foreground">{g.prompt}</p>
                  <p className="px-2 text-xs text-muted-foreground/70">{statusLabel[g.status] ?? g.status}</p>
                </button>
                {prev.length > 0 && (
                  <div className="mt-2 px-2">
                    <p className="text-xs font-semibold text-muted-foreground">Earlier versions</p>
                    <div className="mt-1 flex gap-1.5 overflow-x-auto pb-1">
                      {prev.map((v) => (
                        <button key={v.id} type="button" onClick={() => setOpen(v)} title={v.prompt}>
                          <img src={v.url} alt={v.prompt} loading="lazy" className="h-12 w-12 rounded-lg object-cover opacity-80 hover:opacity-100" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open !== null} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-2xl rounded-[2rem]">
          {open && (
            <>
              <DialogHeader>
                <DialogTitle className="line-clamp-2">{open.prompt}</DialogTitle>
              </DialogHeader>
              <img src={open.url} alt={open.prompt} className="w-full rounded-[1.4rem] object-cover" />
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button asChild className="flex-1 rounded-full">
                  <Link to="/studio" search={{ photo: open.url }}>
                    <Pencil className="h-4 w-4" /> Change this photo
                  </Link>
                </Button>
                <Button asChild variant="secondary" className="flex-1 rounded-full">
                  <Link to="/create" search={{ photo: open.url }}>
                    <UserPlus className="h-4 w-4" /> Use for a new character
                  </Link>
                </Button>
                <Button variant="destructive" className="rounded-full" onClick={() => remove(open)}>
                  <Trash2 className="h-4 w-4" /> Delete forever
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
