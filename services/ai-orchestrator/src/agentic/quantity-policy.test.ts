import { describe, expect, it } from 'vitest';
import { authorizeQuantityAction } from './quantity-policy';

const remaining = { toolCalls: 1, tokens: 1, costUsd: 1, durationMs: 1 };
const approval = { approvalId:'A', projectId:'P', runId:'R', taskId:'T', action:'calculate', riskTier:'R3' as const, requiredRoles:['owner'], status:'approved' as const, requestedAt:new Date().toISOString(), expiresAt:new Date(Date.now()+10000).toISOString(), decidedBy:'U' };

describe('quantity policy', () => {
  it('waits for approval and requires R3/R4 role', () => {
    expect(authorizeQuantityAction({ action:'calculate', actorRoles:['owner'], budgetRemaining:remaining })).toBe('waiting_approval');
    expect(authorizeQuantityAction({ action:'calculate', actorRoles:['viewer'], budgetRemaining:remaining, approval })).toBe('blocked');
    expect(authorizeQuantityAction({ action:'calculate', actorRoles:['owner'], budgetRemaining:remaining, approval })).toBe('allowed');
  });
  it('blocks exhausted budget', () => {
    expect(authorizeQuantityAction({ action:'calculate', actorRoles:['owner'], budgetRemaining:{...remaining, toolCalls:-1}, approval })).toBe('blocked');
  });
});
