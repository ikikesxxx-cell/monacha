import { useSyncExternalStore } from "react";

export const DEFAULT_TRACK = "MPa-y1LQjOk";
export type Mood = "default" | "peaceful" | "tense" | "lovely" | "sad";
export const MOODS: { key: Exclude<Mood, "default">; label: string }[] = [
  { key: "peaceful", label: "Peaceful moments" },
  { key: "tense", label: "Tense moments" },
  { key: "lovely", label: "Lovely / romantic moments" },
  { key: "sad", label: "Sad moments" },
];
export type MusicMap = Partial<Record<Mood, string>>;

/** Pull the YouTube video id out of a link (or return null). */
export function youtubeId(link: string | undefined | null): string | null {
  if (!link) return null;
  const s = link.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = s.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/);
  return m ? m[1]! : null;
}

const WORDS: Record<Exclude<Mood, "default">, RegExp> = {
  tense: /\b(danger|fight|attack|blood|scream|run|monster|sword|threat|chase|fear|growl|battle|enemy|trap)\w*/gi,
  lovely: /\b(love|kiss|blush|heart|hug|tender|gentle|darling|sweet|cuddl|romant|warm smile)\w*/gi,
  sad: /\b(cry|tears|sad|grief|lonely|mourn|sob|loss|goodbye)\w*/gi,
  peaceful: /\b(calm|quiet|breeze|peace|relax|sunset|meadow|tea|rest|soft)\w*/gi,
};

/** Guess the mood of a story passage from its words. */
export function detectMood(text: string): Mood {
  let best: Mood = "default";
  let top = 0;
  for (const [mood, re] of Object.entries(WORDS) as [Exclude<Mood, "default">, RegExp][]) {
    const n = text.match(re)?.length ?? 0;
    if (n > top) { top = n; best = mood; }
  }
  return best;
}

/** Track for a mood: the creator's link for that mood, else their default, else the game default. */
export function trackFor(music: MusicMap | null | undefined, mood: Mood): string {
  return youtubeId(music?.[mood]) ?? youtubeId(music?.default) ?? DEFAULT_TRACK;
}

type State = { track: string; playing: boolean; enabled: boolean };
let state: State = { track: DEFAULT_TRACK, playing: false, enabled: true };
const subs = new Set<() => void>();
export const music = {
  get: () => state,
  set(patch: Partial<State>) { state = { ...state, ...patch }; subs.forEach((f) => f()); },
  subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
};
export function useMusic() {
  return useSyncExternalStore(music.subscribe, music.get, music.get);
}
