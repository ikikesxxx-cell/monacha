const API_BASE = "https://gen.pollinations.ai";
const IMAGE_MODEL = "black-forest-labs/flux.1-schnell";
export type PollinationsImage = { bytes: Uint8Array; contentType: "image/png" | "image/jpeg" | "image/webp" };

export function imageExtension(contentType: PollinationsImage["contentType"]): string {
  return contentType === "image/jpeg" ? "jpg" : contentType === "image/webp" ? "webp" : "png";
}

export class PollinationsRequestError extends Error {
  constructor(readonly status: number) {
    super(status === 401 || status === 403
      ? "Your Pollinations key was rejected. Check it in Settings."
      : status === 402
        ? "Your Pollinations budget is empty or payment is required."
        : status === 429
          ? "Pollinations is rate limited. Please try again later."
          : "Pollinations could not generate that image. Check your key, model availability, and provider limits.");
    this.name = "PollinationsRequestError";
  }
}

export async function generatePollinationsImage({
  prompt,
  apiKey,
  reference,
  width = 1024,
  height = 1024,
  signal,
}: {
  prompt: string;
  apiKey: string | null;
  reference?: File;
  width?: number;
  height?: number;
  signal?: AbortSignal;
}): Promise<PollinationsImage> {
  let response: Response;
  if (!apiKey) {
    const query = new URLSearchParams({ model: "flux", width: String(width), height: String(height), nologo: "true", private: "true", enhance: "false", seed: String(Math.floor(Math.random() * 1e9)) });
    response = await fetch(`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0, 1800))}?${query}`, { signal: signal ?? null });
  } else if (reference) {
    const form = new FormData();
    form.set("model", IMAGE_MODEL);
    form.set("prompt", prompt);
    form.set("image", reference);
    form.set("response_format", "b64_json");
    response = await fetch(`${API_BASE}/v1/images/edits`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: signal ?? null,
    });
  } else {
    const query = new URLSearchParams({
      model: IMAGE_MODEL,
      width: String(width),
      height: String(height),
      nologo: "true",
    });
    response = await fetch(`${API_BASE}/image/${encodeURIComponent(prompt)}?${query}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: signal ?? null,
    });
  }

  if (!response.ok) throw new PollinationsRequestError(response.status);
  const contentType = response.headers.get("content-type") ?? "";
  let imageContentType: PollinationsImage["contentType"] = "image/png";
  let bytes: Uint8Array;
  if (contentType.includes("application/json")) {
    const result = (await response.json()) as { data?: { b64_json?: string }[] };
    const encoded = result.data?.[0]?.b64_json;
    if (!encoded) throw new Error("Pollinations returned no image data.");
    bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
  } else if (contentType.startsWith("image/")) {
    const mimeType = contentType.split(";")[0]?.toLowerCase();
    if (mimeType !== "image/png" && mimeType !== "image/jpeg" && mimeType !== "image/webp") {
      throw new Error("Pollinations returned an unsupported image format.");
    }
    imageContentType = mimeType;
    bytes = new Uint8Array(await response.arrayBuffer());
  } else {
    throw new Error("Pollinations returned an unsupported image response.");
  }

  if (bytes.length === 0 || bytes.length > 20 * 1024 * 1024) {
    throw new Error("Pollinations returned an invalid image size.");
  }
  return { bytes, contentType: imageContentType };
}
