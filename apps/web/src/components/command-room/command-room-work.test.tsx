// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { workAgentStore } from "@/lib/command-room/work-agent-store";
import type { WorkEvent } from "@/lib/command-room/work-agent-types";
import { CommandRoomWorkSurface } from "./command-room-work";

function event(sessionId: string, partial: Partial<WorkEvent> & Pick<WorkEvent, "type" | "sequence">): WorkEvent {
  return {
    ...partial,
    type: partial.type,
    runId: "run-ui",
    conversationId: sessionId,
    eventId: `run-ui:${partial.sequence}`,
    sequence: partial.sequence,
    timestamp: `2026-08-16T00:00:0${partial.sequence}.000Z`,
  };
}

function sseResponse(sessionId: string, runId = "run-ui-live") {
  const encoder = new TextEncoder();
  const events = [
    { type: "turn.started", runId, conversationId: sessionId, eventId: `${runId}:0`, sequence: 0, timestamp: "2026-08-16T00:00:00.000Z", message: "Read the workspace" },
    { type: "assistant.interim", runId, conversationId: sessionId, eventId: `${runId}:1`, sequence: 1, timestamp: "2026-08-16T00:00:01.000Z", message: "Saya memeriksa workspace." },
    { type: "assistant.delta", runId, conversationId: sessionId, eventId: `${runId}:2`, sequence: 2, timestamp: "2026-08-16T00:00:02.000Z", delta: "Selesai" },
    { type: "turn.completed", runId, conversationId: sessionId, eventId: `${runId}:3`, sequence: 3, timestamp: "2026-08-16T00:00:03.000Z", finalMarkdown: "Selesai" },
  ];
  return new Response(new ReadableStream({
    start(controller) {
      events.forEach((value) => controller.enqueue(encoder.encode(`event: message\ndata: ${JSON.stringify(value)}\n\n`)));
      controller.close();
    },
  }), { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

function resetStore() {
  workAgentStore.listSessions().forEach((session) => workAgentStore.removeSession(session.sessionId));
}

describe("Command Room Work surface", () => {
  afterEach(() => {
    cleanup();
    resetStore();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    resetStore();
  });

  it("opens as a neutral general workspace without provider or domain labels", async () => {
    render(<CommandRoomWorkSurface />);

    expect(screen.getByTestId("command-room-work-surface")).toBeTruthy();
    expect(screen.getByText("Work workspace")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Instruksi kerja" })).toBeTruthy();
    expect(screen.queryByText(/deepseek|mimo|model|provider|drawing|run id|project/i)).toBeNull();
    await waitFor(() => expect(screen.getByText("New work")).toBeTruthy());
  });

  it("shows the active session event ledger and keeps another session disabled while running", () => {
    workAgentStore.createSession("Active task", "session-active");
    workAgentStore.createSession("Other task", "session-other");
    workAgentStore.applyEvent("session-active", event("session-active", { type: "turn.started", sequence: 0, runId: "run-ui" }));
    render(<CommandRoomWorkSurface initialSessionId="session-active" />);

    expect(screen.getByText("Active task")).toBeTruthy();
    const other = screen.getByRole("button", { name: /Other task/ });
    expect((other as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Menjalankan permintaan")).toBeTruthy();
  });

  it("reveals technical payloads without exposing secret values", () => {
    workAgentStore.createSession("Payload task", "session-payload");
    workAgentStore.applyEvent("session-payload", event("session-payload", {
      type: "tool.completed",
      sequence: 1,
      tool: { toolId: "tool-1", name: "file_read", state: "completed", args: { path: "README.md" }, result: { content: "visible", token: "secret" }, summary: "file dibaca" },
    }));
    render(<CommandRoomWorkSurface initialSessionId="session-payload" />);

    fireEvent.click(screen.getByRole("button", { name: "Technical" }));
    expect(screen.getAllByText(/file_read/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/README\.md/).length).toBeGreaterThan(0);
    expect(screen.queryByText("secret")).toBeNull();
  });

  it("submits a real Work turn through the session-scoped SSE endpoint", async () => {
    workAgentStore.createSession("Live task", "session-live");
    const fetchMock = vi.fn((_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { conversationId: string; runId: string };
      return Promise.resolve(sseResponse(body.conversationId, body.runId));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<CommandRoomWorkSurface initialSessionId="session-live" />);

    fireEvent.change(screen.getByRole("textbox", { name: "Instruksi kerja" }), { target: { value: "Read the workspace" } });
    fireEvent.click(screen.getByRole("button", { name: "Kirim instruksi" }));

    await waitFor(() => expect(screen.getByText("Selesai")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith("/api/command-room/work", expect.anything());
  });

  it("sends approval decisions to the scoped approval endpoint", async () => {
    workAgentStore.createSession("Approval task", "session-approval");
    workAgentStore.applyEvent("session-approval", event("session-approval", {
      type: "approval.requested",
      sequence: 1,
      approval: { approvalId: "approval-1", action: "terminal_run", reason: "Perlu konfirmasi", createdAt: "2026-08-16T00:00:00.000Z", expiresAt: "2026-08-16T00:05:00.000Z", state: "pending" },
    }));
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CommandRoomWorkSurface initialSessionId="session-approval" />);

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/command-room/work/approval", expect.objectContaining({ method: "POST" })));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({ sessionId: "session-approval", approvalId: "approval-1", decision: "approved" });
  });
});
