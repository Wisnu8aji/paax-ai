import type { WorkApprovalRequest } from "@/lib/command-room/work-agent-types";

interface CreateApprovalInput {
  approvalId: string;
  sessionId: string;
  runId: string;
  action: string;
  reason: string;
  args?: unknown;
  timeoutMs?: number;
}

interface PendingApproval {
  sessionId: string;
  resolve: (approved: boolean) => void;
  timer: ReturnType<typeof setTimeout>;
  request: WorkApprovalRequest;
}

const pending = new Map<string, PendingApproval>();

export function createWorkApproval(input: CreateApprovalInput): { request: WorkApprovalRequest; promise: Promise<boolean> } {
  const createdAt = new Date().toISOString();
  const timeoutMs = Math.max(1_000, Math.min(input.timeoutMs ?? 5 * 60_000, 10 * 60_000));
  const request: WorkApprovalRequest = {
    approvalId: input.approvalId,
    action: input.action,
    reason: input.reason,
    args: input.args,
    createdAt,
    expiresAt: new Date(Date.now() + timeoutMs).toISOString(),
    state: "pending",
  };

  let resolvePromise!: (approved: boolean) => void;
  const promise = new Promise<boolean>((resolve) => { resolvePromise = resolve; });
  const timer = setTimeout(() => {
    const current = pending.get(input.approvalId);
    if (!current) return;
    pending.delete(input.approvalId);
    current.resolve(false);
  }, timeoutMs);
  if (typeof timer === "object" && "unref" in timer && typeof timer.unref === "function") timer.unref();
  pending.set(input.approvalId, { sessionId: input.sessionId, resolve: resolvePromise, timer, request });
  return { request, promise };
}

export function resolveWorkApproval(
  approvalId: string,
  sessionId: string,
  decision: "approved" | "denied",
): boolean {
  const current = pending.get(approvalId);
  if (!current || current.sessionId !== sessionId) return false;
  pending.delete(approvalId);
  clearTimeout(current.timer);
  current.request.state = decision;
  current.resolve(decision === "approved");
  return true;
}

export function getWorkApproval(approvalId: string, sessionId: string): WorkApprovalRequest | null {
  const current = pending.get(approvalId);
  return current && current.sessionId === sessionId ? current.request : null;
}
