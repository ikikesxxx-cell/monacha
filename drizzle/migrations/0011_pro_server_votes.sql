CREATE TABLE public.pro_votes (user_id uuid PRIMARY KEY DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, DELETE ON public.pro_votes TO authenticated;
GRANT ALL ON public.pro_votes TO service_role;
ALTER TABLE public.pro_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own vote" ON public.pro_votes FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "cast own vote" ON public.pro_votes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "remove own vote" ON public.pro_votes FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE OR REPLACE FUNCTION public.pro_vote_count() RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT count(*)::int FROM public.pro_votes $$;
GRANT EXECUTE ON FUNCTION public.pro_vote_count() TO authenticated;