import { describe, expect, it } from "vitest";
import { isReviewDue } from "@/lib/photo-learning";

describe("weekly photo review", () => {
  const now = new Date("2026-10-22T12:00:00Z");
  it("is due after 7 days with pending photos", () => {
    expect(isReviewDue("2026-10-15T12:00:00Z", 3, now)).toBe(true);
  });
  it("is not due before 7 days", () => {
    expect(isReviewDue("2026-10-17T12:00:00Z", 3, now)).toBe(false);
  });
  it("is not due with nothing to review", () => {
    expect(isReviewDue(null, 0, now)).toBe(false);
  });
});
