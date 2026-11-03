import { useEffect } from "react";
import { Music, VolumeX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_TRACK, music, useMusic } from "@/lib/music";

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
          src={`https://www.youtube.com/embed/${track}?autoplay=1&loop=1&playlist=${track},${track}&controls=0&rel=0`}
          allow="autoplay"
        />
      )}
      {playing && (
        <a
          href={`https://www.youtube.com/watch?v=${track}`}
          target="_blank"
          rel="noreferrer"
          className="fixed bottom-5 left-16 z-40 max-w-[16rem] truncate rounded-full bg-card/90 px-3 py-1 text-xs text-muted-foreground shadow-soft"
        >
          {track === DEFAULT_TRACK
            ? "♪ “Dreamcore Playlist” by calm sense — not ours, all rights to the creator"
            : "♪ Music from YouTube — not ours, all rights to its creator"}
        </a>
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
