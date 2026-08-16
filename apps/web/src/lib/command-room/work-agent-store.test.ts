import { describe, expect, it } from "vitest";
import { WorkAgentStore } from "./work-agent-store";
import type { WorkEvent } from "./work-agent-types";

class MemoryStorage implements Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function event(partial: Partial<WorkEvent> & Pick<WorkEvent, "type" | "sequence">): WorkEvent {
  return {
    ...partial,
    type: partial.type,
    runId: "run-1",
    conversationId: "session-1",
    eventId: `evt-${partial.sequence}`,
    sequence: partial.sequence,
    timestamp: `2026-08-16T00:00:0${partial.sequence}.000Z`,
  };
}

describe("Work agent store", () => {
  it("projects a live turn into tasks, tools, commentary, reasoning, logs, and answer", () => {
    const store = new WorkAgentStore(new MemoryStorage());
    const sessionId = store.createSession("Inspect workspace", "session-1");

    store.applyEvent(sessionId, event({ type: "turn.started", sequence: 1, runId: "run-1" }));
    store.applyEvent(sessionId, event({
      type: "plan.updated",
      sequence: 2,
      tasks: [{ id: "task-1", title: "List files", state: "in_progress" }],
    }));
    store.applyEvent(sessionId, event({
      type: "assistant.interim",
      sequence: 3,
      message: "Saya memeriksa struktur workspace.",
    }));
    store.applyEvent(sessionId, event({
      type: "reasoning.delta",
      sequence: 4,
      delta: "Menentukan batas baca.",
    }));
    store.applyEvent(sessionId, event({
      type: "tool.started",
      sequence: 5,
      tool: { toolId: "tool-1", name: "workspace_list", state: "running", args: { path: "." } },
    }));
    store.applyEvent(sessionId, event({
      type: "tool.completed",
      sequence: 6,
      tool: { toolId: "tool-1", name: "workspace_list", state: "completed", result: { count: 3 }, summary: "3 file ditemukan" },
    }));
    store.applyEvent(sessionId, event({
      type: "log.line",
      sequence: 7,
      log: { level: "info", text: "workspace_list completed" },
    }));
    store.applyEvent(sessionId, event({ type: "assistant.delta", sequence: 8, delta: "Workspace siap." }));
    store.applyEvent(sessionId, event({ type: "turn.completed", sequence: 9, finalMarkdown: "Workspace siap." }));

    const snapshot = store.getSession(sessionId);
    expect(snapshot?.state).toBe("completed");
    expect(snapshot?.tasks).toEqual([{ id: "task-1", title: "List files", state: "in_progress" }]);
    expect(snapshot?.tools[0]).toMatchObject({ toolId: "tool-1", state: "completed", summary: "3 file ditemukan" });
    expect(snapshot?.commentary).toEqual(["Saya memeriksa struktur workspace."]);
    expect(snapshot?.reasoning).toContain("Menentukan batas baca.");
    expect(snapshot?.logs[0].text).toBe("workspace_list completed");
    expect(snapshot?.answer).toBe("Workspace siap.");
    expect(snapshot?.events).toHaveLength(9);
  });

  it("ignores duplicate events and events routed to another session", () => {
    const store = new WorkAgentStore(new MemoryStorage());
    const sessionId = store.createSession("Session one", "session-1");
    const first = event({ type: "status.update", sequence: 1, statusLabel: "Menunggu" });

    store.applyEvent(sessionId, first);
    store.applyEvent(sessionId, first);
    store.applyEvent(sessionId, { ...first, eventId: "evt-other", conversationId: "session-2", sequence: 2 });

    expect(store.getSession(sessionId)?.events).toHaveLength(1);
    expect(store.getSession(sessionId)?.lastSequence).toBe(1);
  });

  it("hydrates the session ledger from the dedicated storage namespace", () => {
    const storage = new MemoryStorage();
    const firstStore = new WorkAgentStore(storage);
    const sessionId = firstStore.createSession("Persisted work", "session-1");
    firstStore.applyEvent(sessionId, event({ type: "assistant.delta", sequence: 1, delta: "persisted" }));

    const secondStore = new WorkAgentStore(storage);
    expect(secondStore.listSessions()).toHaveLength(1);
    expect(secondStore.getSession(sessionId)?.answer).toBe("persisted");
  });
});
