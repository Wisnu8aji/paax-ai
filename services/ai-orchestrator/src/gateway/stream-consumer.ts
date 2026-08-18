import type { GatewayWorkEvent } from "@paax/schemas";
import type { GatewayWorkEventEmitter } from "./work-events";
import { sanitizeGatewayWorkEvent } from "./work-events";

const DEFAULT_QUEUE_SIZE = 256;
const DEFAULT_WRITE_TIMEOUT_MS = 15_000;

export interface WorkEventOutput {
  write(chunk: string): Promise<void>;
  flush?(): Promise<void>;
  close(): Promise<void>;
  isClosed(): boolean;
}

export interface WorkEventStreamMetrics {
  emitted: number;
  delivered: number;
  dropped: number;
  duplicates: number;
  replayed: number;
  replayErrors: number;
  cursorSequence: number;
  writeErrors: number;
  aborted: number;
  firstEventAt?: string;
  lastEventAt?: string;
  closedAt?: string;
}

export class WorkEventStreamError extends Error {
  readonly code: "stream_closed" | "stream_aborted" | "queue_overflow" | "write_timeout" | "write_failed" | "invalid_event" | "replay_binding_mismatch" | "replay_failed";

  constructor(code: WorkEventStreamError["code"], message: string) {
    super(message);
    this.name = "WorkEventStreamError";
    this.code = code;
  }
}

interface QueueEntry {
  event: GatewayWorkEvent;
  resolve: () => void;
  reject: (error: unknown) => void;
}

export interface WorkEventReplayRecord {
  runId: string;
  sessionId: string;
  sequence: number;
  eventId: string;
  type: string;
  payload: unknown;
  timestamp: string;
}

export interface WorkEventReplaySource {
  replay(input: { runId: string; sessionId: string; afterSequence?: number; limit?: number }): readonly WorkEventReplayRecord[];
}

export interface WorkEventReplayOptions {
  source: WorkEventReplaySource;
  runId: string;
  sessionId: string;
  conversationId?: string;
  afterSequence?: number;
  limit?: number;
}

export interface WorkEventStreamConsumerOptions {
  output: WorkEventOutput;
  serialize: (event: GatewayWorkEvent) => string;
  maxQueueSize?: number;
  writeTimeoutMs?: number;
  now?: () => string;
  onError?: (error: unknown) => void | Promise<void>;
  createErrorEvent?: (error: WorkEventStreamError) => GatewayWorkEvent | null;
  replay?: WorkEventReplayOptions;
}

export function createWorkEventStreamConsumer(
  emitter: GatewayWorkEventEmitter,
  options: Omit<WorkEventStreamConsumerOptions, "serialize">,
): WorkEventStreamConsumer {
  return new WorkEventStreamConsumer({
    ...options,
    serialize: (event) => emitter.serialize(event),
  });
}

type ConsumerState = "open" | "completing" | "failing" | "aborted" | "closed";

function safeError(error: unknown, fallback: WorkEventStreamError): WorkEventStreamError {
  if (error instanceof WorkEventStreamError) return error;
  return fallback;
}

/**
 * Single-writer delivery boundary for the canonical GatewayWorkEvent envelope.
 * The queue is deliberately in-memory and bounded; it is not a replay buffer.
 */
export class WorkEventStreamConsumer {
  private readonly maxQueueSize: number;
  private readonly writeTimeoutMs: number;
  private readonly now: () => string;
  private readonly queue: QueueEntry[] = [];
  private state: ConsumerState = "open";
  private lastSequence = -1;
  private draining = false;
  private drainPromise: Promise<void> | undefined;
  private closePromise: Promise<void> | undefined;
  private completePromise: Promise<void> | undefined;
  private failurePromise: Promise<void> | undefined;
  private replayPromise: Promise<void> | undefined;
  private errorNotified = false;
  private errorEventAttempted = false;
  private readonly streamMetrics: WorkEventStreamMetrics = {
    emitted: 0,
    delivered: 0,
    dropped: 0,
    duplicates: 0,
    replayed: 0,
    replayErrors: 0,
    cursorSequence: -1,
    writeErrors: 0,
    aborted: 0,
  };

