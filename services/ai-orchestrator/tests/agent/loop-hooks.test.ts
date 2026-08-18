import { describe, expect, it, vi } from "vitest";
import {
  ALL_LOOP_HOOK_STAGES,
  composeLoopHooks,
  isLoopHookContext,
  isLoopHookStage,
  type LoopHookContext,
} from "../../src/agent/loop-hooks";

const context: LoopHookContext = {
  runId: "run-1",
  turnId: "turn-1",
  iteration: 2,
  stage: "before_model",
  metadata: { attempt: 1, streamed: false },
};

describe("formal loop hooks", () => {
  it("recognizes only the bounded lifecycle stages and primitive metadata", () => {
    expect(isLoopHookStage("before_model")).toBe(true);
    expect(isLoopHookStage("raw_reasoning")).toBe(false);
    expect(isLoopHookContext(context)).toBe(true);
    expect(isLoopHookContext({ ...context, metadata: { args: { secret: "x" } } })).toBe(false);
  });

  it("runs matching hooks in registration order without exposing raw payloads", async () => {
    const seen: string[] = [];
    const composed = composeLoopHooks([
      { name: "first", stages: ["before_model"], onStage: (value) => { seen.push(`${value.stage}:first`); } },
      { name: "second", stages: ALL_LOOP_HOOK_STAGES, onStage: (value) => { seen.push(`${value.stage}:second`); } },
    ]);

    await composed.onStage(context);
    await composed.onStage({ ...context, stage: "after_model", metadata: { answerLength: 4 } });

    expect(seen).toEqual(["before_model:first", "before_model:second", "after_model:second"]);
  });

  it("isolates hook failures and reports bounded failure metadata", async () => {
    const failures: unknown[] = [];
    const observer = vi.fn((failure) => { failures.push(failure); });
    const composed = composeLoopHooks([
      { name: "bad-hook", stages: ["before_model"], onStage: () => { throw new Error("private prompt must not leak"); } },
      { name: "good-hook", stages: ["before_model"], onStage: () => undefined },
    ], { onFailure: observer });

    await expect(composed.onStage(context)).resolves.toBeUndefined();
    expect(observer).toHaveBeenCalledTimes(1);
    expect(failures[0]).toMatchObject({ hookName: "bad-hook", stage: "before_model" });
    expect(JSON.stringify(failures[0])).not.toContain("private prompt");
  });
});
