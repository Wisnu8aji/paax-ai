import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatRunStore, type StartChatRunInput } from "./chat-run-store";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function streamResponse(text: string): Response {
  const events = [
    `data: ${JSON.stringify({ type: "content", delta: text })}`,
    `data: ${JSON.stringify({ type: "done" })}`,
    "data: [DONE]",
  ].join("\n\n") + "\n\n";
  return new Response(events, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

function input(overrides: Partial<StartChatRunInput> = {}): StartChatRunInput {
  return {
    conversationId: "conv-queue-test",
    userMessageId: `user-${Math.random()}`,
    message: "uji queue",
    historyMessages: [{ role: "user", content: "uji queue" }],
    modelId: "lucent",
    modelName: "Lucent",
    ...overrides,
  };
}

async function waitFor(condition: () => boolean, timeoutMs = 2_000): Promise<void> {
  const startedAt = Date.now();
  while (!condition()) {
    if (Date.now() - startedAt > timeoutMs) throw new Error("condition timeout");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ChatRunStore queue draining", () => {
  it("reuses the queued turn id when FIFO execution starts", async () => {
    const store = new ChatRunStore();
    let chatCalls = 0;
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const seenChatRunIds: string[] = [];

    vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const target = String(url);
      if (target.endsWith("/api/command-room/chat")) {
        chatCalls += 1;
        const body = JSON.parse(String(init?.body ?? "{}")) as { runId?: string };
        seenChatRunIds.push(body.runId ?? "");
        if (chatCalls === 1) await firstGate;
        return streamResponse(`jawaban-${chatCalls}`);
      }
      if (target.includes("/queue") && init?.method === "POST") {
        return jsonResponse({ entry: { id: "queue-entry-1" }, durable: true });
      }
      if (target.includes("/queue/") && init?.method === "PUT") return jsonResponse({ durable: true });
      if (init?.method === "POST") return jsonResponse({ durable: true });
      return jsonResponse({});
    }));

    const first = input({ runId: "turn-first", message: "pertama" });
    const second = input({ runId: undefined, message: "kedua", messageSequence: 1 });
    void store.startChatRun(first);
    await waitFor(() => store.getRunsByConversationId(first.conversationId).some((run) => run.state === "running"));

    // The normal UI does not provide a runId for a new submission; the store
    // allocates the queued id and must carry it into the eventual execution.
    await store.startChatRun(second);
    await waitFor(() => store.getRunsByConversationId(first.conversationId).some((run) => run.state === "queued"));
    const queuedId = store.getRunsByConversationId(first.conversationId).find((run) => run.state === "queued")?.runId;
    expect(queuedId).toBeTruthy();

    releaseFirst();
    await waitFor(() => chatCalls === 2 && store.getRunsByConversationId(first.conversationId).some((run) => run.state === "completed" && run.runId !== "turn-first"));

    expect(seenChatRunIds).toHaveLength(2);
    expect(seenChatRunIds[1]).toBe(queuedId);
    expect(store.getRunsByConversationId(first.conversationId).filter((run) => run.state === "queued")).toHaveLength(0);
  });
});
