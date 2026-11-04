DROP POLICY IF EXISTS "anyone signed in reads shares" ON public.chat_shares;
CREATE POLICY "read own shares" ON public.chat_shares FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE OR REPLACE FUNCTION public.get_chat_share(p_share_id uuid)
RETURNS TABLE(id uuid, owner_id uuid, character_id uuid, include_history boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.owner_id, s.character_id, s.include_history FROM public.chat_shares s
  WHERE s.id = p_share_id AND auth.uid() IS NOT NULL
$$;
REVOKE ALL ON FUNCTION public.get_chat_share(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_chat_share(uuid) TO authenticated;