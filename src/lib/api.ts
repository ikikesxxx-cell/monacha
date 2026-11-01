import { supabase } from "@/integrations/supabase/client";

export async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type Character = {
  id: string;
  owner_id: string | null;
  name: string;
  tagline: string;
  behavior: string;
  avatar_url: string | null;
  rules?: string;
  avatar_kind?: string;
  music?: Record<string, string> | null;
};