  constructor(private readonly options: WorkEventStreamConsumerOptions) {
    this.maxQueueSize = Math.max(1, Math.floor(options.maxQueueSize ?? DEFAULT_QUEUE_SIZE));
    this.writeTimeoutMs = Math.max(1, Math.floor(options.writeTimeoutMs ?? DEFAULT_WRITE_TIMEOUT_MS));
    this.now = options.now ?? (() => new Date().toISOString());
  }

  push(event: GatewayWorkEvent): Promise<void> {
    if (!event || typeof event.sequence !== "number" || typeof event.type !== "string") {
      return Promise.reject(new WorkEventStreamError("invalid_event", "work event is invalid"));
    }
    if (this.state !== "open") {
      this.streamMetrics.dropped += 1;
      return Promise.reject(this.closedError());
    }
    if (event.sequence <= this.lastSequence) {
      this.streamMetrics.dropped += 1;
      this.streamMetrics.duplicates += 1;
      return Promise.resolve();
    }
    if (this.queue.length >= this.maxQueueSize) {
      this.streamMetrics.dropped += 1;
      const overflow = new WorkEventStreamError("queue_overflow", "work event delivery queue is full");
      const failure = this.fail(overflow);
      return failure.then(() => Promise.reject(overflow));
    }

    this.lastSequence = event.sequence;
    this.streamMetrics.emitted += 1;
    this.streamMetrics.cursorSequence = event.sequence;
    const delivery = new Promise<void>((resolve, reject) => {
      this.queue.push({ event, resolve, reject });
    });
    void this.startDrain();
    return delivery;
  }

