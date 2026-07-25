import { randomUUID } from 'node:crypto';
import type { ProjectContextBinding } from './types';

export type ActionRiskTier = 'R0' | 'R1' | 'R2' | 'R3' | 'R4';
export interface ApprovalRequest {
  approvalId: string;
  projectId: string;
  runId: string;
  taskId: string;
  action: string;
  riskTier: ActionRiskTier;
  requiredRoles: string[];
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  requestedAt: string;
  expiresAt: string;
  decidedBy?: string;
  decisionNote?: string;
}

export class ApprovalService {
  private readonly approvals = new Map<string, ApprovalRequest>();

  request(binding: ProjectContextBinding, runId: string, taskId: string, action: string,
          riskTier: ActionRiskTier, requiredRoles: string[], ttlMs = 30 * 60_000): ApprovalRequest {
    if ((riskTier === 'R3' || riskTier === 'R4') && !requiredRoles.length) throw new Error('high-risk approval requires role');
    const now = Date.now();
    const request: ApprovalRequest = {
      approvalId: `approval-${randomUUID()}`, projectId: binding.projectId, runId, taskId, action,
      riskTier, requiredRoles, status: 'pending', requestedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttlMs).toISOString(),
    };
    this.approvals.set(request.approvalId, request);
    return request;
  }

  decide(approvalId: string, actorId: string, actorRoles: string[], decision: 'approved' | 'rejected', note?: string): ApprovalRequest {
    const request = this.approvals.get(approvalId);
    if (!request) throw new Error(`approval not found: ${approvalId}`);
    if (request.status !== 'pending') throw new Error(`approval is not pending: ${approvalId}`);
    if (Date.parse(request.expiresAt) <= Date.now()) { request.status = 'expired'; throw new Error(`approval expired: ${approvalId}`); }
    if (request.requiredRoles.length && !request.requiredRoles.some((role) => actorRoles.includes(role))) throw new Error('actor lacks required approval role');
    request.status = decision; request.decidedBy = actorId; request.decisionNote = note;
    return request;
  }

  get(approvalId: string): ApprovalRequest | undefined { return this.approvals.get(approvalId); }
}
