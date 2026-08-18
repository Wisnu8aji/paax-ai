import { describe, expect, it } from "vitest";
import { ApprovalService } from "../../src/agentic/approval-service";
import type { ProjectContextBinding } from "../../src/agentic/types";

const binding: ProjectContextBinding = {
  tenantId: "tenant-1",
  projectId: "project-1",
  actorId: "actor-1",
  conversationId: "conversation-1",
  allowedToolScopes: ["workspace:read"],
  issuedAt: new Date().toISOString(),
};

describe("awaitable ApprovalService", () => {
  it("waits for a decision bound to the same project, tenant, and conversation", async () => {
    const service = new ApprovalService();
    const request = service.request(binding, "run-1", "call-1", "terminal_run", "R3", ["owner"], 5_000);
    const decision = service.waitForDecision(request.approvalId, binding);
    await Promise.resolve();
    expect(service.decide(request.approvalId, "owner-1", ["owner"], "approved", "ok", {
      tenantId: binding.tenantId,
      projectId: binding.projectId,
      conversationId: binding.conversationId,
      runId: "run-1",
    }).status).toBe("approved");
    await expect(decision).resolves.toMatchObject({ approvalId: request.approvalId, status: "approved" });
  });

  it("rejects mismatched binding and is abort-safe", async () => {
    const service = new ApprovalService();
    const request = service.request(binding, "run-1", "call-1", "terminal_run", "R3", ["owner"], 5_000);
    await expect(service.waitForDecision(request.approvalId, { ...binding, conversationId: "other" })).rejects.toThrow(/binding/i);

    const controller = new AbortController();
    const waiting = service.waitForDecision(request.approvalId, binding, controller.signal);
    controller.abort();
    await expect(waiting).rejects.toMatchObject({ name: "AbortError" });
    expect(service.get(request.approvalId)?.status).toBe("pending");
  });

  it("fails closed for missing roles and resolves expiry without running a handler", async () => {
    const service = new ApprovalService();
    const request = service.request(binding, "run-1", "call-1", "terminal_run", "R3", ["owner"], 1);
    await expect(service.waitForDecision(request.approvalId, binding)).resolves.toMatchObject({ status: "expired" });
    expect(() => service.decide(request.approvalId, "viewer-1", ["viewer"], "approved")).toThrow(/not pending|expired|role/i);
  });
});
