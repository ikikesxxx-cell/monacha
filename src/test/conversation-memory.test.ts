import { describe, expect, it } from "vitest";
import { isLowInformation, memoryContext, normalizeMemory, RECENT_MESSAGE_COUNT, mergeMemory, selectRecall, MAX_MEMORY_FACTS, RECALL_CHARACTER_BUDGET } from "@/lib/conversation-memory";

describe("story memory priorities", () => {
  it("retains 2000 durable facts rather than dropping everything beyond 200", () => {
    const facts = Array.from({ length: 2000 }, (_, i) => ({ key: `event.${i}`, category: "key_information", detail: `Milestone ${i}` }));
    expect(normalizeMemory({ facts, summary: "" }).facts).toHaveLength(2000);
  });
  it("keeps older relationships when extraction returns only new facts", () => {
    const previous = normalizeMemory({ facts: [{ key: "relationship.mara", category: "key_information", detail: "Mara promised to return the silver ring" }], summary: "Mara is a trusted friend." });
    const merged = mergeMemory(previous, { facts: [{ key: "player.location", category: "location", detail: "Harbor" }], summary: "Now at the harbor." });
    expect(merged.facts.map((f) => f.detail)).toEqual(["Mara promised to return the silver ring", "Harbor"]);
  });
  it("keeps current player facts when the durable archive is full", () => {
    const memory = normalizeMemory({ facts: [{ key: "player.location", category: "location", detail: "Harbor" }, ...Array.from({ length: 2100 }, (_, i) => ({ key: `event.${i}`, category: "key_information", detail: `Event ${i}` }))], summary: "" });
    expect(memory.facts).toHaveLength(MAX_MEMORY_FACTS);
    expect(memory.facts.find((f) => f.key === "player.location")?.detail).toBe("Harbor");
  });
  it("retrieves an old relevant secret beyond the recent recall window", () => {
    const memory = normalizeMemory({ facts: [{ key: "vault.code", category: "key_information", detail: "The vault code is 7412" }, ...Array.from({ length: 1900 }, (_, i) => ({ key: `event.${i}`, category: "key_information", detail: `Visit number ${i}` }))], summary: "" });
    expect(selectRecall(memory, "What is the vault code?").facts.find((f) => f.key === "vault.code")?.detail).toBe("The vault code is 7412");
  });
  it("bounds reply context even with maximum-sized memory", () => {
    const memory = normalizeMemory({ facts: Array.from({ length: 2000 }, (_, i) => ({ key: `event.${i}`, category: "key_information", detail: "x".repeat(600) })), summary: "s".repeat(24000) });
    expect(JSON.stringify(selectRecall(memory)).length).toBeLessThanOrEqual(RECALL_CHARACTER_BUDGET);
    expect(memory.summary.length).toBe(24000);
  });
  it("rejects invalid extraction without silently clearing memory", () => {
    expect(() => mergeMemory({ facts: [], summary: "A remembered story" }, { nonsense: true })).toThrow("memory update was invalid");
  });
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