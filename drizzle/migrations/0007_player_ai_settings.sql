CREATE TABLE public.player_ai_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  text_provider text NOT NULL DEFAULT 'gemini'
    CHECK (text_provider IN ('groq', 'gemini', 'openrouter')),
  text_model text NOT NULL DEFAULT '',
  groq_api_key text,
  gemini_api_key text,
  openrouter_api_key text,
  pollinations_api_key text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.player_ai_settings ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.player_ai_settings TO service_role;
REVOKE ALL ON public.player_ai_settings FROM PUBLIC, anon, authenticated;

CREATE TABLE public.conversation_scenes (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  location text NOT NULL,
  storage_path text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, character_id, location)
);

ALTER TABLE public.conversation_scenes ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.conversation_scenes TO service_role;
REVOKE ALL ON public.conversation_scenes FROM PUBLIC, anon, authenticated;
