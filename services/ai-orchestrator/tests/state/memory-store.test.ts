import { describe, expect, it } from "vitest";
import { createMemoryStore } from "../../src/state/memory-store";

describe("PAAX Persistent Memory Store (paax-memory)", () => {
  it("creates, retrieves, and updates memory entities", () => {
    const store = createMemoryStore();
    const created = store.addMemory({
      content: "Foundation depth must be minimum 1.5m according to soil test",
      type: "constraint",
      tags: ["foundation", "soil", "structural"],
      source: "RKS Chapter 3",
    });

    expect(created.id).toBeDefined();
    expect(created.type).toBe("constraint");
    expect(created.tags).toContain("foundation");

    const retrieved = store.getMemory(created.id);
    expect(retrieved?.content).toContain("Foundation depth");

    const updated = store.updateMemory(created.id, {
      content: "Foundation depth must be minimum 2.0m after revised soil test",
    });
    expect(updated.content).toContain("2.0m");
  });

  it("filters memories by type and searches by keyword", () => {
    const store = createMemoryStore();
    store.addMemory({
      content: "Client prefers high-gloss floor tile finish",
      type: "user_preference",
      tags: ["architectural", "finishing"],
    });
    store.addMemory({
      content: "Concrete mix grade K-350 for column K1",
      type: "project_knowledge",
      tags: ["structural", "concrete"],
    });
    store.addMemory({
      content: "Contract change order approved for perimeter fence",
      type: "decision",
      tags: ["contract", "fence"],
    });

    const prefs = store.getMemoriesByType("user_preference");
    expect(prefs.length).toBe(1);
    expect(prefs[0].content).toContain("high-gloss");

    const searchResults = store.searchMemories("concrete");
    expect(searchResults.length).toBe(1);
    expect(searchResults[0].type).toBe("project_knowledge");
  });

  it("deletes memories correctly", () => {
    const store = createMemoryStore();
    const m = store.addMemory({
      content: "Temporary scaffolding note",
      type: "task_note",
    });

    expect(store.deleteMemory(m.id)).toBe(true);
    expect(store.getMemory(m.id)).toBeUndefined();
    expect(store.deleteMemory(m.id)).toBe(false);
  });
});
