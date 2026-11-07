import { supabase } from "@/integrations/supabase/client";
import { cleanNickname } from "@/lib/guest-limits";

const CLAIM_KEY = "hearthtalk-guest-claim";

/** Starts a guest session with a nickname (no password). Reuses an existing session if there is one. */
export async function startGuest(nickname: string) {
  const name = cleanNickname(nickname);
  if (name.length < 2) throw new Error("Pick a nickname of at least 2 letters.");
  const { data: current } = await supabase.auth.getSession();
  if (current.session) return current.session.user;
  const { data, error } = await supabase.auth.signInAnonymously({ options: { data: { name } } });
  if (error || !data.user) throw new Error("Guest play isn't switched on yet. Please sign in with Google.");
  return data.user;
}

/** Before a guest signs in with Google, remember a one-time code so their chats move into the new account. */
export async function rememberGuestProgress() {
  const { data } = await supabase.auth.getUser();
  if (!data.user?.is_anonymous) return;
  const { data: code, error } = await supabase.rpc("create_guest_claim");
  if (!error && code) localStorage.setItem(CLAIM_KEY, code);
}

/** After signing in for real, move any remembered guest chats, characters and nickname into this account. */
export async function claimGuestProgress(): Promise<boolean> {
  const code = typeof localStorage === "undefined" ? null : localStorage.getItem(CLAIM_KEY);
  if (!code) return false;
  const { data } = await supabase.auth.getUser();
  if (!data.user || data.user.is_anonymous) return false;
  localStorage.removeItem(CLAIM_KEY);
  const { data: ok, error } = await supabase.rpc("claim_guest_progress", { _code: code });
  return !error && !!ok;
}
