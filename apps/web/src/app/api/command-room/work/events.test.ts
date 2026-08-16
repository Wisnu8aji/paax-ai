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
      "tool.generating",
      "tool.started",
      "tool.completed",
      "log.line",
      "assistant.delta",
      "turn.completed",
    ]);
    expect(events[2].tool).toMatchObject({ toolId: "tool-1", name: "file_read", state: "completed", summary: "file dibaca" });
    expect(events[2].tool.result).toEqual({ content: "ok" });
  });

  it("maps observable reasoning, task updates, and artifact metadata without binary payloads", () => {
    const events: any[] = [];
    const emitter = new WorkEventEmitter("run-2", "session-2", (event) => events.push(event));

    emitter.fromChatEvent({
      type: "activity",
      phase: "reasoning",
      activity: { step: { kind: "reason", label: "Menilai konteks kerja", detail: "Memilih sumber yang relevan." } },
    });
    emitter.fromChatEvent({
      type: "tool_result",
      tool: "todo",
      toolCallId: "todo-1",
      summary: "2 task tercatat",
      result: { tasks: [{ id: "t1", title: "Inspect", state: "in_progress" }] },
    });
    emitter.fromChatEvent({
      type: "artifact",
      tool: "export",
      filename: "report.txt",
      dataUri: "data:text/plain;base64,SECRET_PAYLOAD",
      sizeBytes: 42,
    });

    expect(events.map((event) => event.type)).toContain("reasoning.delta");
    expect(events.find((event) => event.type === "plan.updated").tasks).toEqual([
      { id: "t1", title: "Inspect", state: "in_progress" },
    ]);
    const artifact = events.find((event) => event.type === "artifact.created");
    expect(artifact.artifact).toMatchObject({ name: "report.txt", sizeBytes: 42 });
    expect(JSON.stringify(artifact)).not.toContain("SECRET_PAYLOAD");
  });
});
