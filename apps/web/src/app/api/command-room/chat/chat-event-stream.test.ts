import { describe, expect, it } from "vitest";
import { ChatEventStream } from "./chat-event-stream";

describe("ChatEventStream", () => {
  it("assigns ordered durable envelopes and maps provider/tool callbacks", () => {
    const events: unknown[] = [];
    const stream = new ChatEventStream({
      conversationId: "conversation-1",
      turnId: "turn-1",
      runtimeId: "runtime-1",
      model: { alias: "lucent", display_name: "Lucent" },
      eventIdFactory: (sequence) => `evt-${sequence}`,
      now: () => "2026-08-17T00:00:00.000Z",
    }, (event) => events.push(event));

    stream.turnStarted("halo");
    stream.fromLegacy({ type: "status", statusLabel: "Mencari sumber", phase: "search" });
    stream.fromLegacy({ type: "tool_call", tool: "web_search", toolCallId: "tool-1" });
    stream.fromLegacy({ type: "tool_result", tool: "web_search", toolCallId: "tool-1", summary: "2 sumber" });
    stream.fromLegacy({ type: "artifact", filename: "hasil.xlsx", dataUri: "data:application/octet-stream;base64,secret" });

    expect(events).toHaveLength(5);
    expect(events.map((event) => (event as { type: string }).type)).toEqual([
      "turn.started",
      "assistant.interim",
      "tool.started",
      "tool.completed",
      "artifact.created",
    ]);
    expect(events.map((event) => (event as { sequence: number }).sequence)).toEqual([0, 1, 2, 3, 4]);
    expect(JSON.stringify(events)).not.toContain("data:application");
    expect(events[0]).toMatchObject({ event_id: "evt-0", conversation_id: "conversation-1", turn_id: "turn-1", runtime_id: "runtime-1" });
  });

  it("maps structured tool errors to failed lifecycle events", () => {
    const events: unknown[] = [];
    const stream = new ChatEventStream({
      conversationId: "conversation-1",
      turnId: "turn-1",
      runtimeId: "runtime-1",
      model: { alias: "lucent", display_name: "Lucent" },
    }, (event) => events.push(event));

    stream.fromLegacy({ type: "tool_result", tool: "web_search", toolCallId: "tool-1", result: { error: "provider unavailable" } });

    expect(events[0]).toMatchObject({ type: "tool.failed", error: "provider unavailable", tool_call_id: "tool-1" });
  });
});
