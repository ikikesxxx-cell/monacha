import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const GOAL = 100;

export function ProVote() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["pro-vote"],
    queryFn: async () => {
      const [{ data: count }, { data: mine }] = await Promise.all([
        supabase.rpc("pro_vote_count"),
        supabase.from("pro_votes").select("user_id").maybeSingle(),
      ]);
      return { count: (count as number) ?? 0, voted: !!mine };
    },
  });
  const count = data?.count ?? 0;
  const voted = data?.voted ?? false;

  async function toggle() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = voted
      ? await supabase.from("pro_votes").delete().eq("user_id", u.user.id)
      : await supabase.from("pro_votes").insert({ user_id: u.user.id });
    if (error) return toast.error("Could not save your vote");
    toast.success(voted ? "Vote removed" : "Thanks for voting!");
    qc.invalidateQueries({ queryKey: ["pro-vote"] });
  }

  const pct = Math.min(100, (count / GOAL) * 100);
  return (
    <section className="mt-6 rounded-[1.5rem] bg-card p-5 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-xl font-semibold">
            <Sparkles className="h-5 w-5 text-primary" /> Want super-realistic photos and smarter chats?
          </h2>
          <p className="text-sm text-muted-foreground">Vote to unlock the Pro server. When enough players want it, it goes live.</p>
        </div>
        <Button onClick={toggle} variant={voted ? "outline" : "default"} className="rounded-full">
          {voted ? "Remove my vote" : "Vote yes"}
        </Button>
      </div>
      <div className="mt-4 h-3 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs font-semibold text-muted-foreground">{count} / {GOAL} votes</p>
    </section>
  );
}
