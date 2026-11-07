import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Camera, Globe, Images, Library, Lock, Plus, Settings, Share2, Sparkles, Users } from "lucide-react";
import logo from "@/assets/logo.png";
import { ownerQuery } from "@/lib/owner";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { UpgradeDialog } from "@/components/UpgradeDialog";

export function AppHeader() {
  const owner = useQuery(ownerQuery);
  const [guest, setGuest] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  useEffect(() => { void supabase.auth.getUser().then(({ data }) => setGuest(!!data.user?.is_anonymous)); }, []);
  const link =
    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-card hover:text-foreground";
  const active = { className: "bg-card text-foreground shadow-soft" };
  return (
    <header className="sticky top-0 z-20 border-b border-border/60 bg-background/70 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link to="/characters" className="flex items-center gap-2">
          <img src={logo} alt="" width={36} height={36} className="h-9 w-9" />
          <span className="font-display text-xl font-semibold">Hearthtalk</span>
        </Link>
        <nav className="flex items-center gap-1">
          <Link to="/characters" className={link} activeProps={active}>
            <Users className="h-4 w-4" /> <span className="hidden sm:inline">Characters</span>
          </Link>
          <Link to="/chats" className={link} activeProps={active}>
            <Globe className="h-4 w-4" /> <span className="hidden sm:inline">Chats</span>
          </Link>
          <Link to="/create" className={link} activeProps={active}>
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Create</span>
          </Link>
          <Link to="/studio" className={link} activeProps={active}>
            <Camera className="h-4 w-4" /> <span className="hidden sm:inline">Studio</span>
          </Link>
          <Link to="/gallery" className={link} activeProps={active}>
            <Library className="h-4 w-4" /> <span className="hidden sm:inline">Gallery</span>
          </Link>
          <Link to="/review" className={link} activeProps={active}>
            <Images className="h-4 w-4" /> <span className="hidden sm:inline">Review</span>
          </Link>
          {owner.data && (
            <Link to="/vault" className={link} activeProps={active}>
              <Lock className="h-4 w-4" /> <span className="hidden sm:inline">Vault</span>
            </Link>
          )}
          {owner.data && (
            <Link to="/shared" className={link} activeProps={active}>
              <Share2 className="h-4 w-4" /> <span className="hidden sm:inline">Shared</span>
            </Link>
          )}
          <button type="button" className={link} onClick={() => setUpgradeOpen(true)}>
            <Sparkles className="h-4 w-4" /> <span className="hidden sm:inline">{guest ? "Save & Pro" : "Pro"}</span>
          </button>
          <Link to="/settings" className={link} activeProps={active}>
            <Settings className="h-4 w-4" /> <span className="hidden sm:inline">Settings</span>
          </Link>
        </nav>
      </div>
      <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} />
    </header>
  );
}
