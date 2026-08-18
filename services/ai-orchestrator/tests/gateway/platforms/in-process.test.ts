import { describe, expect, it } from "vitest";
import { InProcessPlatformAdapter } from "../../../src/gateway/platforms/in-process";

const event = {
  type: "assistant.delta" as const,
  runId: "run-platform",
  conversationId: "conversation-platform",
  eventId: "run-platform:0",
  sequence: 0,
  timestamp: "2026-08-18T00:00:00.000Z",
  delta: "Selesai",
};

describe("InProcessPlatformAdapter", () => {
  it("normalizes inbound Command Room messages and preserves external identity", () => {
    const adapter = new InProcessPlatformAdapter();
    expect(adapter.normalizeInbound({ externalEventId: "external-1", tenantId: "tenant-a", actorId: "actor-a", conversationId: "conversation-a", text: "Mulai" })).toEqual({
      adapterId: "in-process",
      externalEventId: "external-1",
      tenantId: "tenant-a",
      actorId: "actor-a",
      conversationId: "conversation-a",
      text: "Mulai",
      receivedAt: expect.any(String),
    });
  });

  it("delivers each event once for an idempotency key and returns a duplicate receipt on retry", async () => {
    const delivered: unknown[] = [];
    const adapter = new InProcessPlatformAdapter({ sink: async (value) => { delivered.push(value); } });
    const target = { tenantId: "tenant-a", actorId: "actor-a", conversationId: "conversation-platform", externalEventId: "external-1", idempotencyKey: "delivery-1" };
    const first = await adapter.deliver(event, target);
    const replay = await adapter.deliver(event, target);

    expect(first).toMatchObject({ ok: true, duplicate: false, adapterId: "in-process" });
    expect(replay).toMatchObject({ ok: true, duplicate: true, adapterId: "in-process" });
    expect(delivered).toHaveLength(1);
  });

  it("rejects malformed inbound input and secret-bearing delivery payloads are sanitized", async () => {
    const adapter = new InProcessPlatformAdapter();
    expect(() => adapter.normalizeInbound({ tenantId: "tenant-a", actorId: "actor-a", conversationId: "conversation-a", text: "" })).toThrow(/external|text/i);
    const unsafe = { ...event, delta: "authorization: Bearer super-secret" };
    const delivered: unknown[] = [];
    const safeAdapter = new InProcessPlatformAdapter({ sink: async (value) => { delivered.push(value); } });
    await safeAdapter.deliver(unsafe, { tenantId: "tenant-a", actorId: "actor-a", conversationId: "conversation-a", externalEventId: "external-2" });
    expect(JSON.stringify(delivered)).not.toContain("super-secret");
  });
});
