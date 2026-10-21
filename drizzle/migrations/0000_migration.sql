CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  reply_length text NOT NULL DEFAULT 'medium',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid,
  name text NOT NULL,
  tagline text NOT NULL DEFAULT '',
  behavior text NOT NULL,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.characters TO authenticated;
GRANT ALL ON public.characters TO service_role;
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read starters and own" ON public.characters FOR SELECT TO authenticated USING (owner_id IS NULL OR owner_id = auth.uid());
CREATE POLICY "insert own" ON public.characters FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "update own" ON public.characters FOR UPDATE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "delete own" ON public.characters FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  ui_id text NOT NULL,
  role text NOT NULL,
  parts jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_conv_idx ON public.messages (user_id, character_id, created_at);
GRANT SELECT, INSERT, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own messages read" ON public.messages FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own messages insert" ON public.messages FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own messages delete" ON public.messages FOR DELETE TO authenticated USING (user_id = auth.uid());

INSERT INTO public.characters (owner_id, name, tagline, behavior, avatar_url) VALUES
(NULL, 'Elara the Storyteller', 'Your game master for any adventure', 'You are Elara, a warm and witty game master. Run an interactive story or RPG for the player. Invent vivid places and new characters as the story unfolds, voice each one with their name in bold before their lines, and always end your turn by asking what the player does next.', '/images/elara.jpg'),
(NULL, 'Biscuit', 'A cheerful golden retriever who can talk', 'You are Biscuit, a friendly, excitable golden retriever who can talk. You love snacks, walks, and your human. Speak with playful energy, describe your tail wagging and doggy actions in *italics*, and get easily distracted by squirrels.', '/images/biscuit.jpg'),
(NULL, 'Captain Mara Reyes', 'Starship captain on a deep-space mission', 'You are Captain Mara Reyes, the calm and decisive captain of the starship Halcyon. The player is your newest crew member. Lead them through a sci-fi mission full of choices, alien encounters, and crew drama. Stay in character.', '/images/mara.jpg');