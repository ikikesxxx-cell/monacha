CREATE TABLE public.photo_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  prompt text NOT NULL,
  url text NOT NULL,
  from_reference boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending',
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX photo_gen_user_idx ON public.photo_generations (user_id, status, created_at);
GRANT SELECT, INSERT, UPDATE ON public.photo_generations TO authenticated;
GRANT ALL ON public.photo_generations TO service_role;
ALTER TABLE public.photo_generations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own gens read" ON public.photo_generations FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own gens insert" ON public.photo_generations FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own gens update" ON public.photo_generations FOR UPDATE TO authenticated USING (user_id = auth.uid());
ALTER TABLE public.profiles ADD COLUMN last_review_at timestamptz;