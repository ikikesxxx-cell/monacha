ALTER TABLE public.characters ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;
DROP POLICY IF EXISTS "read starters and own" ON public.characters;
CREATE POLICY "read starters own and public" ON public.characters FOR SELECT TO authenticated USING (owner_id IS NULL OR owner_id = auth.uid() OR is_public);

CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE TABLE public.vault_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  body text NOT NULL DEFAULT '',
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vault_items TO authenticated;
GRANT ALL ON public.vault_items TO service_role;
ALTER TABLE public.vault_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner vault all" ON public.vault_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND user_id = auth.uid())
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND user_id = auth.uid());