import { useEffect } from "react";
import { Music, VolumeX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { music, useMusic } from "@/lib/music";

export function MusicPlayer() {
  const { track, playing, enabled } = useMusic();
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: p } = await supabase.from("profiles").select("music_enabled").eq("id", data.user.id).maybeSingle();
      music.set({ enabled: p?.music_enabled ?? true });
    });
  }, []);
  if (!enabled) return null;
  return (
    <>
      {playing && (
        <iframe
          key={track}
          title="Background music"
          className="pointer-events-none fixed -left-[9999px] h-px w-px"
          src={`https://www.youtube.com/embed/${track}?autoplay=1&loop=1&playlist=${track}&controls=0`}
          allow="autoplay"
        />
      )}
      <button
        type="button"
        onClick={() => music.set({ playing: !playing })}
        aria-label={playing ? "Pause music" : "Play music"}
        className="fixed bottom-4 left-4 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-card text-foreground shadow-soft"
      >
        {playing ? <Music className="h-5 w-5 text-primary" /> : <VolumeX className="h-5 w-5 text-muted-foreground" />}
      </button>
    </>
  );
}
