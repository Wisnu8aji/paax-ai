import type { ApprovalRequest } from './approval-service';

export type QuantityPolicyDecision = 'allowed' | 'waiting_approval' | 'blocked';

export function authorizeQuantityAction(input: {
  action: string;
  actorRoles: string[];
  approval?: ApprovalRequest;
  budgetRemaining: { toolCalls: number; tokens: number; costUsd: number; durationMs: number };
  nowMs?: number;
}): QuantityPolicyDecision {
  const now = input.nowMs ?? Date.now();
  if (Object.values(input.budgetRemaining).some((value) => !Number.isFinite(value) || value < 0)) return 'blocked';
  const approval = input.approval;
  if (!approval || approval.status === 'pending') return 'waiting_approval';
  if (approval.status !== 'approved' || Date.parse(approval.expiresAt) <= now) return 'blocked';
  if (!approval.requiredRoles.some((role) => input.actorRoles.includes(role))) return 'blocked';
  if (approval.riskTier !== 'R3' && approval.riskTier !== 'R4') return 'blocked';
  return 'allowed';
}