  /** Replays bound durable events through the same single-writer queue as live events. */
  async replay(): Promise<void> {
    if (!this.options.replay) return;
    if (this.replayPromise) return this.replayPromise;
    if (this.state !== "open") throw this.closedError();
    const replayOptions = this.options.replay;
    const afterSequence = replayOptions.afterSequence ?? -1;
    if (!Number.isInteger(afterSequence) || afterSequence < -1) {
      throw new WorkEventStreamError("replay_failed", "replay cursor is invalid");
    }
    this.lastSequence = Math.max(this.lastSequence, afterSequence);
    this.streamMetrics.cursorSequence = Math.max(this.streamMetrics.cursorSequence, afterSequence);
    this.replayPromise = (async () => {
      let entries: readonly WorkEventReplayRecord[];
      try {
        entries = replayOptions.source.replay({
          runId: replayOptions.runId,
          sessionId: replayOptions.sessionId,
          afterSequence,
          limit: replayOptions.limit,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "durable replay failed";
        if (/binding|session/i.test(message)) throw new WorkEventStreamError("replay_binding_mismatch", "durable replay binding mismatch");
        throw new WorkEventStreamError("replay_failed", "durable replay failed");
      }
      for (const entry of entries) {
        if (entry.runId !== replayOptions.runId || entry.sessionId !== replayOptions.sessionId) {
          throw new WorkEventStreamError("replay_binding_mismatch", "durable replay binding mismatch");
        }
        const payload = entry.payload && typeof entry.payload === "object" && !Array.isArray(entry.payload)
          ? entry.payload as Record<string, unknown>
          : {};
        const candidate = {
          ...payload,
          runId: entry.runId,
          eventId: entry.eventId,
          sequence: entry.sequence,
          type: entry.type,
          timestamp: entry.timestamp,
          ...(replayOptions.conversationId && !payload.conversationId ? { conversationId: replayOptions.conversationId } : {}),
        };
        const event = sanitizeGatewayWorkEvent(candidate);
        if (!event) throw new WorkEventStreamError("invalid_event", "persisted work event is invalid");
        this.streamMetrics.replayed += 1;
        await this.push(event);
      }
    })().catch((error) => {
      this.streamMetrics.replayErrors += 1;
      throw error;
    }).finally(() => {
      this.replayPromise = undefined;
    });
    return this.replayPromise;
  }

  async fail(error: unknown): Promise<void> {
    if (this.state === "closed" || this.state === "aborted") return this.closeOnce();
    if (this.failurePromise) return this.failurePromise;
    const failure = error instanceof WorkEventStreamError
      ? error
      : new WorkEventStreamError("write_failed", "work event delivery failed");
    this.state = "failing";
    this.failurePromise = this.finishFailure(failure, error);
    return this.failurePromise;
  }

  async complete(): Promise<void> {
    if (this.completePromise) return this.completePromise;
    if (this.state === "closed" || this.state === "aborted" || this.state === "failing") return this.closeOnce();
    this.state = "completing";
    this.completePromise = (async () => {
      await this.startDrain();
      if (this.state !== "completing") return;
      try {
        await this.options.output.flush?.();
      } catch (error) {
        await this.fail(error);
        return;
      }
      await this.closeOnce();
    })();
    return this.completePromise;
  }

  async abort(_reason = "aborted"): Promise<void> {
    if (this.state === "closed") return;
    if (this.state !== "aborted") {
      this.state = "aborted";
      this.streamMetrics.aborted += 1;
      this.rejectQueued(this.closedError());
    }
    await this.closeOnce();
  }

  metrics(): WorkEventStreamMetrics {
    return { ...this.streamMetrics };
  }

  private async startDrain(): Promise<void> {
    if (this.draining) return this.drainPromise ?? Promise.resolve();
    const promise = this.drain();
    this.drainPromise = promise;
    void promise.then(
      () => { if (this.drainPromise === promise) this.drainPromise = undefined; },
      () => { if (this.drainPromise === promise) this.drainPromise = undefined; },
    );
    return promise;
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length > 0 && (this.state === "open" || this.state === "completing" || this.state === "failing")) {
        const entry = this.queue.shift()!;
        try {
          const chunk = this.options.serialize(entry.event);
          if (!chunk) throw new WorkEventStreamError("invalid_event", "work event serialization failed");
          await this.writeWithTimeout(chunk);
          this.streamMetrics.delivered += 1;
          this.streamMetrics.firstEventAt ??= this.now();
          this.streamMetrics.lastEventAt = this.now();
          entry.resolve();
        } catch (error) {
          const failure = safeError(error, new WorkEventStreamError("write_failed", "work event write failed"));
          this.streamMetrics.writeErrors += 1;
          entry.reject(failure);
          this.rejectQueued(failure);
          if ((this.state as ConsumerState) === "aborted") {
            await this.closeOnce();
          } else if (this.state !== "failing") {
            this.state = "failing";
            await this.notifyError(error);
            this.enqueueErrorEvent(failure);
          } else {
            await this.closeOnce();
            break;
          }
          if (this.state !== "failing" || this.queue.length === 0) {
            await this.closeOnce();
            break;
          }
        }
      }
      if (this.state === "failing" && !this.closePromise) await this.closeOnce();
    } finally {
      this.draining = false;
    }
  }

  private async writeWithTimeout(chunk: string): Promise<void> {
    if (this.options.output.isClosed()) throw new WorkEventStreamError("stream_closed", "work event output is closed");
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.options.output.write(chunk),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new WorkEventStreamError("write_timeout", "work event write timed out")), this.writeTimeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async finishFailure(failure: WorkEventStreamError, original: unknown): Promise<void> {
    await this.notifyError(original);
    this.enqueueErrorEvent(failure);
    await this.startDrain();
    await this.closeOnce();
  }

  private enqueueErrorEvent(failure: WorkEventStreamError): void {
    if (this.errorEventAttempted || !this.options.createErrorEvent || this.state === "aborted" || this.state === "closed") return;
    this.errorEventAttempted = true;
    let event: GatewayWorkEvent | null = null;
    try {
      event = this.options.createErrorEvent(failure);
    } catch {
      event = null;
    }
    if (!event) return;
    this.lastSequence = Math.max(this.lastSequence, event.sequence);
    this.streamMetrics.emitted += 1;
    this.queue.push({ event, resolve: () => undefined, reject: () => undefined });
  }

  private async notifyError(error: unknown): Promise<void> {
    if (this.errorNotified) return;
    this.errorNotified = true;
    try {
      await this.options.onError?.(error);
    } catch {
      // Observability must not replace the stream failure or leak the original error.
    }
  }

