import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { resolveGatewayApproval } from "../gateway-client";
import { resolveWorkApproval } from "../approval";

vi.mock("../gateway-client", () => ({
  resolveGatewayApproval: vi.fn(),
  GatewayClientError: class GatewayClientError extends Error { status = 503; code = "gateway_unavailable"; },
}));
vi.mock("../approval", () => ({ resolveWorkApproval: vi.fn() }));

const body = { sessionId: "session-1", approvalId: "approval-1", decision: "approved" };

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("Work approval route", () => {
  it("proxies service approval and does not resolve the local legacy map", async () => {
    vi.stubEnv("PAAX_COMMAND_ROOM_GATEWAY_MODE", "service");
    vi.mocked(resolveGatewayApproval).mockResolvedValue({ ok: true, approvalId: "approval-1", decision: "approved" });
    const request = new Request("http://localhost/api/command-room/work/approval", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(resolveGatewayApproval).toHaveBeenCalledWith(body, expect.objectContaining({ requestHeaders: expect.any(Headers), signal: request.signal }));
    expect(resolveWorkApproval).not.toHaveBeenCalled();
  });

  it("uses the local approval map only in explicit legacy mode", async () => {
    vi.stubEnv("PAAX_COMMAND_ROOM_GATEWAY_MODE", "legacy");
    vi.mocked(resolveWorkApproval).mockReturnValue(true);
    const request = new Request("http://localhost/api/command-room/work/approval", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(resolveWorkApproval).toHaveBeenCalledWith("approval-1", "session-1", "approved");
    expect(resolveGatewayApproval).not.toHaveBeenCalled();
  });
});
