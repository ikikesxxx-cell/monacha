-- Guest play: shared free-message pool, sponsor-clip top-ups, guest history claim, open home feed.

-- 1) Shared guest message pool (one row). Only guest (anonymous) players spend from it.
CREATE TABLE public.guest_pool (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  remaining bigint NOT NULL CHECK (remaining >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.guest_pool TO anon, authenticated;
GRANT ALL ON public.guest_pool TO service_role;
ALTER TABLE public.guest_pool ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone reads guest pool" ON public.guest_pool FOR SELECT TO anon, authenticated USING (true);
INSERT INTO public.guest_pool (id, remaining) VALUES (1, 10000000000) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_guest() RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
$$;
GRANT EXECUTE ON FUNCTION public.is_guest() TO authenticated;

-- Spends one guest message. Signed-in (non-guest) players never spend. Returns false when the pool is empty.
CREATE OR REPLACE FUNCTION public.use_guest_message() RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ok boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF NOT public.is_guest() THEN RETURN true; END IF;
  UPDATE public.guest_pool SET remaining = remaining - 1, updated_at = now()
    WHERE id = 1 AND remaining > 0 RETURNING true INTO ok;
  RETURN coalesce(ok, false);
END; $$;
REVOKE ALL ON FUNCTION public.use_guest_message() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.use_guest_message() TO authenticated;

-- 2) Sponsor clip reward placeholder: a guest can add 5 messages to the pool at most once per hour.
CREATE TABLE public.guest_clip_rewards (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.guest_clip_rewards TO service_role;
ALTER TABLE public.guest_clip_rewards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guest_clip_rewards FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reward_sponsor_clip() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE prev timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'sign in first'; END IF;
  SELECT last_at INTO prev FROM public.guest_clip_rewards WHERE user_id = auth.uid();
  IF prev IS NOT NULL AND prev > now() - interval '1 hour' THEN RETURN 0; END IF;
  INSERT INTO public.guest_clip_rewards (user_id, last_at) VALUES (auth.uid(), now())
    ON CONFLICT (user_id) DO UPDATE SET last_at = now();
  UPDATE public.guest_pool SET remaining = remaining + 5, updated_at = now() WHERE id = 1;
  RETURN 5;
END; $$;
REVOKE ALL ON FUNCTION public.reward_sponsor_clip() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reward_sponsor_clip() TO authenticated;

-- 3) Save on signup: a guest makes a one-time claim code, then the signed-in account redeems it.
CREATE TABLE public.guest_claims (
  code uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.guest_claims TO service_role;
ALTER TABLE public.guest_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guest_claims FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_guest_claim() RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_guest() THEN RAISE EXCEPTION 'only guests can save progress'; END IF;
  DELETE FROM public.guest_claims WHERE guest_id = auth.uid();
  INSERT INTO public.guest_claims (guest_id) VALUES (auth.uid()) RETURNING code INTO c;
  RETURN c;
END; $$;
REVOKE ALL ON FUNCTION public.create_guest_claim() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_guest_claim() TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_guest_progress(_code uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g uuid; me uuid := auth.uid(); nick text;
BEGIN
  IF me IS NULL OR public.is_guest() THEN RETURN false; END IF;
  DELETE FROM public.guest_claims WHERE code = _code AND created_at > now() - interval '1 day' RETURNING guest_id INTO g;
  IF g IS NULL OR g = me THEN RETURN false; END IF;

  SELECT display_name INTO nick FROM public.profiles WHERE id = g;
  UPDATE public.profiles SET display_name = nick WHERE id = me AND nick IS NOT NULL AND nick <> '';

  UPDATE public.characters SET owner_id = me WHERE owner_id = g;
  -- Keep the account's own story memory when both have one; otherwise move the guest's.
  DELETE FROM public.conversation_memories m WHERE m.user_id = g
    AND EXISTS (SELECT 1 FROM public.conversation_memories x WHERE x.user_id = me AND x.character_id = m.character_id);
  UPDATE public.conversation_memories SET user_id = me WHERE user_id = g;
  DELETE FROM public.conversation_scenes s WHERE s.user_id = g
    AND EXISTS (SELECT 1 FROM public.conversation_scenes x WHERE x.user_id = me AND x.character_id = s.character_id AND x.location = s.location);
  UPDATE public.conversation_scenes SET user_id = me WHERE user_id = g;
  UPDATE public.messages SET user_id = me WHERE user_id = g;
  UPDATE public.photo_generations SET user_id = me WHERE user_id = g;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.claim_guest_progress(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_guest_progress(uuid) TO authenticated;

-- 4) Open home feed: visitors can see public games and starters before signing in.
GRANT SELECT ON public.characters TO anon;
CREATE POLICY "visitors read public games" ON public.characters FOR SELECT TO anon
  USING ((owner_id IS NULL OR is_public) AND deleted_at IS NULL);
