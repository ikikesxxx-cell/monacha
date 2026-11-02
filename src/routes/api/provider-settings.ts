import { createFileRoute } from "@tanstack/react-router";

const PROVIDERS = ["groq", "gemini", "openrouter", "pollinations"] as const;
const TEXT_PROVIDERS = ["groq", "gemini", "openrouter"] as const;
type Provider = (typeof PROVIDERS)[number];
type TextProvider = (typeof TEXT_PROVIDERS)[number];
const EMPTY_SETTINGS = {
  textProvider: "gemini" as const,
  textModel: "",
  configured: { groq: false, gemini: false, openrouter: false, pollinations: false },
};
const MIGRATION_REQUIRED_MESSAGE = "AI provider settings are not initialized. Apply database migration 0007 and try again.";
const migrationRequiredResponse = () =>
  Response.json({ error: MIGRATION_REQUIRED_MESSAGE, migrationRequired: true }, { status: 503 });
const isMigrationMissing = (code: string) => code === "42P01" || code === "PGRST205";
const KEY_COLUMNS: Record<Provider, "groq_api_key" | "gemini_api_key" | "openrouter_api_key" | "pollinations_api_key"> = {
  groq: "groq_api_key",
  gemini: "gemini_api_key",
  openrouter: "openrouter_api_key",
  pollinations: "pollinations_api_key",
};

export const Route = createFileRoute("/api/provider-settings")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { getRequestUser } = await import("@/lib/server/user");
        const session = await getRequestUser(request);
        if (!session) return Response.json({ error: "Please sign in again." }, { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data, error } = await supabaseAdmin
          .from("player_ai_settings")
          .select("text_provider,text_model,groq_api_key,gemini_api_key,openrouter_api_key,pollinations_api_key")
          .eq("user_id", session.user.id)
          .maybeSingle();
        if (error) {
          if (isMigrationMissing(error.code)) {
            return Response.json({ ...EMPTY_SETTINGS, migrationRequired: true });
          }
          console.error("could not read provider settings", error.code);
          return Response.json({ error: "Could not load provider settings." }, { status: 500 });
        }
        return Response.json({
          textProvider: data?.text_provider ?? "gemini",
          textModel: data?.text_model ?? "",
          configured: {
            groq: Boolean(data?.groq_api_key),
            gemini: Boolean(data?.gemini_api_key),
            openrouter: Boolean(data?.openrouter_api_key),
            pollinations: Boolean(data?.pollinations_api_key),
          },
        });
      },
      PATCH: async ({ request }) => {
        const { getRequestUser } = await import("@/lib/server/user");
        const session = await getRequestUser(request);
        if (!session) return Response.json({ error: "Please sign in again." }, { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const body = (await request.json().catch(() => null)) as
          | { provider?: unknown; apiKey?: unknown; textProvider?: unknown; textModel?: unknown }
          | null;
        if (!body) return Response.json({ error: "Bad request." }, { status: 400 });

        const update: {
          user_id: string;
          updated_at: string;
          groq_api_key?: string | null;
          gemini_api_key?: string | null;
          openrouter_api_key?: string | null;
          pollinations_api_key?: string | null;
          text_provider?: TextProvider;
          text_model?: string;
        } = { user_id: session.user.id, updated_at: new Date().toISOString() };

        if (body.provider !== undefined) {
          if (
            !PROVIDERS.includes(body.provider as Provider) ||
            typeof body.apiKey !== "string" ||
            !body.apiKey.trim() ||
            body.apiKey.length > 4096
          ) {
            return Response.json({ error: "Invalid provider key." }, { status: 400 });
          }
          update[KEY_COLUMNS[body.provider as Provider]] = body.apiKey.trim();
        }
        if (body.textProvider !== undefined) {
          if (!TEXT_PROVIDERS.includes(body.textProvider as TextProvider)) {
            return Response.json({ error: "Invalid chat provider." }, { status: 400 });
          }
          update.text_provider = body.textProvider as TextProvider;
        }
        if (body.textModel !== undefined) {
          if (typeof body.textModel !== "string" || body.textModel.trim().length > 160) {
            return Response.json({ error: "Invalid model name." }, { status: 400 });
          }
          update.text_model = body.textModel.trim();
        }
        if (Object.keys(update).length === 2) return Response.json({ error: "No settings to save." }, { status: 400 });

        const { data: existing, error: readError } = await supabaseAdmin
          .from("player_ai_settings")
          .select("user_id")
          .eq("user_id", session.user.id)
          .maybeSingle();
        if (readError) {
          if (isMigrationMissing(readError.code)) return migrationRequiredResponse();
          console.error("could not read provider settings before update", readError.code);
          return Response.json({ error: "Could not save provider settings." }, { status: 500 });
        }
        const initialRow = {
          ...update,
          text_provider: update.text_provider ?? "gemini",
          text_model: update.text_model ?? "",
          groq_api_key: update.groq_api_key ?? null,
          gemini_api_key: update.gemini_api_key ?? null,
          openrouter_api_key: update.openrouter_api_key ?? null,
          pollinations_api_key: update.pollinations_api_key ?? null,
        };
        let error: { code: string } | null;
        if (existing) {
          ({ error } = await supabaseAdmin.from("player_ai_settings").update(update).eq("user_id", session.user.id));
        } else {
          ({ error } = await supabaseAdmin.from("player_ai_settings").insert(initialRow));
          if (error?.code === "23505") {
            ({ error } = await supabaseAdmin.from("player_ai_settings").update(update).eq("user_id", session.user.id));
          }
        }
        if (error) {
          if (isMigrationMissing(error.code)) return migrationRequiredResponse();
          console.error("could not save provider settings", error.code);
          return Response.json({ error: "Could not save provider settings." }, { status: 500 });
        }
        return Response.json({ ok: true });
      },
      DELETE: async ({ request }) => {
        const { getRequestUser } = await import("@/lib/server/user");
        const session = await getRequestUser(request);
        if (!session) return Response.json({ error: "Please sign in again." }, { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const body = (await request.json().catch(() => null)) as { provider?: unknown } | null;
        if (!body || !PROVIDERS.includes(body.provider as Provider)) {
          return Response.json({ error: "Invalid provider." }, { status: 400 });
        }
        const keyUpdate = {
          groq: { groq_api_key: null },
          gemini: { gemini_api_key: null },
          openrouter: { openrouter_api_key: null },
          pollinations: { pollinations_api_key: null },
        }[body.provider as Provider];
        const { error } = await supabaseAdmin
          .from("player_ai_settings")
          .update({ ...keyUpdate, updated_at: new Date().toISOString() })
          .eq("user_id", session.user.id);
        if (error) {
          if (isMigrationMissing(error.code)) return migrationRequiredResponse();
          console.error("could not remove provider key", error.code);
          return Response.json({ error: "Could not remove provider key." }, { status: 500 });
        }
        return Response.json({ ok: true });
      },
    },
  },
});
