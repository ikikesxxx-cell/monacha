import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type Gen = { id: string; prompt: string; url: string; from_reference: boolean; status: string };
const db = supabase as unknown as { from: (t: string) => any };

export const reviewQuery = queryOptions({
  queryKey: ["review"],
  queryFn: async () => {
    const { data: u } = await supabase.auth.getUser();
    const [{ data: gens }, { data: prof }, { count }] = await Promise.all([
      db.from("photo_generations").select("*").eq("status", "pending").order("created_at", { ascending: false }),
      db.from("profiles").select("last_review_at").eq("id", u.user!.id).maybeSingle(),
      db.from("photo_generations").select("id", { count: "exact", head: true }).eq("status", "accepted"),
    ]);
    return {
      userId: u.user!.id,
      pending: (gens ?? []) as Gen[],
      lastReviewAt: (prof?.last_review_at ?? null) as string | null,
      acceptedCount: (count ?? 0) as number,
    };
  },
});

export const Route = createFileRoute("/_authenticated/review")({
  head: () => ({
    meta: [
      { title: "Photo review — Hearthtalk" },
      { name: "description", content: "Accept or decline generated photos so future photos get better." },
      { property: "og:title", content: "Photo review — Hearthtalk" },
      { property: "og:description", content: "Accept or decline generated photos so future photos get better." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(reviewQuery),
  component: ReviewPage,
});

function ReviewPage() {
  const { data } = useSuspenseQuery(reviewQuery);
  const qc = useQueryClient();

  async function decide(id: string, status: "accepted" | "declined") {
    const now = new Date().toISOString();
    const { error } = await db.from("photo_generations").update({ status, reviewed_at: now }).eq("id", id);
    if (error) return toast.error("Couldn't save your choice.");
    await db.from("profiles").update({ last_review_at: now }).eq("id", data.userId);
    qc.invalidateQueries({ queryKey: ["review"] });
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-4xl font-semibold">Weekly photo review</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Keep the photos that look perfect and decline the bad ones. Every choice teaches the photo maker your taste, so
        new photos get better over time. You've approved {data.acceptedCount} so far.
      </p>
      {data.pending.length === 0 ? (
        <div className="mt-10 rounded-[2rem] border border-border bg-card/80 p-10 text-center text-muted-foreground">
          Nothing to review right now. New photos you make will show up here.
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
          {data.pending.map((g) => (
            <div key={g.id} className="rounded-[1.75rem] bg-card p-2 pb-3 shadow-soft">
              <img src={g.url} alt={g.prompt} loading="lazy" className="aspect-square w-full rounded-[1.4rem] object-cover" />
              <p className="mt-2 line-clamp-2 px-2 text-sm text-muted-foreground">
                {g.from_reference && <span className="font-semibold text-foreground">From a real photo · </span>}
                {g.prompt}
              </p>
              <div className="mt-2 flex gap-2 px-1">
                <Button size="sm" className="flex-1 rounded-full" onClick={() => decide(g.id, "accepted")}>
                  <Check className="h-4 w-4" /> Perfect
                </Button>
                <Button size="sm" variant="outline" className="flex-1 rounded-full" onClick={() => decide(g.id, "declined")}>
                  <X className="h-4 w-4" /> Bad
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
