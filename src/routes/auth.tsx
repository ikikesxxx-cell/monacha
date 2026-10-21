import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { GoogleButton } from "@/components/GoogleButton";
import logo from "@/assets/logo.png";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Hearthtalk" },
      { name: "description", content: "Sign in with Google to chat with your AI characters." },
      { property: "og:title", content: "Sign in — Hearthtalk" },
      { property: "og:description", content: "Sign in with Google to chat with your AI characters." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/characters", replace: true });
    });
    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate({ to: "/characters", replace: true });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-cozy px-4">
      <div className="w-full max-w-sm rounded-[2rem] border border-border bg-card/90 p-8 text-center shadow-soft">
        <Link to="/">
          <img src={logo} alt="Hearthtalk" width={80} height={80} className="mx-auto h-20 w-20" />
        </Link>
        <h1 className="mt-4 text-3xl font-semibold">Welcome in</h1>
        <p className="mt-2 text-muted-foreground">Sign in to meet your characters and keep your stories saved.</p>
        <div className="mt-8">
          <GoogleButton />
        </div>
      </div>
    </main>
  );
}
