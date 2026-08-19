import type { ApprovalRequest, ApprovalService } from "./approval-service";

export interface ApprovalQueueFilter {
  readonly tenantId?: string;
  readonly projectId?: string;
  readonly conversationId?: string;
  readonly runId?: string;
  readonly status?: ApprovalRequest["status"];
  readonly riskTier?: ApprovalRequest["riskTier"];
}

export interface ApprovalQueueSummary {
  readonly total: number;
  readonly pending: number;
  readonly approved: number;
  readonly rejected: number;
  readonly expired: number;
}

export class ApprovalQueue {
  private readonly items = new Map<string, ApprovalRequest>();

  constructor(private readonly service?: ApprovalService) {}

  enqueue(request: ApprovalRequest): void {
    this.items.set(request.approvalId, { ...request });
  }

  get(approvalId: string): ApprovalRequest | undefined {
    const item = this.items.get(approvalId);
    if (!item) return undefined;
    this.checkExpiry(item);
    return { ...item };
  }

  list(filter: ApprovalQueueFilter = {}): readonly ApprovalRequest[] {
    const results: ApprovalRequest[] = [];
    const now = Date.now();

    for (const item of this.items.values()) {
      this.checkExpiry(item, now);

      if (filter.tenantId && item.tenantId !== filter.tenantId) continue;
      if (filter.projectId && item.projectId !== filter.projectId) continue;
      if (filter.conversationId && item.conversationId !== filter.conversationId) continue;
      if (filter.runId && item.runId !== filter.runId) continue;
      if (filter.status && item.status !== filter.status) continue;
      if (filter.riskTier && item.riskTier !== filter.riskTier) continue;

      results.push({ ...item });
    }

    return Object.freeze(results.sort((a, b) => Date.parse(b.requestedAt) - Date.parse(a.requestedAt)));
  }

  getSummary(filter: ApprovalQueueFilter = {}): ApprovalQueueSummary {
    const list = this.list(filter);
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    let expired = 0;

    for (const item of list) {
      switch (item.status) {
        case "pending":
          pending++;
          break;
        case "approved":
          approved++;
          break;
        case "rejected":
          rejected++;
          break;
        case "expired":
          expired++;
          break;
      }
    }

    return Object.freeze({
      total: list.length,
      pending,
      approved,
      rejected,
      expired,
    });
  }

  pruneExpired(maxAgeMs = 24 * 60 * 60_000): number {
    const now = Date.now();
    let pruned = 0;

    for (const [id, item] of this.items.entries()) {
      if (item.status === "expired" || Date.parse(item.expiresAt) < now - maxAgeMs) {
        this.items.delete(id);
        pruned++;
      }
    }

    return pruned;
  }

  private checkExpiry(item: ApprovalRequest, now = Date.now()): void {
    if (item.status === "pending" && Date.parse(item.expiresAt) <= now) {
      item.status = "expired";
    }
  }
}

export function createApprovalQueue(service?: ApprovalService): ApprovalQueue {
  return new ApprovalQueue(service);
}
