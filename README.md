# Monacha

create an ui it's an shat game you have settings and in log thing using google you can also make your own ai chat with an ai generated 100 realistic photo homan or animal all allowed you can also make your own ai by using ai generated photo and telling the ai how it must behave

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://monacha.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/92de334e-93b5-4723-bcd9-d9b97c0fd1dd).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Player AI providers

Players can add their own Groq, Google Gemini, or OpenRouter key in **Settings** for chat, story memory, and character drafting. They can add a Pollinations key for Flux portrait edits and automatic scene backgrounds. Keys are stored in a service-role-only Supabase table and the settings API returns only whether each key is configured; keys are not returned to the browser after saving. No player-triggered AI action falls back to the app owner's Lovable gateway.

Provider free tiers, model availability, rate limits, and charges are controlled by each provider and can change. Pollinations currently requires a key and image generation spends from that key's Pollen budget; it is not guaranteed to be free or keyless. Apply `drizzle/migrations/0007_player_ai_settings.sql` to the connected Supabase project before deploying these features.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
