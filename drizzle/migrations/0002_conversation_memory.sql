CREATE TABLE public.conversation_memories (
 user_id uuid NOT NULL,
 character_id uuid NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
 facts jsonb NOT NULL DEFAULT '[]'::jsonb,
 summary text NOT NULL DEFAULT '',
 last_message_id uuid,
 last_message_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (user_id, character_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_memories TO authenticated;
GRANT ALL ON public.conversation_memories TO service_role;
ALTER TABLE public.conversation_memories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own conversation memory" ON public.conversation_memories FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Insert own accessible memory" ON public.conversation_memories FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.characters WHERE id = character_id));
CREATE POLICY "Update own memory" ON public.conversation_memories FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Delete own memory" ON public.conversation_memories FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE FUNCTION public.clear_memory_on_message_delete() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN DELETE FROM public.conversation_memories WHERE user_id = OLD.user_id AND character_id = OLD.character_id; RETURN OLD; END; $$;
CREATE TRIGGER clear_memory_on_message_delete AFTER DELETE ON public.messages FOR EACH ROW EXECUTE FUNCTION public.clear_memory_on_message_delete();