  private rejectQueued(error: unknown): void {
    while (this.queue.length > 0) this.queue.shift()!.reject(error);
  }

  private closedError(): WorkEventStreamError {
    return this.state === "aborted"
      ? new WorkEventStreamError("stream_aborted", "work event stream was aborted")
      : new WorkEventStreamError("stream_closed", "work event stream is closed");
  }

  private async closeOnce(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.state = this.state === "aborted" ? "aborted" : "closed";
    this.streamMetrics.closedAt ??= this.now();
    this.closePromise = (async () => {
      try {
        await this.options.output.close();
      } catch (error) {
        await this.notifyError(error);
      }
    })();
    return this.closePromise;
  }
}

export interface InProcessWorkEventSinkOptions {
  writeDelayMs?: number;
  flushDelayMs?: number;
  failWrites?: boolean;
}

/** Test/runtime adapter that stores the exact canonical serialized chunks. */
export class InProcessWorkEventSink implements WorkEventOutput {
  readonly chunks: string[] = [];
  private closedState = false;
  private readonly writeDelayMs: number;
  private readonly flushDelayMs: number;
  private readonly failWrites: boolean;
  flushCount = 0;

  constructor(options: InProcessWorkEventSinkOptions = {}) {
    this.writeDelayMs = Math.max(0, options.writeDelayMs ?? 0);
    this.flushDelayMs = Math.max(0, options.flushDelayMs ?? 0);
    this.failWrites = options.failWrites ?? false;
  }

  get closed(): boolean {
    return this.closedState;
  }

  async write(chunk: string): Promise<void> {
    if (this.closedState) throw new WorkEventStreamError("stream_closed", "in-process sink is closed");
    if (this.writeDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.writeDelayMs));
    if (this.closedState) throw new WorkEventStreamError("stream_closed", "in-process sink is closed");
    if (this.failWrites) throw new WorkEventStreamError("write_failed", "in-process sink write failed");
    this.chunks.push(chunk);
  }

  async flush(): Promise<void> {
    if (this.closedState) throw new WorkEventStreamError("stream_closed", "in-process sink is closed");
    if (this.flushDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.flushDelayMs));
    this.flushCount += 1;
  }

  async close(): Promise<void> {
    this.closedState = true;
  }

  isClosed(): boolean {
    return this.closedState;
  }
}

export interface SSEResponseLike {
  write(chunk: string): boolean | void;
  end(): void;
  once?(event: string, listener: () => void): unknown;
  removeListener?(event: string, listener: () => void): unknown;
  writableEnded?: boolean;
  destroyed?: boolean;
}

/** Adapts a Node/Express response to the sink contract without creating a second event protocol. */
export class SSEWorkEventOutput implements WorkEventOutput {
  private closedState = false;

  constructor(private readonly response: SSEResponseLike) {}

  async write(chunk: string): Promise<void> {
    if (this.isClosed()) throw new WorkEventStreamError("stream_closed", "SSE response is closed");
    let accepted: boolean | void;
    try {
      accepted = this.response.write(chunk);
    } catch (error) {
      throw new WorkEventStreamError("write_failed", error instanceof Error ? "SSE response write failed" : "SSE response write failed");
    }
    if (accepted !== false) return;
    if (!this.response.once) return;
    await new Promise<void>((resolve, reject) => {
      const onDrain = () => {
        cleanup();
        if (this.isClosed()) reject(new WorkEventStreamError("stream_closed", "SSE response closed while draining"));
        else resolve();
      };
      const onClose = () => {
        cleanup();
        reject(new WorkEventStreamError("stream_closed", "SSE response closed while draining"));
      };
      const cleanup = () => {
        this.response.removeListener?.("drain", onDrain);
        this.response.removeListener?.("close", onClose);
      };
      this.response.once?.("drain", onDrain);
      this.response.once?.("close", onClose);
    });
  }

  async close(): Promise<void> {
    if (this.closedState) return;
    this.closedState = true;
    if (!this.response.writableEnded && !this.response.destroyed) this.response.end();
  }

  isClosed(): boolean {
    return this.closedState || this.response.writableEnded === true || this.response.destroyed === true;
  }
}
