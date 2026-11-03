CREATE TABLE IF NOT EXISTS public.player_ai_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  text_provider text NOT NULL DEFAULT 'gemini' CHECK (text_provider IN ('groq', 'gemini', 'openrouter')),
  text_model text NOT NULL DEFAULT '',
  groq_api_key text, gemini_api_key text, openrouter_api_key text, pollinations_api_key text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.player_ai_settings ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.player_ai_settings TO service_role;

CREATE TABLE IF NOT EXISTS public.conversation_scenes (
  user_id uuid NOT NULL,
  character_id uuid NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  location text NOT NULL, storage_path text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, character_id, location)
);
ALTER TABLE public.conversation_scenes ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.conversation_scenes TO service_role;

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role FROM auth.users WHERE email IN ('jj4155293@gmail.com','nathanrockaert@gmail.com')
AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.users.id AND r.role = 'admin');

CREATE POLICY "owners read each other characters" ON public.characters FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') AND public.has_role(owner_id,'admin'));
CREATE POLICY "owners read each other messages" ON public.messages FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') AND public.has_role(user_id,'admin'));
CREATE POLICY "owners share vault" ON public.vault_items FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.chat_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  character_id uuid NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  include_history boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.chat_shares TO authenticated;
GRANT ALL ON public.chat_shares TO service_role;
ALTER TABLE public.chat_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone signed in reads shares" ON public.chat_shares FOR SELECT TO authenticated USING (true);
CREATE POLICY "create own shares" ON public.chat_shares FOR INSERT TO authenticated
WITH CHECK (owner_id = auth.uid() AND EXISTS (SELECT 1 FROM public.characters c WHERE c.id = character_id AND c.owner_id = auth.uid()));
CREATE POLICY "delete own shares" ON public.chat_shares FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE OR REPLACE FUNCTION public.is_shared_character(_character_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.chat_shares WHERE character_id = _character_id) $$;
CREATE OR REPLACE FUNCTION public.is_shared_history(_character_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.chat_shares WHERE character_id = _character_id AND owner_id = _user_id AND include_history) $$;

CREATE POLICY "read shared characters" ON public.characters FOR SELECT TO authenticated USING (public.is_shared_character(id));
CREATE POLICY "read shared history" ON public.messages FOR SELECT TO authenticated USING (public.is_shared_history(character_id, user_id));