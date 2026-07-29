import type { ApprovalRequest } from './approval-service';
import {
  authorizeQuantityAction as authorizeQuantityActionGov,
  type QuantityActionSpec,
  type ApprovalTokenContext,
  type BudgetContext,
  type QuantityPolicyDecision as GovQuantityPolicyDecision,
} from './quantity-tool-policy';

export type QuantityPolicyDecision = 'allowed' | 'waiting_approval' | 'blocked';

export function authorizeQuantityAction(
  actionOrInput:
    | QuantityActionSpec
    | {
        action: string;
        actorRoles: string[];
        approval?: ApprovalRequest;
        budgetRemaining: { toolCalls: number; tokens: number; costUsd: number; durationMs: number };
        nowMs?: number;
      },
  approvalToken?: ApprovalTokenContext,
  budget?: BudgetContext,
  nowMs?: number
): QuantityPolicyDecision | GovQuantityPolicyDecision {
  if ('toolName' in actionOrInput) {
    return authorizeQuantityActionGov(actionOrInput, approvalToken, budget, nowMs);
  }

  const input = actionOrInput;
  const now = input.nowMs ?? Date.now();
  if (Object.values(input.budgetRemaining).some((value) => !Number.isFinite(value) || value < 0)) return 'blocked';
  const approval = input.approval;
  if (!approval || approval.status === 'pending') return 'waiting_approval';
  if (approval.status !== 'approved' || Date.parse(approval.expiresAt) <= now) return 'blocked';
  if (!approval.requiredRoles.some((role) => input.actorRoles.includes(role))) return 'blocked';
  if (approval.riskTier !== 'R3' && approval.riskTier !== 'R4') return 'blocked';
  return 'allowed';
}

export * from './quantity-tool-policy';
