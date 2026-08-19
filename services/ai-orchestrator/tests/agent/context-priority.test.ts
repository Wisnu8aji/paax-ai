import { describe, expect, it } from "vitest";
import { ContextPriorityEngine, type PrioritizedContextItem } from "../../src/agent/context-priority";

describe("PAAX Context Priority Engine (paax-context)", () => {
  it("categorizes snippets and assigns default priority weights", () => {
    const item = ContextPriorityEngine.categorize({
      id: "1",
      text: "[memory constraint] Concrete strength must be min K-350",
    });

    expect(item.category).toBe("memory_constraint");
    expect(item.priorityWeight).toBe(70);
  });

  it("prunes low priority snippets when budget is exceeded while retaining pinned items", () => {
    const items: PrioritizedContextItem[] = [
      {
        id: "core-sys",
        text: "You are PAAX Engineering Assistant.",
        category: "system_core",
        priorityWeight: 100,
        pinned: true,
      },
      {
        id: "old-1",
        text: "Old long history text snippet that occupies plenty of space in the context.",
        category: "older_history",
        priorityWeight: 30,
      },
      {
        id: "recent-1",
        text: "Recent user question: What is the volume of column K1?",
        category: "user_intent",
        priorityWeight: 90,
        pinned: true,
      },
    ];

    // Restrict budget so that old-1 is omitted
    const budget = 120;
    const result = ContextPriorityEngine.pruneToBudget(items, budget);

    expect(result.selected.map((i) => i.id)).toContain("core-sys");
    expect(result.selected.map((i) => i.id)).toContain("recent-1");
    expect(result.omitted.map((i) => i.id)).toContain("old-1");
  });
});
