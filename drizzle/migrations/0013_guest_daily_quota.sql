-- Replace the shared guest pool with a per-guest daily quota: 50 free messages/day,
-- +20 per 20s sponsor clip, max 3 clips/day. Resets at midnight UTC.
CREATE TABLE public.guest_daily_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  used integer NOT NULL DEFAULT 0,
  bonus integer NOT NULL DEFAULT 0,
  clips integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
GRANT ALL ON public.guest_daily_usage TO service_role;
ALTER TABLE public.guest_daily_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guest_daily_usage FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.use_guest_message() RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ok boolean; today date := (now() AT TIME ZONE 'utc')::date;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF NOT public.is_guest() THEN RETURN true; END IF;
  INSERT INTO public.guest_daily_usage (user_id, day) VALUES (auth.uid(), today) ON CONFLICT DO NOTHING;
  UPDATE public.guest_daily_usage SET used = used + 1
    WHERE user_id = auth.uid() AND day = today AND used < 50 + bonus RETURNING true INTO ok;
  RETURN coalesce(ok, false);
END; $$;
REVOKE ALL ON FUNCTION public.use_guest_message() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.use_guest_message() TO authenticated;

-- Returns messages added (20), or 0 when today's 3 clips are used up or a clip was claimed under 20s ago.
CREATE OR REPLACE FUNCTION public.reward_sponsor_clip() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE prev timestamptz; ok boolean; today date := (now() AT TIME ZONE 'utc')::date;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'sign in first'; END IF;
  SELECT last_at INTO prev FROM public.guest_clip_rewards WHERE user_id = auth.uid();
  IF prev IS NOT NULL AND prev > now() - interval '20 seconds' THEN RETURN 0; END IF;
  INSERT INTO public.guest_daily_usage (user_id, day) VALUES (auth.uid(), today) ON CONFLICT DO NOTHING;
  UPDATE public.guest_daily_usage SET clips = clips + 1, bonus = bonus + 20
    WHERE user_id = auth.uid() AND day = today AND clips < 3 RETURNING true INTO ok;
  IF NOT coalesce(ok, false) THEN RETURN 0; END IF;
  INSERT INTO public.guest_clip_rewards (user_id, last_at) VALUES (auth.uid(), now())
    ON CONFLICT (user_id) DO UPDATE SET last_at = now();
  RETURN 20;
END; $$;
REVOKE ALL ON FUNCTION public.reward_sponsor_clip() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reward_sponsor_clip() TO authenticated;
