import { afterEach, describe, expect, it, vi } from "vitest";
import { generatePollinationsImage } from "@/lib/server/pollinations.server";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Pollinations image requests", () => {
  it("keeps the player's key in the authorization header, not the URL", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(generatePollinationsImage({
      prompt: "a portrait",
      apiKey: "player-secret",
    })).resolves.toEqual({ bytes: new Uint8Array([1, 2, 3]), contentType: "image/png" });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("gen.pollinations.ai/image/");
    expect(String(url)).not.toContain("player-secret");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer player-secret");
  });

  it("sends reference photos only to the authenticated image-edit endpoint", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ b64_json: "AQID" }] }), {
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const reference = new File(["reference"], "reference.png", { type: "image/png" });

    await expect(generatePollinationsImage({
      prompt: "same person, warmer lighting",
      apiKey: "player-secret",
      reference,
    })).resolves.toEqual({ bytes: new Uint8Array([1, 2, 3]), contentType: "image/png" });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://gen.pollinations.ai/v1/images/edits");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer player-secret");
    expect(init?.body).toBeInstanceOf(FormData);
  });

  it("surfaces provider billing and key failures without exposing response bodies", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("private provider response", { status: 402 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generatePollinationsImage({ prompt: "a portrait", apiKey: "player-secret" }))
      .rejects.toMatchObject({ status: 402, message: "Your Pollinations budget is empty or payment is required." });
  });
});
