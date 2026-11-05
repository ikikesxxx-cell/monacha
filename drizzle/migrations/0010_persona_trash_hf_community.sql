ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS persona_look text NOT NULL DEFAULT '';
ALTER TABLE public.characters ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.player_ai_settings ADD COLUMN IF NOT EXISTS huggingface_api_key text;

CREATE OR REPLACE FUNCTION public.get_maker_names(_ids uuid[])
RETURNS TABLE(id uuid, display_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, COALESCE(NULLIF(p.display_name, ''), 'Player') FROM public.profiles p WHERE p.id = ANY(_ids)
$$;
REVOKE ALL ON FUNCTION public.get_maker_names(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_maker_names(uuid[]) TO authenticated;

CREATE TABLE public.game_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX game_posts_character_idx ON public.game_posts(character_id, created_at);
GRANT SELECT, INSERT, DELETE ON public.game_posts TO authenticated;
GRANT ALL ON public.game_posts TO service_role;
ALTER TABLE public.game_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read posts of public games" ON public.game_posts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.characters c WHERE c.id = character_id AND c.is_public AND c.deleted_at IS NULL));
CREATE POLICY "post on public games" ON public.game_posts FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.characters c WHERE c.id = character_id AND c.is_public AND c.deleted_at IS NULL));
CREATE POLICY "delete own posts" ON public.game_posts FOR DELETE TO authenticated USING (user_id = auth.uid());