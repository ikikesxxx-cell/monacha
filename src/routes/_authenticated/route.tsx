import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { MusicPlayer } from "@/components/MusicPlayer";
import { claimGuestProgress } from "@/lib/guest";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    if (!data.user.is_anonymous) await claimGuestProgress().catch(() => false);
    return { user: data.user };
  },
  component: () => (
    <div className="min-h-screen bg-cozy">
      <AppHeader />
      <Outlet />
      <MusicPlayer />
    </div>
  ),
});
