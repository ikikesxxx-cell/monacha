import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const ownerQuery = queryOptions({
  queryKey: ["is-owner"],
  queryFn: async () => {
    const { data, error } = await supabase.from("user_roles").select("role").eq("role", "admin");
    if (error) throw error;
    return (data ?? []).length > 0;
  },
});
