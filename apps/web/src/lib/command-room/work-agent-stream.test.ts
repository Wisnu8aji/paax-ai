import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkAgentStore } from "./work-agent-store";

function streamFor(events: Array<Record<string, unknown>>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const event of events) controller.enqueue(encoder.encode(`event: message\ndata: ${JSON.stringify(event)}\n\n`));
      controller.close();
    },
  });
}

describe("Work agent SSE transport", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("posts a session-scoped turn and projects the streamed events", async () => {
    const fetchMock = vi.fn((_url: string, init: RequestInit) => {
      const request = JSON.parse(String(init.body)) as { runId: string };
      const runId = request.runId;
      return Promise.resolve(new Response(streamFor([
        { type: "turn.started", runId, conversationId: "session-1", eventId: `${runId}:0`, sequence: 0, timestamp: "2026-08-16T00:00:00.000Z" },
        { type: "assistant.delta", runId, conversationId: "session-1", eventId: `${runId}:1`, sequence: 1, timestamp: "2026-08-16T00:00:01.000Z", delta: "Selesai" },
        { type: "turn.completed", runId, conversationId: "session-1", eventId: `${runId}:2`, sequence: 2, timestamp: "2026-08-16T00:00:02.000Z", finalMarkdown: "Selesai" },
      ]), { status: 200, headers: { "Content-Type": "text/event-stream" } }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const store = new WorkAgentStore(null);
    store.createSession("Local task", "session-1");

    await store.startTurn("session-1", "List the files.");

    expect(fetchMock).toHaveBeenCalledWith("/api/command-room/work", expect.objectContaining({ method: "POST" }));
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request).toMatchObject({ mode: "work", session: { channel: "command_room", conversationId: "session-1" }, thinking: "on" });
    expect(request.messages).toEqual([{ role: "user", content: "List the files." }]);
    expect(store.getSession("session-1")).toMatchObject({ state: "completed", answer: "Selesai", lastSequence: 2 });
  });
});
