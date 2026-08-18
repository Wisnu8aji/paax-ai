import { afterEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "./route";
import { POST as postControl } from "./control/route";
import { extractDelta } from "./sse-helpers";
import { runDeepSeekNativeWithTools } from "./tools";
import { analyzeChatAttachments } from "./vision-router";
import { createGeneralChatToolRegistry, GENERAL_CHAT_TOOL_NAMES } from "./general-tools";
import { getWorkToolNames } from "../work/tools";
import { isChatEvent, type ChatEvent } from "@/lib/chat/command-room-chat-contract";

vi.mock("./tools", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./tools")>();
  return {
    ...actual,
    runDeepSeekNativeWithTools: vi.fn(),
    runOpenRouterWithTools: vi.fn(),
  };
});

vi.mock("./vision-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./vision-router")>();
  return { ...actual, analyzeChatAttachments: vi.fn() };
});

vi.mock("./general-tools", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./general-tools")>();
  return { ...actual, createGeneralChatToolRegistry: vi.fn(actual.createGeneralChatToolRegistry) };
});

vi.mock("./memory-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./memory-runtime")>();
  return { ...actual, persistConversationSummary: vi.fn().mockResolvedValue(undefined) };
});

function eventsFromSse(payload: string): ChatEvent[] {
  return payloadsFromSse(payload).flatMap((event) => isChatEvent(event) ? [event] : []);
}

function payloadsFromSse(payload: string): Array<Record<string, unknown>> {
  return payload
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice(6)) as Record<string, unknown>);
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("extractDelta", () => {
  it("extracts plain content", () => {
    expect(extractDelta({ content: "halo" })).toEqual({ content: "halo", reasoning: "" });
  });

  it("prefers delta.reasoning over reasoning_content and reasoning_details (no double-counting)", () => {
    // Regresi: OpenRouter pernah mengirim reasoning (string flat) DAN
    // reasoning_details (breakdown terstruktur) untuk KONTEN YANG SAMA pada
    // delta yang sama — menjumlahkan keduanya menghasilkan teks dobel
    // ("Saya akanSaya akan t..."). Harus pilih satu sumber saja.
    const delta = {
      reasoning: "Saya akan ",
      reasoning_details: [{ type: "reasoning.text", text: "Saya akan " }],
    };
    expect(extractDelta(delta).reasoning).toBe("Saya akan ");
  });

  it("falls back to reasoning_content (DashScope/Qwen shape) when reasoning is absent", () => {
    expect(extractDelta({ reasoning_content: "menganalisa..." }).reasoning).toBe("menganalisa...");
  });

  it("falls back to reasoning_details text/summary when the flat fields are absent", () => {
    const delta = {
      reasoning_details: [
        { type: "reasoning.text", text: "bagian satu " },
        { type: "reasoning.summary", summary: "ringkasan" },
      ],
    };
    expect(extractDelta(delta).reasoning).toBe("bagian satu ringkasan");
  });

  it("returns empty strings for an empty delta", () => {
    expect(extractDelta({})).toEqual({ content: "", reasoning: "" });
  });
});

describe("legacy Chat provider receipt", () => {
  it("reports the configured opencode-go Mimo runtime for Lucent", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-provider-key");

    const response = await GET();
    const payload = await response.json() as { models: Array<Record<string, unknown>> };
    const lucent = payload.models.find((model) => model.id === "lucent");

    expect(lucent).toMatchObject({
      provider: "opencode-go",
      apiModel: "mimo-v2.5",
      ready: true,
    });
  });
});

