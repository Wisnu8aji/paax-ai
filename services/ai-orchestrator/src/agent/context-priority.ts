import type { ContextSnippet } from "./prompt-builder";

export type ContextItemCategory =
  | "system_core"
  | "user_intent"
  | "active_skill"
  | "memory_constraint"
  | "recent_history"
  | "older_history"
  | "document_reference";

export interface PrioritizedContextItem extends ContextSnippet {
  readonly id: string;
  readonly category: ContextItemCategory;
  readonly priorityWeight: number; // 0 to 100
  readonly pinned?: boolean;
}

export const CATEGORY_DEFAULT_WEIGHTS: Record<ContextItemCategory, number> = {
  system_core: 100,
  user_intent: 90,
  active_skill: 80,
  memory_constraint: 70,
  recent_history: 50,
  older_history: 30,
  document_reference: 20,
};

export interface ContextPruningResult {
  readonly selected: readonly PrioritizedContextItem[];
  readonly omitted: readonly PrioritizedContextItem[];
  readonly totalChars: number;
  readonly budgetChars: number;
}

export class ContextPriorityEngine {
  /**
   * Assigns category and priority weight to a snippet.
   */
  static categorize(item: Partial<PrioritizedContextItem> & { text: string; id: string }): PrioritizedContextItem {
    let category: ContextItemCategory = item.category ?? "older_history";

    if (!item.category) {
      if (item.text.startsWith("[current user]") || item.text.startsWith("[current assistant]")) {
        category = "user_intent";
      } else if (item.text.startsWith("[memory constraint]")) {
        category = "memory_constraint";
      } else if (item.text.startsWith("[skill")) {
        category = "active_skill";
      } else if (item.text.startsWith("[system]")) {
        category = "system_core";
      } else if (item.text.startsWith("[history")) {
        category = "recent_history";
      }
    }

    const priorityWeight = item.priorityWeight ?? CATEGORY_DEFAULT_WEIGHTS[category];

    return {
      id: item.id,
      text: item.text,
      category,
      priorityWeight,
      pinned: item.pinned ?? (category === "system_core" || category === "user_intent"),
      projectId: item.projectId,
      sourceId: item.sourceId,
      evidenceRefs: item.evidenceRefs,
    };
  }

  /**
   * Sorts and selects snippets to fit strictly within a character/token budget.
   * High-priority and pinned items are guaranteed retention unless budget is physically exceeded.
   */
  static pruneToBudget(
    items: readonly PrioritizedContextItem[],
    budgetChars: number,
  ): ContextPruningResult {
    // Sort items by priority descending
    const sorted = [...items].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return b.priorityWeight - a.priorityWeight;
    });

    const selected: PrioritizedContextItem[] = [];
    const omitted: PrioritizedContextItem[] = [];
    let currentChars = 0;

    for (const item of sorted) {
      const itemLen = item.text.length + 1; // plus separator newline
      if (currentChars + itemLen <= budgetChars || item.pinned) {
        selected.push(item);
        currentChars += itemLen;
      } else {
        omitted.push(item);
      }
    }

    return {
      selected: Object.freeze(selected),
      omitted: Object.freeze(omitted),
      totalChars: currentChars,
      budgetChars,
    };
  }
}
