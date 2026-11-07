import { describe, expect, it } from "vitest";
import { cleanNickname, GUEST_DAILY_MESSAGES, GUEST_POOL_EMPTY, isGuestPoolEmptyError, SPONSOR_CLIP_REWARD, SPONSOR_CLIP_SECONDS, SPONSOR_CLIPS_PER_DAY } from "@/lib/guest-limits";

describe("guest play rules", () => {
  it("each guest gets 50 free messages per day", () => {
    expect(GUEST_DAILY_MESSAGES).toBe(50);
  });
  it("a 20 second sponsor clip adds 20 messages", () => {
    expect(SPONSOR_CLIP_SECONDS).toBe(20);
    expect(SPONSOR_CLIP_REWARD).toBe(20);
  });
  it("at most 3 sponsor clips per day", () => {
    expect(SPONSOR_CLIPS_PER_DAY).toBe(3);
  });
  it("chat screen recognises the out-of-messages reply", () => {
    expect(isGuestPoolEmptyError(`${GUEST_POOL_EMPTY}: The free guest messages have run out.`)).toBe(true);
    expect(isGuestPoolEmptyError("Could not save your message.")).toBe(false);
  });
  it("nicknames are trimmed and capped at 30 characters", () => {
    expect(cleanNickname("  Ser   Bob  ")).toBe("Ser Bob");
    expect(cleanNickname("x".repeat(40))).toHaveLength(30);
  });
});