describe("Command Room Chat v1.5 route", () => {
  it("dispatches mode work through the Work event pipeline without general Chat capabilities", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-provider-key");
    vi.mocked(runDeepSeekNativeWithTools).mockImplementation(async (input) => ({
      messages: input.messages,
      usedTool: false,
    }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      'data: {"choices":[{"delta":{"content":"Pekerjaan selesai."},"finish_reason":"stop"}]}\n\n',
      { status: 200, headers: { "content-type": "text/event-stream" } },
    )));

    const request = new Request("http://localhost/api/command-room/chat", {
      method: "POST",
      headers: { "content-type": "application/json", "x-correlation-id": "work-runtime-1" },
      body: JSON.stringify({
        mode: "work",
        runId: "work-run-1",
        session: { channel: "command_room", conversationId: "work-conversation-1" },
        messages: [{ role: "user", content: "Periksa workspace." }],
        modelAlias: "lucent",
        reasoningEffort: "high",
        thinking: "off",
      }),
    });

    const response = await POST(request as never);
    const events = payloadsFromSse(await response.text());
    const eventTypes = events.map((event) => event.type);

    expect(response.status).toBe(200);
    expect(eventTypes).toEqual(expect.arrayContaining([
      "turn.started",
      "plan.updated",
      "status.update",
      "turn.completed",
    ]));
    expect(events.every((event) => event.runId === "work-run-1")).toBe(true);
    expect(analyzeChatAttachments).not.toHaveBeenCalled();
    expect(createGeneralChatToolRegistry).not.toHaveBeenCalled();
    expect(runDeepSeekNativeWithTools).toHaveBeenCalledWith(expect.objectContaining({
      toolNames: getWorkToolNames(),
    }));
    expect(vi.mocked(runDeepSeekNativeWithTools).mock.calls[0]?.[0].toolNames).not.toEqual(GENERAL_CHAT_TOOL_NAMES);
  });

  it("interrupts Chat SSE through the control route using the resolved turn ID", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-provider-key");
    vi.stubGlobal("fetch", vi.fn());
    const turnId = "chat-turn-stop-1";

    const controlResponse = await postControl(new Request("http://localhost/api/command-room/chat/control", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ turnId, action: "stop" }),
    }) as never);

    expect(controlResponse.status).toBe(200);
    await expect(controlResponse.json()).resolves.toMatchObject({ turnId, status: "interrupted" });

    const response = await POST(new Request("http://localhost/api/command-room/chat", {
      method: "POST",
      headers: { "content-type": "application/json", "x-correlation-id": "runtime-stop-1" },
      body: JSON.stringify({
        mode: "chat",
        turnId,
        conversationId: "conversation-stop-1",
        messages: [{ role: "user", content: "Hentikan turn ini." }],
        modelAlias: "lucent",
        reasoningEffort: "high",
        thinking: "off",
      }),
    }) as never);
    const events = eventsFromSse(await response.text());

    expect(response.status).toBe(200);
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "turn.interrupted",
        turn_id: turnId,
        conversation_id: "conversation-stop-1",
        runtime_id: "runtime-stop-1",
      }),
    ]));
    expect(events.some((event) => event.type === "turn.completed")).toBe(false);
    expect(createGeneralChatToolRegistry).not.toHaveBeenCalled();
    expect(runDeepSeekNativeWithTools).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("emits ordered v1.5 events for attachments and general tools without leaking results", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-provider-key");
    vi.stubEnv("DB_API_URL", "");
    vi.mocked(analyzeChatAttachments).mockResolvedValue({
      observations: [{
        attachment_id: "attachment-1",
        name: "catatan.csv",
        media_type: "text/csv",
        kind: "text",
        content: "item,volume\nA,1",
        confidence: "high",
      }],
      failures: [],
      sources: [{
        source_id: "attachment-attachment-1",
        title: "catatan.csv",
        uri: "/api/command-room/attachments/attachment-1",
        provenance: "attachment_parser",
      }],
    });
    vi.mocked(runDeepSeekNativeWithTools).mockImplementation(async (input) => {
      input.sendEvent("message", {
        type: "tool_call",
        tool: "calculate_expression",
        toolCallId: "tool-1",
      });
      input.sendEvent("message", {
        type: "tool_result",
        tool: "calculate_expression",
        toolCallId: "tool-1",
        summary: "Ekspresi selesai.",
        result: { value: 4, internal: "must-not-leak" },
      });
      return { messages: input.messages, usedTool: true };
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      'data: {"choices":[{"delta":{"content":"Jawaban akhir."},"finish_reason":"stop"}]}\n\n',
      { status: 200, headers: { "content-type": "text/event-stream" } },
    )));

    const request = new Request("http://localhost/api/command-room/chat", {
      method: "POST",
      headers: { "content-type": "application/json", "x-correlation-id": "runtime-1" },
      body: JSON.stringify({
        mode: "chat",
        runId: "legacy-run-1",
        turnId: "turn-1",
        conversationId: "conversation-1",
        projectId: "project-1",
        attachments: [{
          attachment_id: "attachment-1",
          name: "catatan.csv",
          media_type: "text/csv",
          size_bytes: 24,
          status: "ready",
        }],
        messages: [{ role: "user", content: "Ringkas lampiran ini." }],
        modelAlias: "lucent",
        reasoningEffort: "high",
        thinking: "off",
      }),
    });

    const response = await POST(request as never);
    const events = eventsFromSse(await response.text());

    expect(response.status).toBe(200);
    expect(events.length).toBeGreaterThan(0);
    expect(events.map((event) => event.type)).toEqual(expect.arrayContaining([
      "turn.started",
      "tool.started",
      "tool.completed",
      "source.added",
      "assistant.delta",
      "turn.completed",
    ]));
    expect(events.every((event) => (
      event.conversation_id === "conversation-1" &&
      event.turn_id === "turn-1" &&
      event.runtime_id === "runtime-1"
    ))).toBe(true);
    expect(events.map((event) => event.sequence)).toEqual(events.map((_, index) => index));
    expect(events.every((event) => !("result" in event))).toBe(true);
    expect(analyzeChatAttachments).toHaveBeenCalledOnce();
    expect(runDeepSeekNativeWithTools).toHaveBeenCalledWith(expect.objectContaining({
      toolNames: GENERAL_CHAT_TOOL_NAMES,
      context: undefined,
      connectors: [],
    }));
  });
});
