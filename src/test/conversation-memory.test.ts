import { describe, expect, it } from "vitest";
import { isLowInformation, memoryContext, normalizeMemory, RECENT_MESSAGE_COUNT } from "@/lib/conversation-memory";

describe("story memory priorities", () => {
  it("retains the player's location", () => {
    expect(normalizeMemory({ facts: [{ key: "player.location", category: "location", detail: "At the castle" }], summary: "" }).facts[0]?.detail).toBe("At the castle");
  });
  it("retains what the player is doing", () => {
    expect(normalizeMemory({ facts: [{ key: "player.activity", category: "activity", detail: "Searching for a key" }], summary: "" }).facts[0]?.detail).toBe("Searching for a key");
  });
  it("retains key information", () => {
    expect(normalizeMemory({ facts: [{ key: "key.owner", category: "key_information", detail: "Mara has the silver key" }], summary: "" }).facts).toHaveLength(1);
  });
  it("does not promote hello to important memory", () => {
    expect(normalizeMemory({ facts: [{ key: "greeting", category: "key_information", detail: "hello" }], summary: "" }).facts).toEqual([]);
    expect(isLowInformation("Hello!")).toBe(true);
    expect(isLowInformation("Hello, I am at the castle")).toBe(false);
  });
  it("replaces an outdated location with the newest location", () => {
    expect(normalizeMemory({ facts: [
      { key: "player.location", category: "location", detail: "At the castle" },
      { key: "player.location", category: "location", detail: "At the harbor" },
    ], summary: "" }).facts.map((f) => f.detail)).toEqual(["At the harbor"]);
  });
  it("recalls older facts independently of the recent chat window", () => {
    const history = Array.from({ length: 200 }, (_, i) => i === 0 ? "The secret code is 7412" : "hello");
    const memory = normalizeMemory({ facts: [{ key: "secret.code", category: "key_information", detail: history[0] }], summary: "" });
    expect(history.slice(-RECENT_MESSAGE_COUNT)).not.toContain("The secret code is 7412");
    expect(memoryContext(memory)).toContain("7412");
  });
});