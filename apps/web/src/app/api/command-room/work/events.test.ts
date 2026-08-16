import { describe, expect, it } from "vitest";
import { WorkEventEmitter } from "./events";

describe("Work event emitter", () => {
  it("adds stable session identity and ordered sequence to every event", () => {
    const events: unknown[] = [];
    const emitter = new WorkEventEmitter("run-1", "session-1", (event) => events.push(event));

    emitter.emit("turn.started", { phase: "starting" });
    emitter.emit("assistant.interim", { message: "Saya mulai." });

    expect(events).toMatchObject([
      { type: "turn.started", runId: "run-1", conversationId: "session-1", eventId: "run-1:0", sequence: 0 },
      { type: "assistant.interim", eventId: "run-1:1", sequence: 1 },
    ]);
  });

  it("maps the existing provider stream vocabulary into neutral Work events", () => {
    const events: any[] = [];
    const emitter = new WorkEventEmitter("run-1", "session-1", (event) => events.push(event));

    emitter.fromChatEvent({ type: "tool_call", tool: "file_read", toolCallId: "tool-1", args: { path: "README.md" } });
    emitter.fromChatEvent({ type: "tool_result", tool: "file_read", toolCallId: "tool-1", summary: "file dibaca", result: { content: "ok" } });
    emitter.fromChatEvent({ type: "content", delta: "Selesai." });
    emitter.fromChatEvent({ type: "done" });

    expect(events.map((event) => event.type)).toEqual([
      "tool.started",
      "tool.completed",
      "assistant.delta",
      "turn.completed",
    ]);
    expect(events[1].tool).toMatchObject({ toolId: "tool-1", name: "file_read", state: "completed", summary: "file dibaca" });
    expect(events[1].tool.result).toEqual({ content: "ok" });
  });
});
