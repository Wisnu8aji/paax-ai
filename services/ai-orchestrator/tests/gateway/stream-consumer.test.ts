import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import type { GatewayWorkEvent } from "@paax/schemas";
import { GatewayWorkEventEmitter } from "../../src/gateway/work-events";
import {
  InProcessWorkEventSink,
  SSEWorkEventOutput,
  WorkEventStreamConsumer,
} from "../../src/gateway/stream-consumer";
import { SessionDB } from "../../src/state/session-db";
import { DurableWorkEventStore } from "../../src/state/work-events";

function events(count: number): GatewayWorkEvent[] {
  const emitter = new GatewayWorkEventEmitter({ runId: "run-stream", conversationId: "conversation-stream", now: () => "2026-08-18T00:00:00.000Z" });
  return Array.from({ length: count }, (_, index) => emitter.emit("status.update", { phase: `phase-${index}` })!);
}

describe("WorkEventStreamConsumer", () => {
  it("preserves producer sequence through delayed sink writes", async () => {
    const sink = new InProcessWorkEventSink({ writeDelayMs: 3 });
    const consumer = new WorkEventStreamConsumer({ output: sink, serialize: (event) => new GatewayWorkEventEmitter({ runId: event.runId, conversationId: event.conversationId }).serialize(event), writeTimeoutMs: 100 });
    const input = events(3);

    await Promise.all(input.map((event) => consumer.push(event)));
    await consumer.complete();

    expect(sink.chunks.map((chunk) => JSON.parse(chunk.split("data: ")[1]).sequence)).toEqual([0, 1, 2]);
    expect(consumer.metrics()).toMatchObject({ emitted: 3, delivered: 3, dropped: 0, writeErrors: 0 });
    expect(sink.closed).toBe(true);
  });

  it("deduplicates duplicate and lower sequences without renumbering", async () => {
    const sink = new InProcessWorkEventSink();
    const consumer = new WorkEventStreamConsumer({ output: sink, serialize: (event) => JSON.stringify(event) });
    const input = events(3);

    await consumer.push(input[1]);
    await consumer.push(input[1]);
    await consumer.push(input[0]);
    await consumer.push(input[2]);
    await consumer.complete();

    expect(sink.chunks.map((chunk) => JSON.parse(chunk).sequence)).toEqual([1, 2]);
    expect(consumer.metrics()).toMatchObject({ emitted: 2, delivered: 2, dropped: 2 });
  });

  it("invokes the failure path once and closes after a write error", async () => {
    const sink = new InProcessWorkEventSink({ failWrites: true });
    const failures: unknown[] = [];
    const consumer = new WorkEventStreamConsumer({ output: sink, serialize: (event) => JSON.stringify(event), onError: (error) => { failures.push(error); } });

    await expect(consumer.push(events(1)[0])).rejects.toThrow(/write/i);
    await consumer.fail(new Error("second failure"));

    expect(failures).toHaveLength(1);
    expect(consumer.metrics()).toMatchObject({ writeErrors: 1 });
    expect(sink.closed).toBe(true);
  });

  it("fails fast on queue overflow and preserves a canonical error event", async () => {
    const sink = new InProcessWorkEventSink({ writeDelayMs: 25 });
    const errorEmitter = new GatewayWorkEventEmitter({ runId: "run-stream", conversationId: "conversation-stream" });
    const consumer = new WorkEventStreamConsumer({
      output: sink,
      serialize: (event) => JSON.stringify(event),
      maxQueueSize: 1,
      writeTimeoutMs: 500,
      createErrorEvent: () => errorEmitter.emit("error", { errorCode: "delivery_overflow", errorMessage: "delivery queue is full" }),
    });
    const input = events(3);

    const first = consumer.push(input[0]);
    const second = consumer.push(input[1]);
    await expect(consumer.push(input[2])).rejects.toThrow(/queue|closed|delivery/i);
    await Promise.allSettled([first, second]);

    expect(sink.chunks.some((chunk) => JSON.parse(chunk).type === "error")).toBe(true);
    expect(consumer.metrics().dropped).toBeGreaterThanOrEqual(1);
  });

  it("flushes before close and abort prevents future writes", async () => {
    const sink = new InProcessWorkEventSink();
    const consumer = new WorkEventStreamConsumer({ output: sink, serialize: (event) => JSON.stringify(event) });

    await consumer.push(events(1)[0]);
    await consumer.complete();
    await expect(consumer.push(events(1)[0])).rejects.toThrow(/closed|complete/i);

    const abortedSink = new InProcessWorkEventSink({ writeDelayMs: 10 });
    const aborted = new WorkEventStreamConsumer({ output: abortedSink, serialize: (event) => JSON.stringify(event) });
    const pending = aborted.push(events(1)[0]);
    await aborted.abort("client disconnected");
    await expect(pending).rejects.toThrow(/abort|closed/i);
    expect(aborted.metrics()).toMatchObject({ aborted: 1 });
  });

  it("waits for SSE drain and never writes after response close", async () => {
    const response = Object.assign(new EventEmitter(), {
      writableEnded: false,
      destroyed: false,
      chunks: [] as string[],
      write(chunk: string) {
        response.chunks.push(chunk);
        return false;
      },
      end() {
        response.writableEnded = true;
      },
    });
    const output = new SSEWorkEventOutput(response);
    const pending = output.write("event: message\n\n");
    response.emit("drain");
    await pending;
    await output.close();

    expect(response.chunks).toEqual(["event: message\n\n"]);
    await expect(output.write("late")).rejects.toThrow(/closed/i);
  });

  it("replays durable events after a bound cursor and deduplicates overlap with live events", async () => {
    const db = new SessionDB({ filename: ":memory:", testOnly: true, maxJsonBytes: 16_000, maxEventBytes: 16_000, busyTimeoutMs: 100 });
    const session = db.createOrGetSession({ sessionId: "session-replay", keyFingerprint: "fp-replay", tenantId: "tenant-replay", actorId: "actor-replay", channel: "command_room", conversationId: "conversation-stream" });
    const run = db.appendRun({ runId: "run-stream", sessionId: session.sessionId, idempotencyKey: "run-stream" });
    const store = new DurableWorkEventStore(db);
    const input = events(3);
    for (const event of input) store.append({ runId: run.runId, sessionId: session.sessionId, sequence: event.sequence, eventId: event.eventId, type: event.type, payload: event, timestamp: event.timestamp });

    const sink = new InProcessWorkEventSink();
    const consumer = new WorkEventStreamConsumer({
      output: sink,
      serialize: (event) => JSON.stringify(event),
      replay: { source: store, runId: run.runId, sessionId: session.sessionId, afterSequence: 0 },
    });
    await consumer.replay();
    await consumer.push(input[2]);
    await consumer.complete();

    expect(sink.chunks.map((chunk) => JSON.parse(chunk).sequence)).toEqual([1, 2]);
    expect(consumer.metrics()).toMatchObject({ replayed: 2, duplicates: 1, cursorSequence: 2 });
    db.close();
  });

  it("rejects replay from a different bound run or session", async () => {
    const db = new SessionDB({ filename: ":memory:", testOnly: true, maxJsonBytes: 16_000, maxEventBytes: 16_000, busyTimeoutMs: 100 });
    const session = db.createOrGetSession({ sessionId: "session-replay-bound", keyFingerprint: "fp-replay-bound", tenantId: "tenant-replay", actorId: "actor-replay", channel: "command_room", conversationId: "conversation-bound" });
    const run = db.appendRun({ runId: "run-bound", sessionId: session.sessionId, idempotencyKey: "run-bound" });
    const event = new GatewayWorkEventEmitter({ runId: run.runId, conversationId: "conversation-bound" }).emit("turn.started", { phase: "start" })!;
    const store = new DurableWorkEventStore(db);
    store.append({ runId: run.runId, sessionId: session.sessionId, sequence: event.sequence, eventId: event.eventId, type: event.type, payload: event, timestamp: event.timestamp });
    const consumer = new WorkEventStreamConsumer({ output: new InProcessWorkEventSink(), serialize: JSON.stringify, replay: { source: store, runId: run.runId, sessionId: "wrong-session" } });

    await expect(consumer.replay()).rejects.toThrow(/binding/i);
    db.close();
  });
});
