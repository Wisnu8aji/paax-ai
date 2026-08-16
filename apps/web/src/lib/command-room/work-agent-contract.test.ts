import { describe, expect, it } from "vitest";
import { normalizeWorkEvent, type WorkEvent } from "./work-agent-types";

describe("Work event contract", () => {
  it("accepts a session-scoped event with a stable sequence", () => {
    const event = normalizeWorkEvent({
      type: "tool.started",
      runId: "run-1",
      conversationId: "session-1",
      eventId: "evt-1",
      sequence: 4,
      timestamp: "2026-08-16T00:00:00.000Z",
      tool: { toolId: "tool-1", name: "workspace_list", args: { path: "." } },
    });

    expect(event).toMatchObject<Partial<WorkEvent>>({
      type: "tool.started",
      runId: "run-1",
      conversationId: "session-1",
      eventId: "evt-1",
      sequence: 4,
    });
  });

  it("rejects events without the active session identity", () => {
    expect(normalizeWorkEvent({
      type: "assistant.delta",
      runId: "run-1",
      eventId: "evt-2",
      sequence: 5,
      delta: "leak",
    })).toBeNull();
  });

  it("rejects malformed event types instead of showing them as logs", () => {
    expect(normalizeWorkEvent({
      type: "unknown.event",
      runId: "run-1",
      conversationId: "session-1",
      eventId: "evt-3",
      sequence: 6,
    })).toBeNull();
  });
});
