import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { music } from "@/lib/music";
import { authHeaders } from "@/lib/api";

const providerNames = {
  groq: "Groq",
  gemini: "Google Gemini",
  openrouter: "OpenRouter",
  pollinations: "Pollinations",
} as const;
const textProviders = ["groq", "gemini", "openrouter"] as const;
type Provider = keyof typeof providerNames;
type TextProvider = (typeof textProviders)[number];
type ProviderSettings = {
  textProvider: TextProvider;
  textModel: string;
  configured: Record<Provider, boolean>;
};
const defaultModels: Record<TextProvider, string> = {
  groq: "llama-3.3-70b-versatile",
  gemini: "gemini-2.5-flash",
  openrouter: "meta-llama/llama-3.3-70b-instruct:free",
};

const profileQuery = queryOptions({
  queryKey: ["profile"],
  queryFn: async () => {
    const { data: u } = await supabase.auth.getUser();
    const { data } = await supabase.from("profiles").select("*").eq("id", u.user!.id).maybeSingle();
    return { id: u.user!.id, email: u.user!.email, display_name: data?.display_name ?? "", reply_length: data?.reply_length ?? "medium", music_enabled: data?.music_enabled ?? true };
  },
});

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Hearthtalk" },
      { name: "description", content: "Manage your account, AI provider keys and preferences." },
      { property: "og:title", content: "Settings — Hearthtalk" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:description", content: "Manage your account, AI provider keys and preferences." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(profileQuery),
  component: SettingsPage,
});

const lengths = [
  { v: "short", l: "Short" },
  { v: "medium", l: "Medium" },
  { v: "long", l: "Long" },
];

