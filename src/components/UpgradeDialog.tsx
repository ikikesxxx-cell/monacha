import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Clapperboard, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { GoogleButton } from "@/components/GoogleButton";
import { PRO_PAYMENT_LINK, SPONSOR_CLIP_REWARD, SPONSOR_CLIP_SECONDS } from "@/lib/guest-limits";

/** Shown when guest messages run out, or when a player taps "Pro". Offers Google sign-in, Pro payment, or a sponsor clip. */
export function UpgradeDialog({ open, onOpenChange, outOfMessages = false }: { open: boolean; onOpenChange: (open: boolean) => void; outOfMessages?: boolean }) {
  const qc = useQueryClient();
  const [guest, setGuest] = useState(false);
  const [clipLeft, setClipLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    void supabase.auth.getUser().then(({ data }) => setGuest(!!data.user?.is_anonymous));
  }, [open]);

  useEffect(() => {
    if (clipLeft === null) return;
    if (clipLeft > 0) {
      const t = setTimeout(() => setClipLeft(clipLeft - 1), 1000);
      return () => clearTimeout(t);
    }
    void (async () => {
      const { data, error } = await supabase.rpc("reward_sponsor_clip");
      setClipLeft(null);
      if (error) { toast.error("Couldn't add messages. Please try again."); return; }
      if (!data) { toast.info("You can watch another clip in an hour."); return; }
      toast.success(`Thanks! ${data} messages added for guests.`);
      qc.invalidateQueries({ queryKey: ["guest-pool"] });
      onOpenChange(false);
    })();
    return undefined;
  }, [clipLeft, onOpenChange, qc]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[2rem]">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {outOfMessages ? "The free guest messages ran out" : "Go Pro"}
          </DialogTitle>
          <DialogDescription>
            {outOfMessages
              ? "Sign in with Google to keep chatting for free, or unlock Pro."
              : "Pro unlocks the best photos and smarter chats."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {guest && (
            <div className="rounded-2xl bg-muted p-4">
              <p className="mb-3 text-sm font-semibold">Keep your nickname and chats</p>
              <GoogleButton label="Sign in with Google" />
            </div>
          )}
          <div className="rounded-2xl bg-butter p-4">
            <p className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" /> Hearthtalk Pro</p>
            {PRO_PAYMENT_LINK ? (
              <Button asChild className="mt-3 rounded-full">
                <a href={PRO_PAYMENT_LINK} target="_blank" rel="noreferrer">Pay for Pro</a>
              </Button>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Payment is coming soon.</p>
            )}
          </div>
          {guest && (
            <div className="rounded-2xl bg-card p-4 shadow-soft">
              <p className="flex items-center gap-2 text-sm font-semibold"><Clapperboard className="h-4 w-4 text-primary" /> Watch a sponsor clip</p>
              <p className="mt-1 text-sm text-muted-foreground">Adds {SPONSOR_CLIP_REWARD} messages to the guest pool. Once per hour.</p>
              {clipLeft !== null ? (
                <div className="mt-3 flex aspect-video items-center justify-center rounded-xl bg-muted text-sm text-muted-foreground" role="status">
                  Sponsor clip playing… {clipLeft}s
                </div>
              ) : (
                <Button variant="outline" className="mt-3 rounded-full" onClick={() => setClipLeft(SPONSOR_CLIP_SECONDS)}>Watch clip</Button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
