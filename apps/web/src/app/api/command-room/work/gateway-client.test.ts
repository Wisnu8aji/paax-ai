import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareGatewayTurn, streamGatewayTurn, resolveGatewayApproval, GatewayClientError } from "./gateway-client";

const request = {
  mode: "work" as const,
  session: { channel: "command_room" as const, conversationId: "conversation-1", projectId: "project-1" },
  messages: [{ role: "user" as const, content: "Siapkan konteks." }],
  modelAlias: "lucent",
  reasoningEffort: "high" as const,
  thinking: "on" as const,
};

const prepared = {
  protocolVersion: "command-room.gateway.v1" as const,
  runId: "run-1",
  sessionId: "session-1",
  sessionKeyFingerprint: "a".repeat(64),
  binding: { channel: "command_room", tenantId: "tenant-1", actorId: "actor-1", conversationId: "conversation-1", projectId: "project-1" },
  profile: { alias: "lucent", provider: "deepseek", model: "deepseek-v4-flash", transport: "openai-compatible" as const, requestStyle: "chat-completions" as const, supportsThinking: true, selectedEffort: "high" as const, thinking: "on" as const },
  prompt: { version: "command-room-worker.phase2.v1", stableHash: "b".repeat(64), sectionSizes: { stable: 1, context: 2, volatile: 3 }, injectionFindings: [] },
  handoff: "service-conversation-loop" as const,
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("server-only gateway client", () => {
  it("sends internal auth/correlation headers and validates the prepared response", async () => {
    vi.stubEnv("AI_ORCHESTRATOR_URL", "http://orchestrator.test/");
    vi.stubEnv("PAAX_WEB_INTERNAL_SERVICE_KEY", "test-internal-key");
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(prepared), { status: 200 }));

    const result = await prepareGatewayTurn(request, {
      fetchImpl,
      requestHeaders: new Headers({ "x-user-id": "actor-from-request", "x-correlation-id": "corr-1" }),
    });

    expect(result).toEqual(prepared);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://orchestrator.test/gateway/command-room/turn/prepare");
    expect(new Headers(init.headers).get("X-Internal-Key")).toBe("test-internal-key");
    expect(new Headers(init.headers).get("X-User-Id")).toBe("actor-from-request");
    expect(new Headers(init.headers).get("X-Correlation-Id")).toBe("corr-1");
    expect(JSON.parse(String(init.body))).toEqual(request);
  });

  it("maps upstream failures without echoing the upstream body or secret", async () => {
    vi.stubEnv("AI_ORCHESTRATOR_URL", "http://orchestrator.test");
    vi.stubEnv("PAAX_WEB_INTERNAL_SERVICE_KEY", "test-internal-key");
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ apiKey: "upstream-secret", detail: "private" }), { status: 503 }));

    await expect(prepareGatewayTurn(request, { fetchImpl })).rejects.toMatchObject({ status: 503, code: "profile_unavailable" });
    await expect(prepareGatewayTurn(request, { fetchImpl })).rejects.toThrow("Gateway service unavailable");
    try {
      await prepareGatewayTurn(request, { fetchImpl });
    } catch (error) {
      expect(error).toBeInstanceOf(GatewayClientError);
      expect(String(error)).not.toContain("upstream-secret");
      expect(String(error)).not.toContain("private");
    }
  });

  it("proxies the service WorkEvent stream without parsing or changing its body", async () => {
    vi.stubEnv("AI_ORCHESTRATOR_URL", "http://orchestrator.test");
    vi.stubEnv("PAAX_WEB_INTERNAL_SERVICE_KEY", "test-internal-key");
    const body = "event: message\ndata: {\"type\":\"turn.started\"}\n\n";
    const fetchImpl = vi.fn().mockResolvedValue(new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } }));
    const response = await streamGatewayTurn(request, { fetchImpl, requestHeaders: new Headers({ "x-user-id": "actor-1" }) });
    expect(await response.text()).toBe(body);
    expect(response.headers.get("content-type")).toMatch(/text\/event-stream/);
    expect((fetchImpl.mock.calls[0] as [string, RequestInit])[0]).toBe("http://orchestrator.test/gateway/command-room/turn/stream");
  });

  it("uses the service approval endpoint and returns only its safe decision", async () => {
    vi.stubEnv("AI_ORCHESTRATOR_URL", "http://orchestrator.test");
    vi.stubEnv("PAAX_WEB_INTERNAL_SERVICE_KEY", "test-internal-key");
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, approvalId: "approval-1", decision: "approved" }), { status: 200, headers: { "content-type": "application/json" } }));
    const result = await resolveGatewayApproval({ approvalId: "approval-1", sessionId: "session-1", decision: "approved" }, { fetchImpl, requestHeaders: new Headers({ "x-user-id": "actor-1" }) });
    expect(result).toEqual({ ok: true, approvalId: "approval-1", decision: "approved" });
    expect((fetchImpl.mock.calls[0] as [string, RequestInit])[0]).toBe("http://orchestrator.test/gateway/command-room/approval/resolve");
  });
});
