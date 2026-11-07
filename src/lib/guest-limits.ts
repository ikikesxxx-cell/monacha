/** Marker the chat server puts in front of the "guest pool is empty" reply so the chat screen can open the upgrade window. */
export const GUEST_POOL_EMPTY = "GUEST_POOL_EMPTY";

/** Free messages each guest gets per day (resets at midnight UTC). Signed-in players are not limited. */
export const GUEST_DAILY_MESSAGES = 50;

/** Extra messages a guest earns by watching one sponsor clip. */
export const SPONSOR_CLIP_REWARD = 20;

/** Seconds a sponsor clip must play before it pays out. */
export const SPONSOR_CLIP_SECONDS = 20;

/** Most sponsor clips a guest can watch per day (50 + 3x20 = 110 messages max). */
export const SPONSOR_CLIPS_PER_DAY = 3;

/** Pro payment link. Empty until the real (Orange) payment link and QR code are added. */
export const PRO_PAYMENT_LINK = "";

export function isGuestPoolEmptyError(message: string | undefined | null): boolean {
  return !!message && message.includes(GUEST_POOL_EMPTY);
}

export function cleanNickname(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, 30);
}
