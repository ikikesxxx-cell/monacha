import type { LanguageModel } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const TEXT_PROVIDERS = ["groq", "gemini", "openrouter"] as const;
export type TextProvider = (typeof TEXT_PROVIDERS)[number];
export type PlayerProvider = TextProvider | "pollinations";

const PROVIDERS: Record<TextProvider, { baseURL: string; defaultModel: string }> = {
  groq: { baseURL: "https://api.groq.com/openai/v1", defaultModel: "llama-3.3-70b-versatile" },
  gemini: { baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/", defaultModel: "gemini-2.5-flash" },
  openrouter: {
    baseURL: "https://openrouter.ai/api/v1",
    defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
  },
};

type PlayerAiSettings = {
  text_provider: TextProvider;
  text_model: string;
  groq_api_key: string | null;
  gemini_api_key: string | null;
  openrouter_api_key: string | null;
  pollinations_api_key: string | null;
};

export class MissingPlayerProviderKeyError extends Error {
  constructor(provider: string) {
    super(`Add your ${provider} API key in Settings to use AI features.`);
    this.name = "MissingPlayerProviderKeyError";
  }
}

export async function getPlayerAiSettings(userId: string): Promise<PlayerAiSettings | null> {
  const { data, error } = await supabaseAdmin
    .from("player_ai_settings")
    .select("text_provider,text_model,groq_api_key,gemini_api_key,openrouter_api_key,pollinations_api_key")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Could not read your provider settings.");
  return data as PlayerAiSettings | null;
}

export async function getPlayerTextModel(userId: string): Promise<LanguageModel> {
  const settings = await getPlayerAiSettings(userId);
  const providerName = settings?.text_provider ?? "gemini";
  const providerSettings = PROVIDERS[providerName];
  const apiKey = settings?.[`${providerName}_api_key` as "groq_api_key" | "gemini_api_key" | "openrouter_api_key"];
  if (!apiKey) {
    throw new MissingPlayerProviderKeyError(providerName === "gemini" ? "Google Gemini" : providerName);
  }
  const provider = createOpenAI({ baseURL: providerSettings.baseURL, apiKey });
  return provider.chat(settings?.text_model?.trim() || providerSettings.defaultModel);
}

export async function getPollinationsApiKey(userId: string): Promise<string> {
  const settings = await getPlayerAiSettings(userId);
  if (!settings?.pollinations_api_key) {
    throw new MissingPlayerProviderKeyError("Pollinations");
  }
  return settings.pollinations_api_key;
}
