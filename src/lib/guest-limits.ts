/** Marker the chat server puts in front of the "guest pool is empty" reply so the chat screen can open the upgrade window. */
export const GUEST_POOL_EMPTY = "GUEST_POOL_EMPTY";

/** Size of the shared free-message pool that all guest players draw from. Signed-in players never spend from it. */
export const GUEST_POOL_START = 10_000_000_000;

/** Messages a guest adds to the shared pool by watching one sponsor clip (at most once per hour). */
export const SPONSOR_CLIP_REWARD = 5;

/** Seconds a sponsor clip must play before it pays out. */
export const SPONSOR_CLIP_SECONDS = 15;

/** Pro payment link. Empty until the real (Orange) payment link and QR code are added. */
export const PRO_PAYMENT_LINK = "";

export function isGuestPoolEmptyError(message: string | undefined | null): boolean {
  return !!message && message.includes(GUEST_POOL_EMPTY);
}

export function cleanNickname(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, 30);
}
