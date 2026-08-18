import { describe, expect, it } from "vitest";
import type { ConversationResult } from "../../src/agent/conversation-loop";
import { IterationBudget, type IterationBudgetSnapshot } from "../../src/agent/iteration-budget";
import { finalizeTurn } from "../../src/agent/turn-finalizer";
import { TurnJournal, type TurnJournalSnapshot } from "../../src/agent/turn-state";

function budgetSnapshot(overrides: Partial<IterationBudgetSnapshot> = {}): IterationBudgetSnapshot {
  return {
    iterationCount: 2,
    toolCallCount: 1,
    inputTokens: 10,
    outputTokens: 20,
    totalTokens: 30,
    elapsedMs: 100,
    limits: { maxIterations: 4, maxToolCalls: 4, maxTotalTokens: 100 },
    ...overrides,
  };
}

function journalSnapshot(): TurnJournalSnapshot {
  const journal = new TurnJournal(() => Date.parse("2026-08-18T00:00:00.000Z"), "turn-1");
  const started = journal.beginExecution({
    turnId: "turn-1",
    invocationId: "invocation-1",
    idempotencyKey: "turn-1:call-1",
    runId: "run-1",
    toolCallId: "call-1",
    name: "file_read",
    inputHash: "hash-1",
  });
  if (started.kind !== "started") throw new Error("expected started journal entry");
  journal.transition(started.record.invocationId, "running");
  journal.transition(started.record.invocationId, "completed", { result: { ok: true }, summary: "done" });
  return journal.snapshot();
}

function result(overrides: Partial<ConversationResult> = {}): ConversationResult {
  return {
    status: "completed",
    stopReason: "completed",
    content: "final answer",
    context: {} as ConversationResult["context"],
    ...overrides,
  };
}

describe("turn finalizer", () => {
  it("creates a protocol v1 completed envelope with exact aggregate usage", () => {
    const finalized = finalizeTurn({
      result: result(),
      turnId: "turn-1",
      runId: "run-1",
      budget: budgetSnapshot(),
      journal: journalSnapshot(),
      startedAt: "2026-08-18T00:00:00.000Z",
      finalizedAt: "2026-08-18T00:00:01.000Z",
    });

    expect(finalized.envelope).toMatchObject({
      protocol: "command-room.turn-result.v1",
      turnId: "turn-1",
      runId: "run-1",
      status: "completed",
      stopReason: "completed",
      content: "final answer",
      partial: false,
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30, toolCalls: 1, iterations: 2, elapsedMs: 100 },
    });
    expect(finalized.envelope.journal.entries[0]).toMatchObject({ status: "completed", sequence: 0 });
    expect(Object.isFrozen(finalized.envelope)).toBe(true);
  });

  it.each([
    ["iteration_limit", "stopped", "stopped", "max_iterations"],
    ["tool_limit", "stopped", "stopped", "max_tool_calls"],
    ["total_token_limit", "stopped", "stopped", "max_tokens"],
    ["duration_limit", "stopped", "stopped", "timeout"],
    ["aborted", "stopped", "aborted", "aborted"],
    ["response_invalid", "error", "failed", "validation_error"],
    ["provider_error", "error", "failed", "provider_error"],
    ["tool_error", "error", "failed", "tool_error"],
  ] as const)("maps %s deterministically and marks partial output", (stopReason, loopStatus, expectedStatus, expectedReason) => {
    const finalized = finalizeTurn({
      result: result({ status: loopStatus, stopReason, content: "partial answer" }),
      turnId: "turn-1",
      runId: "run-1",
      budget: budgetSnapshot(),
      journal: journalSnapshot(),
      startedAt: "2026-08-18T00:00:00.000Z",
      finalizedAt: "2026-08-18T00:00:01.000Z",
    });

    expect(finalized.envelope).toMatchObject({ status: expectedStatus, stopReason: expectedReason, partial: true, content: "partial answer" });
  });

  it("does not invent usage or call a provider when metadata is missing", () => {
    const input = {
      result: result({ status: "error", stopReason: "provider_error", content: undefined }),
      turnId: "turn-1",
      runId: "run-1",
      budget: budgetSnapshot({ inputTokens: 0, outputTokens: 0, totalTokens: 0, toolCallCount: 0, iterationCount: 0 }),
      journal: journalSnapshot(),
      startedAt: "2026-08-18T00:00:00.000Z",
      finalizedAt: "2026-08-18T00:00:01.000Z",
    };
    const first = finalizeTurn(input);
    const second = finalizeTurn(input);

    expect(first.envelope.usage).toMatchObject({ inputTokens: 0, outputTokens: 0, totalTokens: 0, toolCalls: 0, iterations: 0 });
    expect(first.envelope.content).toBeUndefined();
    expect(first.envelope.summary).toBe(second.envelope.summary);
  });

  it("exposes an immutable budget snapshot without changing enforcement", () => {
    const budget = new IterationBudget({ limits: { maxIterations: 3, maxModelAttempts: 3, maxToolCalls: 4, maxDurationMs: 1000, maxInputTokens: 100, maxOutputTokens: 100, maxTotalTokens: 200 } });
    budget.consumeModelAttempt();
    budget.reserveToolCalls(2);
    budget.recordUsage({ inputTokens: 10, outputTokens: 20, totalTokens: 30 });

    expect(budget.snapshot()).toMatchObject({ iterationCount: 1, toolCallCount: 2, inputTokens: 10, outputTokens: 20, totalTokens: 30, limits: { maxIterations: 3 } });
    expect(budget.remaining().toolCalls).toBe(2);
  });
});
