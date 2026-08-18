import { describe, expect, it } from "vitest";
import { ApprovalService } from "../../src/agentic/approval-service";
import type { ProjectContextBinding } from "../../src/agentic/types";

const binding: ProjectContextBinding = { tenantId: "tenant-a", projectId: "project-a", actorId: "actor-a", conversationId: "conversation-a", allowedToolScopes: ["workspace:write"], issuedAt: new Date().toISOString() };

describe("approval fail-closed replay and binding checks", () => {
  it("rejects wrong role, wrong binding, and different arguments", () => {
    const service = new ApprovalService();
    const request = service.request(binding, "run-a", "tool-a", "write_tool", "R3", ["owner"], 5_000, { argumentsHash: "hash-a", bindingFingerprint: "binding-a" });
    expect(() => service.decideScoped(request.approvalId, "viewer", ["viewer"], "approved", undefined, { tenantId: "tenant-a", projectId: "project-a", conversationId: "conversation-a", runId: "run-a", argumentsHash: "hash-a", bindingFingerprint: "binding-a" })).toThrow(/role/i);
    expect(() => service.decideScoped(request.approvalId, "owner", ["owner"], "approved", undefined, { tenantId: "tenant-a", projectId: "project-a", conversationId: "other", runId: "run-a", argumentsHash: "hash-a", bindingFingerprint: "binding-a" })).toThrow(/binding/i);
    expect(() => service.decideScoped(request.approvalId, "owner", ["owner"], "approved", undefined, { tenantId: "tenant-a", projectId: "project-a", conversationId: "conversation-a", runId: "run-a", argumentsHash: "hash-b", bindingFingerprint: "binding-a" })).toThrow(/argument|hash/i);
    expect(service.get(request.approvalId)?.status).toBe("pending");
  });

  it("rejects replayed decisions and emits only sanitized receipts", () => {
    const receipts: unknown[] = [];
    const service = new ApprovalService({ onReceipt: (receipt) => receipts.push(receipt) });
    const request = service.request(binding, "run-a", "tool-a", "write_tool", "R3", ["owner"], 5_000);
    service.decide(request.approvalId, "owner", ["owner"], "rejected", "authorization: Bearer approval-secret");
    expect(() => service.decide(request.approvalId, "owner", ["owner"], "approved")).toThrow(/pending|replay/i);
    expect(JSON.stringify(receipts)).not.toContain("approval-secret");
  });
});
