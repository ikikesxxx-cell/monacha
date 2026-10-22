/** Builds the extra prompt guidance from the player's past photo reviews. */
export function buildLearningNotes(accepted: string[], declined: string[]): string {
  const notes: string[] = [];
  if (accepted.length) {
    notes.push(
      `The player approved photos made from these descriptions; match their realism, lighting and style: ${accepted
        .slice(0, 8)
        .map((p) => `"${p}"`)
        .join("; ")}.`,
    );
  }
  if (declined.length) {
    notes.push(
      `The player rejected photos made from these descriptions; avoid whatever made them look wrong or fake: ${declined
        .slice(0, 8)
        .map((p) => `"${p}"`)
        .join("; ")}.`,
    );
  }
  return notes.join(" ");
}

export const REVIEW_INTERVAL_DAYS = 7;

/** True when the weekly review is due: there are unreviewed photos and 7+ days passed since the last review. */
export function isReviewDue(lastReviewAt: string | null, pendingCount: number, now = new Date()): boolean {
  if (pendingCount === 0) return false;
  if (!lastReviewAt) return true;
  const days = (now.getTime() - new Date(lastReviewAt).getTime()) / 86_400_000;
  return days >= REVIEW_INTERVAL_DAYS;
}
