import { describe, expect, it } from "vitest";
import { FakeClock } from "../helpers/fakes";
import { IterationBudget, type IterationBudgetLimits } from "../../src/agent/iteration-budget";

function limits(overrides: Partial<IterationBudgetLimits> = {}): IterationBudgetLimits {
  return {
    maxIterations: 2,
    maxModelAttempts: 3,
    maxToolCalls: 2,
    maxDurationMs: 1_000,
    maxInputTokens: 100,
    maxOutputTokens: 80,
    maxTotalTokens: 180,
    ...overrides,
  };
}

describe("IterationBudget", () => {
  it("enforces exact iteration and model-attempt boundaries", () => {
    const budget = new IterationBudget({ limits: limits() });

    expect(budget.canRequestModel()).toBe(true);
    budget.consumeModelAttempt();
    budget.consumeModelAttempt();
    expect(budget.remaining().iterations).toBe(0);
    expect(budget.canRequestModel()).toBe(false);
    expect(budget.stopReason()).toBe("iteration_limit");
  });

  it("reserves tool calls before execution and refuses one over the limit", () => {
    const budget = new IterationBudget({ limits: limits({ maxToolCalls: 2 }) });

    expect(budget.reserveToolCalls(2)).toBe(true);
    expect(budget.remaining().toolCalls).toBe(0);
    expect(budget.reserveToolCalls(1)).toBe(false);
    expect(budget.stopReason()).toBe("tool_limit");
  });

  it("records usage and stops at input/output/total token limits", () => {
    const budget = new IterationBudget({ limits: limits({ maxInputTokens: 10, maxOutputTokens: 8, maxTotalTokens: 18 }) });

    budget.recordUsage({ inputTokens: 10, outputTokens: 4, totalTokens: 14 });
    expect(budget.canRequestModel()).toBe(true);
    budget.recordUsage({ inputTokens: 1, outputTokens: 5, totalTokens: 6 });
    expect(budget.canRequestModel()).toBe(false);
    expect(budget.stopReason()).toBe("input_token_limit");
  });

  it("stops after the duration limit or an abort signal", () => {
    const clock = new FakeClock();
    const controller = new AbortController();
    const budget = new IterationBudget({ limits: limits({ maxDurationMs: 100 }), now: () => Date.parse(clock.now()), signal: controller.signal });

    expect(budget.canRequestModel()).toBe(true);
    clock.advance(101);
    expect(budget.canRequestModel()).toBe(false);
    expect(budget.stopReason()).toBe("duration_limit");

    const aborted = new IterationBudget({ limits: limits(), signal: controller.signal });
    controller.abort();
    expect(aborted.canRequestModel()).toBe(false);
    expect(aborted.stopReason()).toBe("aborted");
  });

  it("rejects negative usage and preserves the first terminal stop reason", () => {
    const budget = new IterationBudget({ limits: limits() });
    expect(() => budget.recordUsage({ inputTokens: -1 })).toThrow(/usage/i);
    budget.reserveToolCalls(2);
    budget.reserveToolCalls(1);
    budget.recordUsage({ inputTokens: 1_000 });
    expect(budget.stopReason()).toBe("tool_limit");
  });

  it("reports a readonly counter snapshot for finalization", () => {
    const budget = new IterationBudget({ limits: limits() });
    budget.consumeModelAttempt();
    budget.reserveToolCalls(1);
    budget.recordUsage({ inputTokens: 10, outputTokens: 20, totalTokens: 30 });

    expect(budget.snapshot()).toMatchObject({ iterationCount: 1, toolCallCount: 1, inputTokens: 10, outputTokens: 20, totalTokens: 30, elapsedMs: expect.any(Number), limits: { maxIterations: 2 } });
  });
});
