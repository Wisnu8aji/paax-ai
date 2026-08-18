import type { TurnUsageAggregate } from "./turn-finalizer";
import type { ToolExecutorEvent } from "./tool-executor";
import type { LoopHookContext } from "./loop-hooks";

export interface LoopObservation extends LoopHookContext {}

export interface LoopObservationLimits {
  readonly maxEvents?: number;
  readonly maxStringLength?: number;
  readonly maxMetadataEntries?: number;
}

export interface RuntimeObservation {
  onTurnStarted?(data: { runId: string; turnId: string; startedAt: string }): void | Promise<void>;
  onTurnFinalized?(data: { runId: string; turnId: string; status: string; stopReason: string; usage: TurnUsageAggregate; finalizedAt: string }): void | Promise<void>;
  onTool?(data: { runId: string; event: ToolExecutorEvent }): void | Promise<void>;
  onLoop?(data: LoopObservation): void | Promise<void>;
  onDelivery?(data: { runId: string; delivered: number; dropped: number; duplicates?: number; replayed?: number; cursorSequence?: number; writeErrors: number; aborted: number }): void | Promise<void>;
  onBackground?(data: { jobId: string; runId: string; status: string; code: string; at: string }): void | Promise<void>;
}

export async function observeSafely<T>(observer: ((data: T) => void | Promise<void>) | undefined, data: T): Promise<void> {
  try {
    await observer?.(data);
  } catch {
    // Observability is explicitly non-authoritative and cannot break a turn.
  }
}

function boundedString(value: string | undefined, limit: number): string | undefined {
  return value === undefined ? undefined : value.slice(0, limit);
}

function boundedLoopObservation(data: LoopObservation, limits: Required<LoopObservationLimits>): LoopObservation {
  const metadata: Record<string, string | number | boolean> = {};
  for (const key of Object.keys(data.metadata).sort().slice(0, limits.maxMetadataEntries)) {
    const value = data.metadata[key];
    metadata[key.slice(0, limits.maxStringLength)] = typeof value === "string" ? value.slice(0, limits.maxStringLength) : value;
  }
  return {
    runId: data.runId.slice(0, limits.maxStringLength),
    turnId: data.turnId.slice(0, limits.maxStringLength),
    iteration: Math.max(0, Math.floor(data.iteration)),
    stage: data.stage,
    ...(boundedString(data.toolCallId, limits.maxStringLength) ? { toolCallId: boundedString(data.toolCallId, limits.maxStringLength) } : {}),
    ...(boundedString(data.toolName, limits.maxStringLength) ? { toolName: boundedString(data.toolName, limits.maxStringLength) } : {}),
    ...(boundedString(data.stopReason, limits.maxStringLength) ? { stopReason: boundedString(data.stopReason, limits.maxStringLength) } : {}),
    metadata: Object.freeze(metadata),
  };
}

export function createBoundedLoopObserver(
  observer: RuntimeObservation | undefined,
  options: LoopObservationLimits = {},
): (data: LoopObservation) => Promise<void> {
  const limits: Required<LoopObservationLimits> = {
    maxEvents: Math.max(0, Math.min(Math.floor(options.maxEvents ?? 256), 2_000)),
    maxStringLength: Math.max(8, Math.min(Math.floor(options.maxStringLength ?? 128), 512)),
    maxMetadataEntries: Math.max(0, Math.min(Math.floor(options.maxMetadataEntries ?? 32), 128)),
  };
  let eventCount = 0;
  return async (data) => {
    if (!observer?.onLoop || eventCount >= limits.maxEvents) return;
    eventCount += 1;
    await observeSafely(observer.onLoop, boundedLoopObservation(data, limits));
  };
}
