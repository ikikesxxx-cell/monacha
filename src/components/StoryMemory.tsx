import { useState } from "react";
import { Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { StoryMemory as Memory } from "@/lib/conversation-memory";

const labels = { location: "Location", activity: "Current activity", key_information: "Key information" };

export function StoryMemory({ memory }: { memory: Memory }) {
  const [open, setOpen] = useState(false);
  return <>
    <Button variant="ghost" size="icon" className="rounded-full" aria-label="Story memory" title="Story memory" onClick={() => setOpen(true)}>
      <Brain className="h-5 w-5" />
    </Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[80dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Story memory</DialogTitle>
          <DialogDescription>{memory.facts.length} remembered facts</DialogDescription>
        </DialogHeader>
        {memory.facts.length === 0 && !memory.summary && <p className="text-sm text-muted-foreground">No story facts yet.</p>}
        {Object.entries(labels).map(([category, label]) => {
          const facts = memory.facts.filter((fact) => fact.category === category);
          if (!facts.length) return null;
          return <section key={category} className="space-y-2">
            <h2 className="font-semibold">{label}</h2>
            <ul className="list-disc space-y-2 pl-5 text-sm">
              {facts.map((fact) => <li key={fact.key} className="break-words">{fact.detail}</li>)}
            </ul>
          </section>;
        })}
        {memory.summary && <section className="space-y-2 border-t border-border pt-4">
          <h2 className="font-semibold">Story so far</h2>
          <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{memory.summary}</p>
        </section>}
      </DialogContent>
    </Dialog>
  </>;
}