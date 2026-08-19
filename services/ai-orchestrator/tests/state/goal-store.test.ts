import { describe, expect, it } from "vitest";
import { createGoalStore } from "../../src/state/goal-store";

describe("PAAX Persistent Goal Store (paax-goals)", () => {
  it("creates, tracks, and updates goal progress and status", () => {
    const store = createGoalStore();
    const goal = store.createGoal({
      title: "Complete Structural RAB for Phase 1",
      description: "Estimate foundation, columns, beams, and slab",
      priority: "high",
      progress: 0,
      deadline: "2026-09-01T00:00:00Z",
    });

    expect(goal.id).toBeDefined();
    expect(goal.status).toBe("pending");
    expect(goal.progress).toBe(0);

    const updated = store.updateGoalProgress(goal.id, 50, "Completed foundation and column takeoff");
    expect(updated.progress).toBe(50);
    expect(updated.notes?.length).toBe(1);

    const completed = store.updateGoalProgress(goal.id, 100, "Final review approved by lead engineer");
    expect(completed.progress).toBe(100);
    expect(completed.status).toBe("completed");
  });

  it("filters goals by status and priority", () => {
    const store = createGoalStore();
    store.createGoal({ title: "Goal 1", status: "pending", priority: "low" });
    store.createGoal({ title: "Goal 2", status: "in_progress", priority: "critical" });
    store.createGoal({ title: "Goal 3", status: "completed", priority: "critical" });

    const criticalGoals = store.listGoals({ priority: "critical" });
    expect(criticalGoals.length).toBe(2);

    const pendingGoals = store.listGoals({ status: "pending" });
    expect(pendingGoals.length).toBe(1);
    expect(pendingGoals[0].title).toBe("Goal 1");
  });

  it("deletes a goal cleanly", () => {
    const store = createGoalStore();
    const g = store.createGoal({ title: "Temporary Goal" });

    expect(store.deleteGoal(g.id)).toBe(true);
    expect(store.getGoal(g.id)).toBeUndefined();
    expect(store.deleteGoal(g.id)).toBe(false);
  });
});
