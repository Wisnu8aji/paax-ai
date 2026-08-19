import { describe, expect, it } from "vitest";
import { createApprovalQueue } from "../../src/agentic/approval-queue";
import type { ApprovalRequest } from "../../src/agentic/approval-service";

describe("PAAX Approval Queue (paax-approval)", () => {
  const sampleRequest: ApprovalRequest = {
    approvalId: "app-1",
    tenantId: "tenant-1",
    projectId: "proj-1",
    actorId: "user-1",
    conversationId: "conv-1",
    runId: "run-1",
    taskId: "task-1",
    action: "export_rab_xlsx",
    riskTier: "R2",
    requiredRoles: ["estimator"],
    status: "pending",
    requestedAt: new Date(Date.now() - 1000).toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };

  it("enqueues and retrieves approval requests", () => {
    const queue = createApprovalQueue();
    queue.enqueue(sampleRequest);

    const item = queue.get("app-1");
    expect(item).toBeDefined();
    expect(item?.action).toBe("export_rab_xlsx");
    expect(item?.status).toBe("pending");
  });

  it("lists and filters requests by status and project", () => {
    const queue = createApprovalQueue();
    queue.enqueue(sampleRequest);
    queue.enqueue({
      ...sampleRequest,
      approvalId: "app-2",
      projectId: "proj-2",
      status: "approved",
    });

    const proj1List = queue.list({ projectId: "proj-1" });
    expect(proj1List.length).toBe(1);
    expect(proj1List[0].approvalId).toBe("app-1");

    const approvedList = queue.list({ status: "approved" });
    expect(approvedList.length).toBe(1);
    expect(approvedList[0].approvalId).toBe("app-2");
  });

  it("computes queue summary accurately", () => {
    const queue = createApprovalQueue();
    queue.enqueue(sampleRequest);
    queue.enqueue({
      ...sampleRequest,
      approvalId: "app-2",
      status: "approved",
    });
    queue.enqueue({
      ...sampleRequest,
      approvalId: "app-3",
      status: "rejected",
    });

    const summary = queue.getSummary();
    expect(summary.total).toBe(3);
    expect(summary.pending).toBe(1);
    expect(summary.approved).toBe(1);
    expect(summary.rejected).toBe(1);
    expect(summary.expired).toBe(0);
  });

  it("automatically marks expired requests", () => {
    const queue = createApprovalQueue();
    const expiredRequest: ApprovalRequest = {
      ...sampleRequest,
      approvalId: "app-expired",
      expiresAt: new Date(Date.now() - 5000).toISOString(),
    };
    queue.enqueue(expiredRequest);

    const retrieved = queue.get("app-expired");
    expect(retrieved?.status).toBe("expired");

    const summary = queue.getSummary();
    expect(summary.expired).toBe(1);
  });
});