function SettingsPage() {
  const { data } = useSuspenseQuery(profileQuery);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState(data.display_name);
  const [len, setLen] = useState(data.reply_length);
  const [musicOn, setMusicOn] = useState(data.music_enabled);
  const [providerSettings, setProviderSettings] = useState<ProviderSettings>({
    textProvider: "gemini",
    textModel: defaultModels.gemini,
    configured: { groq: false, gemini: false, openrouter: false, pollinations: false },
  });
  const [apiKeys, setApiKeys] = useState<Record<Provider, string>>({
    groq: "",
    gemini: "",
    openrouter: "",
    pollinations: "",
  });
  const [providerLoading, setProviderLoading] = useState(true);
  const [providerBusy, setProviderBusy] = useState<Provider | "chat" | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/provider-settings", { headers: await authHeaders() });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Could not load provider settings.");
        if (active) {
          setProviderSettings({
            textProvider: result.textProvider,
            textModel: result.textModel || defaultModels[result.textProvider as TextProvider],
            configured: result.configured,
          });
        }
      } catch (error) {
        if (active) toast.error((error as Error).message || "Could not load provider settings.");
      } finally {
        if (active) setProviderLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  async function save() {
    const { error } = await supabase.from("profiles").upsert({ id: data.id, display_name: name.trim(), reply_length: len, music_enabled: musicOn });
    music.set({ enabled: musicOn, playing: musicOn ? music.get().playing : false });
    if (error) { toast.error("Couldn't save settings."); return; }
    qc.invalidateQueries({ queryKey: ["profile"] });
    toast.success("Settings saved");
  }

  async function saveProviderKey(provider: Provider) {
    const apiKey = apiKeys[provider].trim();
    if (!apiKey) { toast.error("Paste a key first."); return; }
    setProviderBusy(provider);
    try {
      const response = await fetch("/api/provider-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ provider, apiKey }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save provider key.");
      setProviderSettings((current) => ({ ...current, configured: { ...current.configured, [provider]: true } }));
      setApiKeys((current) => ({ ...current, [provider]: "" }));
      toast.success(`${providerNames[provider]} key saved`);
    } catch (error) {
      toast.error((error as Error).message || "Could not save provider key.");
    } finally {
      setProviderBusy(null);
    }
  }

  async function removeProviderKey(provider: Provider) {
    setProviderBusy(provider);
    try {
      const response = await fetch("/api/provider-settings", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ provider }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not remove provider key.");
      setProviderSettings((current) => ({ ...current, configured: { ...current.configured, [provider]: false } }));
      setApiKeys((current) => ({ ...current, [provider]: "" }));
      toast.success(`${providerNames[provider]} key removed`);
    } catch (error) {
      toast.error((error as Error).message || "Could not remove provider key.");
    } finally {
      setProviderBusy(null);
    }
  }

  async function saveChatProvider() {
    setProviderBusy("chat");
    try {
      const response = await fetch("/api/provider-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ textProvider: providerSettings.textProvider, textModel: providerSettings.textModel }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save chat provider.");
      toast.success("Chat provider saved");
    } catch (error) {
      toast.error((error as Error).message || "Could not save chat provider.");
    } finally {
      setProviderBusy(null);
    }
  }

  async function clearChats() {
    if (!confirm("Delete all your chat history and story memories?")) return;
    const { error } = await supabase.from("messages").delete().eq("user_id", data.id);
    if (error) { toast.error("Couldn't clear chats."); return; }
    qc.removeQueries({ queryKey: ["messages"] });
    toast.success("All chats cleared");
  }

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-4xl font-semibold">Settings</h1>
      <div className="mt-6 space-y-6 rounded-[2rem] border border-border bg-card/90 p-6 shadow-soft">
        <div className="space-y-2">
          <Label htmlFor="dn">Your name (characters will call you this)</Label>
          <Input id="dn" value={name} onChange={(e) => setName(e.target.value)} />
          <p className="text-xs text-muted-foreground">Signed in as {data.email}</p>
        </div>
        <div className="space-y-2">
          <Label>Reply length</Label>
          <div className="flex gap-2">
            {lengths.map((o) => (
              <Button key={o.v} type="button" variant={len === o.v ? "default" : "outline"} className="flex-1 rounded-full" onClick={() => setLen(o.v)}>
                {o.l}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="mu">Background music</Label>
          <Switch id="mu" checked={musicOn} onCheckedChange={setMusicOn} />
        </div>
        <Button onClick={save} className="w-full rounded-full">Save settings</Button>
      </div>
      <section className="mt-6 space-y-5 rounded-[2rem] border border-border bg-card/90 p-6 shadow-soft">
        <div>
          <h2 className="text-xl font-semibold">AI provider keys</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Game AI uses your selected provider key, not the app owner's Lovable credits. Keys are stored privately and never sent back to this page after saving. Provider free tiers, limits, and pricing can change.
          </p>
        </div>
        {(["groq", "gemini", "openrouter", "pollinations"] as const).map((provider) => (
          <div key={provider} className="space-y-2 rounded-2xl bg-muted/50 p-4">
            <Label htmlFor={`key-${provider}`}>{providerNames[provider]} API key</Label>
            <Input
              id={`key-${provider}`}
              type="password"
              autoComplete="new-password"
              value={apiKeys[provider]}
              onChange={(event) => setApiKeys((current) => ({ ...current, [provider]: event.target.value }))}
              placeholder={providerSettings.configured[provider] ? "Saved — enter a new key to replace" : "Paste your API key"}
              disabled={providerLoading}
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                {providerSettings.configured[provider] ? "Key saved" : "No key saved"}
                {provider === "pollinations" && " · Photo and scene usage spends from your Pollinations budget"}
              </span>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" className="rounded-full" disabled={providerBusy !== null || !apiKeys[provider].trim()} onClick={() => saveProviderKey(provider)}>
                  Save key
                </Button>
                <Button type="button" size="sm" variant="ghost" className="rounded-full" disabled={providerBusy !== null || !providerSettings.configured[provider]} onClick={() => removeProviderKey(provider)}>
                  Remove
                </Button>
              </div>
            </div>
          </div>
        ))}
        <div className="space-y-3 rounded-2xl bg-muted/50 p-4">
          <Label htmlFor="text-provider">Chat and story-memory provider</Label>
          <select
            id="text-provider"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={providerSettings.textProvider}
            onChange={(event) => {
              const textProvider = event.target.value as TextProvider;
              setProviderSettings((current) => ({
                ...current,
                textProvider,
                textModel: defaultModels[textProvider],
              }));
            }}
          >
            {textProviders.map((provider) => (
              <option key={provider} value={provider}>{providerNames[provider]}{providerSettings.configured[provider] ? "" : " (key needed)"}</option>
            ))}
          </select>
          <Label htmlFor="text-model">Model name</Label>
          <Input
            id="text-model"
            value={providerSettings.textModel}
            onChange={(event) => setProviderSettings((current) => ({ ...current, textModel: event.target.value }))}
            placeholder={defaultModels[providerSettings.textProvider]}
            maxLength={160}
          />
          <Button type="button" className="w-full rounded-full" disabled={providerBusy !== null || providerLoading || !providerSettings.textModel.trim()} onClick={saveChatProvider}>
            {providerBusy === "chat" ? "Saving…" : "Save chat provider"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Get keys from{" "}
          <a className="underline" href="https://console.groq.com/keys" target="_blank" rel="noreferrer">Groq</a>,{" "}
          <a className="underline" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Google AI Studio</a>,{" "}
          <a className="underline" href="https://openrouter.ai/settings/keys" target="_blank" rel="noreferrer">OpenRouter</a>, or{" "}
          <a className="underline" href="https://enter.pollinations.ai/keys" target="_blank" rel="noreferrer">Pollinations</a>.
        </p>
      </section>
      <div className="mt-6 flex flex-col gap-3 rounded-[2rem] border border-border bg-card/90 p-6 shadow-soft">
        <Button variant="outline" className="rounded-full" onClick={clearChats}>Clear all chat history</Button>
        <Button variant="destructive" className="rounded-full" onClick={signOut}>Sign out</Button>
      </div>
    </main>
  );
}
