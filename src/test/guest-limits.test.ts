import { describe, expect, it } from "vitest";
import { cleanNickname, GUEST_POOL_EMPTY, GUEST_POOL_START, isGuestPoolEmptyError, SPONSOR_CLIP_REWARD } from "@/lib/guest-limits";

describe("guest play rules", () => {
  it("shared guest pool starts at 10 billion messages", () => {
    expect(GUEST_POOL_START).toBe(10_000_000_000);
  });
  it("chat screen recognises the pool-empty reply", () => {
    expect(isGuestPoolEmptyError(`${GUEST_POOL_EMPTY}: The free guest messages have run out.`)).toBe(true);
    expect(isGuestPoolEmptyError("Could not save your message.")).toBe(false);
  });
  it("sponsor clip adds 5 messages", () => {
    expect(SPONSOR_CLIP_REWARD).toBe(5);
  });
  it("nicknames are trimmed and capped at 30 characters", () => {
    expect(cleanNickname("  Ser   Bob  ")).toBe("Ser Bob");
    expect(cleanNickname("x".repeat(40))).toHaveLength(30);
  });
});
