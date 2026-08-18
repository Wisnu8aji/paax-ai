import type { ConversationResult } from "./conversation-loop";
import type { IterationBudgetSnapshot } from "./iteration-budget";
import type { TurnJournalSnapshot } from "./turn-state";

export type FinalStopReason =
  | "completed"
  | "max_iterations"
  | "max_tool_calls"
  | "max_tokens"
  | "timeout"
  | "aborted"
  | "approval_rejected"
  | "provider_error"
  | "validation_error"
  | "tool_error"
  | "internal_error";

export interface TurnUsageAggregate {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  toolCalls: number;
  iterations: number;
  elapsedMs: number;
  source: "provider-metadata-and-runtime-counters";
}

export interface TurnResultEnvelope {
  protocol: "command-room.turn-result.v1";
  turnId: string;
  runId: string;
  status: "completed" | "stopped" | "failed" | "rejected" | "aborted";
  stopReason: FinalStopReason;
  summary: string;
  content?: string;
  usage: TurnUsageAggregate;
  journal: TurnJournalSnapshot;
  startedAt: string;
  finalizedAt: string;
  partial: boolean;
}

export interface FinalizedTurnResult extends ConversationResult {
  envelope: TurnResultEnvelope;
}

export interface FinalizeTurnInput {
  result: ConversationResult;
  turnId: string;
  runId: string;
  budget: IterationBudgetSnapshot;
  journal: TurnJournalSnapshot;
  startedAt: string;
  finalizedAt?: string;
}

const STOP_REASON_MAP: Record<ConversationResult["stopReason"], FinalStopReason> = {
  completed: "completed",
  iteration_limit: "max_iterations",
  model_attempt_limit: "max_iterations",
  tool_limit: "max_tool_calls",
  input_token_limit: "max_tokens",
  output_token_limit: "max_tokens",
  total_token_limit: "max_tokens",
  duration_limit: "timeout",
  aborted: "aborted",
  provider_error: "provider_error",
  response_invalid: "validation_error",
  tool_error: "tool_error",
};

export function finalizeTurn(input: FinalizeTurnInput): FinalizedTurnResult {
  const stopReason = STOP_REASON_MAP[input.result.stopReason] ?? "internal_error";
  const status = finalStatus(input.result, stopReason);
  const usage: TurnUsageAggregate = Object.freeze({
    inputTokens: safeCounter(input.budget.inputTokens),
    outputTokens: safeCounter(input.budget.outputTokens),
    totalTokens: safeCounter(input.budget.totalTokens),
    toolCalls: safeCounter(input.budget.toolCallCount),
    iterations: safeCounter(input.budget.iterationCount),
    elapsedMs: safeCounter(input.budget.elapsedMs),
    source: "provider-metadata-and-runtime-counters",
  });
  const content = typeof input.result.content === "string" && input.result.content.length > 0 ? input.result.content : undefined;
  const envelope: TurnResultEnvelope = Object.freeze({
    protocol: "command-room.turn-result.v1",
    turnId: input.turnId,
    runId: input.runId,
    status,
    stopReason,
    summary: summarize(status, stopReason, content, usage),
    ...(content === undefined ? {} : { content }),
    usage,
    journal: cloneJournal(input.journal),
    startedAt: toIso(input.startedAt),
    finalizedAt: toIso(input.finalizedAt ?? new Date().toISOString()),
    partial: status !== "completed",
  });
  return Object.freeze({ ...input.result, envelope });
}

function finalStatus(result: ConversationResult, stopReason: FinalStopReason): TurnResultEnvelope["status"] {
  if (result.status === "completed" && stopReason === "completed") return "completed";
  if (stopReason === "aborted") return "aborted";
  if (stopReason === "approval_rejected") return "rejected";
  return result.status === "stopped" ? "stopped" : "failed";
}

function summarize(status: TurnResultEnvelope["status"], stopReason: FinalStopReason, content: string | undefined, usage: TurnUsageAggregate): string {
  const contentState = content === undefined ? "without content" : "with content";
  return `turn ${status} (${stopReason}, ${contentState}; iterations=${usage.iterations}, toolCalls=${usage.toolCalls})`;
}

function safeCounter(value: number): number {
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function toIso(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error("turn finalization timestamp must be ISO-8601");
  return new Date(parsed).toISOString();
}

function cloneJournal(snapshot: TurnJournalSnapshot): TurnJournalSnapshot {
  const entries = snapshot.entries.map((entry) => deepFreeze(structuredClone(entry)));
  return Object.freeze({
    turnId: snapshot.turnId,
    version: snapshot.version,
    nextSequence: snapshot.nextSequence,
    entries: Object.freeze(entries),
    capturedAt: toIso(snapshot.capturedAt),
  });
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}
