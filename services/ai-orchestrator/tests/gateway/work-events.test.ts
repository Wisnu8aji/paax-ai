import { describe, expect, it } from "vitest";
import { GatewayWorkEventSchema } from "@paax/schemas";
import { GatewayWorkEventEmitter } from "../../src/gateway/work-events";

describe("service WorkEvent SSE emitter", () => {
  it("emits the shared envelope with deterministic sequence and exact SSE framing", () => {
    const events: unknown[] = [];
    const emitter = new GatewayWorkEventEmitter({ runId: "run-1", conversationId: "conversation-1", now: () => "2026-08-18T00:00:00.000Z", onEvent: (event) => events.push(event) });
    const first = emitter.emit("turn.started", { phase: "starting" });
    const second = emitter.emit("assistant.delta", { delta: "Selesai." });

    expect(first).toMatchObject({ type: "turn.started", runId: "run-1", conversationId: "conversation-1", eventId: "run-1:0", sequence: 0, timestamp: "2026-08-18T00:00:00.000Z" });
    expect(second?.eventId).toBe("run-1:1");
    expect(GatewayWorkEventSchema.safeParse(first).success).toBe(true);
    expect(emitter.serialize(second!)).toBe(`event: message\ndata: ${JSON.stringify(second)}\n\n`);
    expect(events).toHaveLength(2);
  });

  it("redacts secret-like payloads, bounds oversized text, and stops after close", () => {
    const events: unknown[] = [];
    const emitter = new GatewayWorkEventEmitter({ runId: "run-2", conversationId: "conversation-2", onEvent: (event) => events.push(event) });
    const event = emitter.emit("tool.completed", { tool: { toolId: "call-1", name: "file_read", state: "completed", result: { apiKey: "provider-secret", content: "x".repeat(50_000) } } });
    expect(JSON.stringify(event)).not.toContain("provider-secret");
    expect(JSON.stringify(event).length).toBeLessThan(120_000);
    expect(GatewayWorkEventSchema.safeParse(event).success).toBe(true);
    emitter.close();
    expect(emitter.emit("status.update", { phase: "late" })).toBeNull();
    expect(events).toHaveLength(1);
  });

  it("rejects invalid event payloads without leaking raw internal data", () => {
    const emitter = new GatewayWorkEventEmitter({ runId: "run-3", conversationId: "conversation-3" });
    expect(() => emitter.emit("turn.started", { unexpected: "internal stack" })).toThrow(/event/i);
    expect(emitter.serialize({} as never)).toBe("");
  });
});
