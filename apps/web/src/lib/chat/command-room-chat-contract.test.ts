import { describe, expect, it } from "vitest";
import {
  createChatTurnState,
  reduceChatEvent,
  type ChatEvent,
} from "./command-room-chat-reducer";

const base = {
  conversation_id: "conversation-1",
  turn_id: "turn-1",
  runtime_id: "runtime-1",
};

const event = <T extends ChatEvent["type"]>(type: T, sequence: number, payload: Omit<Extract<ChatEvent, { type: T }>, keyof typeof base | "type" | "event_id" | "sequence" | "timestamp" | "runtime_id">): ChatEvent => ({
  ...base,
  type,
  event_id: `event-${sequence}`,
  sequence,
  timestamp: `2026-08-17T00:00:${String(sequence).padStart(2, "0")}.000Z`,
  ...payload,
} as ChatEvent);

describe("Command Room Chat v1.5 contract reducer", () => {
  it("keeps actual interim, final text, and tool parts in event order", () => {
    let state = createChatTurnState(base.conversation_id, base.turn_id);
    const events: ChatEvent[] = [
      event("turn.started", 0, { model: { alias: "lucent", display_name: "Lucent" } }),
      event("assistant.interim", 1, { message: "Saya memeriksa sumber yang tersedia.", phase: "context" }),
      event("tool.started", 2, { tool_call_id: "tool-1", tool: "web_search", label: "Mencari sumber" }),
      event("tool.progress", 3, { tool_call_id: "tool-1", message: "Membaca dua hasil" }),
      event("tool.completed", 4, { tool_call_id: "tool-1", tool: "web_search", summary: "2 sumber ditemukan" }),
      event("assistant.delta", 5, { delta: "Jawaban akhir." }),
      event("turn.completed", 6, { final_markdown: "Jawaban akhir." }),
    ];

    for (const item of events) state = reduceChatEvent(state, item);

    expect(state.status).toBe("completed");
    expect(state.parts.map((part) => part.kind)).toEqual(["interim", "tool", "text"]);
    expect(state.parts[0]).toMatchObject({ kind: "interim", text: "Saya memeriksa sumber yang tersedia." });
    expect(state.parts[1]).toMatchObject({ kind: "tool", toolCallId: "tool-1", state: "completed", summary: "2 sumber ditemukan" });
    expect(state.parts[2]).toMatchObject({ kind: "text", text: "Jawaban akhir." });
    expect(state.activity.map((item) => item.label)).toEqual(["Saya memeriksa sumber yang tersedia.", "Mencari sumber"]);
  });

  it("is idempotent and ignores duplicate or late packets", () => {
    let state = createChatTurnState(base.conversation_id, base.turn_id);
    const start = event("turn.started", 0, { model: { alias: "arete", display_name: "Arete" } });
    state = reduceChatEvent(state, start);
    state = reduceChatEvent(state, start);
    state = reduceChatEvent(state, event("assistant.delta", 2, { delta: "baru" }));
    const late = event("assistant.delta", 1, { delta: "terlambat" });
    state = reduceChatEvent(state, late);

    expect(state.lastSequence).toBe(2);
    expect(state.parts).toHaveLength(1);
    expect(state.parts[0]).toMatchObject({ kind: "text", text: "baru" });
  });

  it("seals interim when final text starts and keeps reasoning private", () => {
    let state = createChatTurnState(base.conversation_id, base.turn_id);
    state = reduceChatEvent(state, event("turn.started", 0, { model: { alias: "noir", display_name: "Noir" } }));
    state = reduceChatEvent(state, event("assistant.interim", 1, { message: "Menganalisis konteks.", phase: "reasoning" }));
    state = reduceChatEvent(state, event("reasoning.delta", 2, { delta: "private chain", visibility: "private" }));
    state = reduceChatEvent(state, event("assistant.delta", 3, { delta: "Hasil." }));

    expect(state.parts.map((part) => part.kind)).toEqual(["interim", "text"]);
    expect(state.reasoningText).toBe("private chain");
    expect(state.parts.some((part) => part.kind === "reasoning")).toBe(false);
  });

  it("projects sources and durable artifact lifecycle from the same state", () => {
    let state = createChatTurnState(base.conversation_id, base.turn_id);
    state = reduceChatEvent(state, event("turn.started", 0, { model: { alias: "lucent", display_name: "Lucent" } }));
    state = reduceChatEvent(state, event("source.added", 1, { source: { source_id: "source-1", title: "Dokumen resmi", uri: "https://example.test/doc", provenance: "web_search" } }));
    state = reduceChatEvent(state, event("artifact.created", 2, { artifact: { artifact_id: "artifact-1", name: "hasil.xlsx", media_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", status: "created" } }));
    state = reduceChatEvent(state, event("artifact.ready", 3, { artifact_id: "artifact-1", download_url: "/api/command-room/artifacts/artifact-1" }));

    expect(state.sources).toEqual([{ source_id: "source-1", title: "Dokumen resmi", uri: "https://example.test/doc", provenance: "web_search" }]);
    expect(state.artifacts[0]).toMatchObject({ artifact_id: "artifact-1", status: "ready", download_url: "/api/command-room/artifacts/artifact-1" });
    expect(state.parts.map((part) => part.kind)).toEqual(["source_group", "artifact"]);
  });

  it("does not reopen a terminal turn when a late tool packet arrives", () => {
    let state = createChatTurnState(base.conversation_id, base.turn_id);
    state = reduceChatEvent(state, event("turn.started", 0, { model: { alias: "lucent", display_name: "Lucent" } }));
    state = reduceChatEvent(state, event("turn.interrupted", 1, { reason: "user_stop", resumable: true }));
    state = reduceChatEvent(state, event("tool.completed", 2, { tool_call_id: "tool-late", tool: "web_search", summary: "late" }));

    expect(state.status).toBe("interrupted");
    expect(state.parts).toEqual([]);
    expect(state.lastSequence).toBe(1);
  });
});
