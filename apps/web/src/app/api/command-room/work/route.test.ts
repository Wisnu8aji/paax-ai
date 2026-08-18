import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";
import { prepareGatewayTurn, streamGatewayTurn } from "./gateway-client";
import { POST as chatPost } from "../chat/route";

vi.mock("./gateway-client", () => ({
  prepareGatewayTurn: vi.fn(),
  streamGatewayTurn: vi.fn(),
  GatewayClientError: class GatewayClientError extends Error {
    status = 503;
    code = "gateway_unavailable";
  },
}));

vi.mock("../chat/route", () => ({
  POST: vi.fn(),
}));

const prepared = {
  protocolVersion: "command-room.gateway.v1" as const,
  runId: "run-1",
  sessionId: "session-1",
  sessionKeyFingerprint: "a".repeat(64),
  binding: { channel: "command_room", tenantId: "tenant-1", actorId: "actor-1", conversationId: "conversation-1" },
  profile: { alias: "lucent", provider: "deepseek", model: "deepseek-v4-flash", transport: "openai-compatible" as const, supportsThinking: true, selectedEffort: "high" as const, thinking: "on" as const },
  prompt: { version: "command-room-worker.phase2.v1", stableHash: "b".repeat(64), sectionSizes: { stable: 1, context: 2, volatile: 3 }, injectionFindings: [] },
  handoff: "legacy-web-provider" as const,
};

const body = {
  mode: "work",
  runId: "run-1",
  session: { channel: "command_room", conversationId: "conversation-1" },
  messages: [{ role: "user", content: "Siapkan konteks." }],
  modelAlias: "lucent",
  reasoningEffort: "high",
  thinking: "on",
};

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("Command Room Work route", () => {
  it("proxies the service stream without entering the legacy handler", async () => {
    vi.stubEnv("PAAX_COMMAND_ROOM_GATEWAY_MODE", "service");
    vi.mocked(streamGatewayTurn).mockResolvedValue(new Response("event: message\ndata: {\"type\":\"turn.started\"}\n\n", { status: 200, headers: { "content-type": "text/event-stream" } }));

    const request = new Request("http://localhost/api/command-room/work", {
      method: "POST",
      headers: { "content-type": "application/json", "x-correlation-id": "corr-1" },
      body: JSON.stringify(body),
    });
    const response = await POST(request as never);

    expect(response.status).toBe(200);
    expect(streamGatewayTurn).toHaveBeenCalledWith(expect.objectContaining({ session: body.session }), expect.objectContaining({ requestHeaders: expect.any(Headers), signal: request.signal }));
    expect(await response.text()).toContain("turn.started");
    expect(chatPost).not.toHaveBeenCalled();
  });

  it("fails closed on service failure and does not enter the legacy handler", async () => {
    vi.stubEnv("PAAX_COMMAND_ROOM_GATEWAY_MODE", "service");
    vi.mocked(streamGatewayTurn).mockRejectedValue(new Error("Gateway service unavailable"));

    const request = new Request("http://localhost/api/command-room/work", { method: "POST", body: JSON.stringify(body) });
    const response = await POST(request as never);

    expect(response.status).toBe(503);
    expect(chatPost).not.toHaveBeenCalled();
  });

  it("delegates the untouched request to Chat POST in explicit legacy mode", async () => {
    vi.stubEnv("PAAX_COMMAND_ROOM_GATEWAY_MODE", "legacy");
    vi.mocked(chatPost).mockResolvedValue(new Response("legacy", { status: 200 }));

    const request = new Request("http://localhost/api/command-room/work", { method: "POST", body: JSON.stringify(body) });
    const jsonSpy = vi.spyOn(request, "json");
    const response = await POST(request as never);

    expect(response.status).toBe(200);
    expect(prepareGatewayTurn).not.toHaveBeenCalled();
    expect(streamGatewayTurn).not.toHaveBeenCalled();
    expect(jsonSpy).not.toHaveBeenCalled();
    expect(chatPost).toHaveBeenCalledWith(request);
  });
});
