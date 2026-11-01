import { describe, expect, it } from "vitest";
import { detectMood, trackFor, youtubeId, DEFAULT_TRACK } from "@/lib/music";

describe("music", () => {
  it("default track is the agreed YouTube video", () => expect(DEFAULT_TRACK).toBe("MPa-y1LQjOk"));
  it("reads ids from links", () => expect(youtubeId("https://www.youtube.com/watch?v=MPa-y1LQjOk")).toBe("MPa-y1LQjOk"));
  it("uses the creator's tense link in a fight", () => {
    const m = { tense: "https://youtu.be/aaaaaaaaaaa" };
    expect(trackFor(m, detectMood("The monster attacks, swords clash in battle"))).toBe("aaaaaaaaaaa");
  });
  it("falls back to the game track when the creator set none", () => expect(trackFor({}, "lovely")).toBe(DEFAULT_TRACK));
});
