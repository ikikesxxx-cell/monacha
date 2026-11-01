ALTER TABLE public.photo_generations ADD COLUMN parent_id uuid REFERENCES public.photo_generations(id) ON DELETE SET NULL;
GRANT DELETE ON public.photo_generations TO authenticated;
CREATE POLICY "own gens delete" ON public.photo_generations FOR DELETE TO authenticated USING (user_id = auth.uid());
ALTER TABLE public.characters ADD COLUMN rules text NOT NULL DEFAULT '';
ALTER TABLE public.characters ADD COLUMN avatar_kind text NOT NULL DEFAULT 'photo';
ALTER TABLE public.characters ADD COLUMN music jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.profiles ADD COLUMN music_enabled boolean NOT NULL DEFAULT true;