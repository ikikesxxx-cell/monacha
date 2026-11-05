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
  huggingface_api_key: string | null;
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
    .select("text_provider,text_model,groq_api_key,gemini_api_key,openrouter_api_key,pollinations_api_key,huggingface_api_key")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("could not read provider settings", error.code);
    return null;
  }
  return data as PlayerAiSettings | null;
}

/**
 * Ordered chain from best to worst: chosen provider, the player's other keyed providers,
 * then the free no-key service. Each step is tried when the previous one fails to start.
 */
export async function getPlayerTextModel(
  userId: string,
  onFallback?: (message: string) => void,
): Promise<LanguageModel> {
  const settings = await getPlayerAiSettings(userId);
  const chosen = settings?.text_provider ?? "gemini";
  const order = [chosen, ...TEXT_PROVIDERS.filter((p) => p !== chosen)];
  const chain: { label: string; model: any }[] = [];
  for (const name of order) {
    const apiKey = settings?.[`${name}_api_key` as "groq_api_key"];
    if (!apiKey) continue;
    const provider = createOpenAI({ baseURL: PROVIDERS[name].baseURL, apiKey });
    const modelId = name === chosen ? settings?.text_model?.trim() || PROVIDERS[name].defaultModel : PROVIDERS[name].defaultModel;
    chain.push({ label: name, model: provider.chat(modelId) });
  }
  const free = createOpenAI({ baseURL: "https://text.pollinations.ai/openai", apiKey: "free" });
  chain.push({ label: "free backup", model: free.chat("openai") });
  if (chain.length === 1) return chain[0]!.model;

  const run = async (method: "doStream" | "doGenerate", options: unknown) => {
    let lastError: unknown;
    for (let i = 0; i < chain.length; i++) {
      try {
        const result = await chain[i]!.model[method](options);
        if (i > 0) onFallback?.(`Your ${chain[0]!.label} AI is unavailable (limit or key problem), so this reply used ${chain[i]!.label} — quality may be lower.`);
        return result;
      } catch (error) {
        lastError = error;
        if ((options as { abortSignal?: AbortSignal })?.abortSignal?.aborted) throw error;
      }
    }
    throw lastError;
  };
  const primary = chain[0]!.model;
  return {
    specificationVersion: primary.specificationVersion,
    provider: primary.provider,
    modelId: primary.modelId,
    supportedUrls: primary.supportedUrls,
    doGenerate: (options: unknown) => run("doGenerate", options),
    doStream: (options: unknown) => run("doStream", options),
  } as LanguageModel;
}

/** Returns the player's Pollinations key, or null to use the free no-key service. */
export async function getPollinationsApiKey(userId: string): Promise<string | null> {
  const settings = await getPlayerAiSettings(userId);
  return settings?.pollinations_api_key || null;
}

/** Returns the player's Hugging Face token (free photo backup), or null. */
export async function getHuggingFaceApiKey(userId: string): Promise<string | null> {
  const settings = await getPlayerAiSettings(userId);
  return settings?.huggingface_api_key || null;
}
