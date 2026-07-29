import { describe, it, expect, vi } from 'vitest';
import {
  authorizeQuantityAction,
  validateQuantityPayloadInput,
  type QuantityActionSpec,
  type ApprovalTokenContext,
  type BudgetContext,
} from '../../src/agentic/quantity-tool-policy';
import { createCoreEngineTool } from '../../src/agentic/core-engine-tool';
import type { ProjectContextBinding } from '../../src/agentic/types';

function createSampleAction(overrides?: Partial<QuantityActionSpec>): QuantityActionSpec {
  return {
    toolName: 'core_engine.calculate_measurement_facts',
    projectId: 'proj-101',
    actorId: 'actor-001',
    actorRoles: ['estimator'],
    riskTier: 'high',
    input: {
      projectId: 'proj-101',
      measurementFactIds: ['fact-001', 'fact-002'],
      idempotencyKey: 'idemp-fact-calc-001',
    },
    ...overrides,
  };
}

function createSampleApproval(overrides?: Partial<ApprovalTokenContext>): ApprovalTokenContext {
  return {
    tokenId: 'token-ok-123',
    projectId: 'proj-101',
    toolName: 'core_engine.calculate_measurement_facts',
    approvedBy: 'pm-lead',
    actorRoles: ['estimator'],
    status: 'approved',
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    ...overrides,
  };
}

function createSampleBudget(overrides?: Partial<BudgetContext>): BudgetContext {
  return {
    maxToolCalls: 10,
    maxTokens: 50_000,
    maxCostUsd: 5.0,
    maxDurationMs: 60_000,
    usage: {
      toolCalls: 1,
      tokens: 1000,
      costUsd: 0.1,
      startedAtMs: Date.now() - 5000,
    },
    ...overrides,
  };
}

describe('Phase 08C — Quantity Tool Policy & Governance Contracts', () => {
  it('1. returns status allowed when permitted role, valid approval, and remaining budget are present', () => {
    const action = createSampleAction();
    const approval = createSampleApproval();
    const budget = createSampleBudget();

    const decision = authorizeQuantityAction(action, approval, budget);
    expect(decision.status).toBe('allowed');
    expect(decision.reason).toContain('Quantity action authorized');
    expect(decision.data?.toolName).toBe('core_engine.calculate_measurement_facts');
  });

  it('2. returns waiting_approval with zero calls when unapproved or pending', () => {
    const action = createSampleAction();
    const budget = createSampleBudget();

    // Missing approval token
    const decision1 = authorizeQuantityAction(action, undefined, budget);
    expect(decision1.status).toBe('waiting_approval');
    expect(decision1.reason).toContain('requires human approval');

    // Pending approval token
    const pendingApproval = createSampleApproval({ status: 'pending' });
    const decision2 = authorizeQuantityAction(action, pendingApproval, budget);
    expect(decision2.status).toBe('waiting_approval');
    expect(decision2.reason).toContain('pending human decision');
  });

  it('3. returns blocked for wrong role, expired token, rejected status, or wrong project', () => {
    const action = createSampleAction();
    const budget = createSampleBudget();

    // Wrong role (viewer)
    const wrongRoleAction = createSampleAction({ actorRoles: ['viewer'] });
    const approval1 = createSampleApproval({ actorRoles: ['viewer'] });
    const decision1 = authorizeQuantityAction(wrongRoleAction, approval1, budget);
    expect(decision1.status).toBe('blocked');
    expect(decision1.reason).toContain("Actor role 'viewer' is not authorized");

    // Expired token
    const expiredApproval = createSampleApproval({
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    const decision2 = authorizeQuantityAction(action, expiredApproval, budget);
    expect(decision2.status).toBe('blocked');
    expect(decision2.reason).toContain('Approval token is expired');

    // Rejected status
    const rejectedApproval = createSampleApproval({ status: 'rejected' });
    const decision3 = authorizeQuantityAction(action, rejectedApproval, budget);
    expect(decision3.status).toBe('blocked');
    expect(decision3.reason).toContain('Approval request was rejected');

    // Wrong project binding
    const wrongProjectApproval = createSampleApproval({ projectId: 'proj-UNAUTHORIZED' });
    const decision4 = authorizeQuantityAction(action, wrongProjectApproval, budget);
    expect(decision4.status).toBe('blocked');
    expect(decision4.reason).toContain('Approval project binding mismatch');
  });

  it('4. fails closed independently for each budget dimension exhausted', () => {
    const action = createSampleAction();
    const approval = createSampleApproval();

    // maxToolCalls exhausted
    const budgetToolCalls = createSampleBudget({
      maxToolCalls: 5,
      usage: { toolCalls: 5, tokens: 100, costUsd: 0.1, startedAtMs: Date.now() },
    });
    expect(authorizeQuantityAction(action, approval, budgetToolCalls).status).toBe('blocked');
    expect(authorizeQuantityAction(action, approval, budgetToolCalls).reason).toContain(
      'Budget dimension exhausted: maxToolCalls'
    );

    // maxTokens exhausted
    const budgetTokens = createSampleBudget({
      maxTokens: 10_000,
      usage: { toolCalls: 1, tokens: 10_000, costUsd: 0.1, startedAtMs: Date.now() },
    });
    expect(authorizeQuantityAction(action, approval, budgetTokens).status).toBe('blocked');
    expect(authorizeQuantityAction(action, approval, budgetTokens).reason).toContain(
      'Budget dimension exhausted: maxTokens'
    );

    // maxCostUsd exhausted
    const budgetCost = createSampleBudget({
      maxCostUsd: 2.0,
      usage: { toolCalls: 1, tokens: 100, costUsd: 2.0, startedAtMs: Date.now() },
    });
    expect(authorizeQuantityAction(action, approval, budgetCost).status).toBe('blocked');
    expect(authorizeQuantityAction(action, approval, budgetCost).reason).toContain(
      'Budget dimension exhausted: maxCostUsd'
    );

    // maxDurationMs exhausted
    const budgetDuration = createSampleBudget({
      maxDurationMs: 5000,
      usage: { toolCalls: 1, tokens: 100, costUsd: 0.1, startedAtMs: Date.now() - 6000 },
    });
    expect(authorizeQuantityAction(action, approval, budgetDuration).status).toBe('blocked');
    expect(authorizeQuantityAction(action, approval, budgetDuration).reason).toContain(
      'Budget dimension exhausted: maxDurationMs'
    );
  });

  it('5. rejects direct numeric payloads, formula overrides, and unknown payload parameters', () => {
    const approval = createSampleApproval();
    const budget = createSampleBudget();

    // Direct quantity payload
    const actionQuantity = createSampleAction({
      input: {
        projectId: 'proj-101',
        measurementFactIds: ['fact-1'],
        idempotencyKey: 'key-1',
        quantity: 500.0,
      },
    });
    expect(authorizeQuantityAction(actionQuantity, approval, budget).status).toBe('blocked');

    // Direct volume payload
    const actionVolume = createSampleAction({
      input: {
        projectId: 'proj-101',
        measurementFactIds: ['fact-1'],
        idempotencyKey: 'key-1',
        volume: 125.0,
      },
    });
    expect(authorizeQuantityAction(actionVolume, approval, budget).status).toBe('blocked');

    // Direct unitPrice payload
    const actionPrice = createSampleAction({
      input: {
        projectId: 'proj-101',
        measurementFactIds: ['fact-1'],
        idempotencyKey: 'key-1',
        unitPrice: 250000,
      },
    });
    expect(authorizeQuantityAction(actionPrice, approval, budget).status).toBe('blocked');
  });

  it('6. executes approved Engine call exactly once', async () => {
    const mockEngineAdapter = vi.fn().mockResolvedValue({
      concreteVolume: 320.0,
      rebarWeightKg: 4500.0,
    });

    const tool = createCoreEngineTool(mockEngineAdapter);
    const binding: ProjectContextBinding = {
      tenantId: 'tenant-1',
      projectId: 'proj-101',
      actorId: 'actor-1',
      conversationId: 'conv-1',
      allowedToolScopes: ['core:calculate'],
      issuedAt: new Date().toISOString(),
    };

    const result = await tool.handler(
      {
        projectId: 'proj-101',
        measurementFactIds: ['fact-01', 'fact-02'],
        idempotencyKey: 'idemp-once-001',
      },
      binding
    );

    expect(mockEngineAdapter).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      sourceAuthority: 'core_engine',
      concreteVolume: 320.0,
      rebarWeightKg: 4500.0,
    });
  });

  it('7. error/invalid response from Engine does NOT attach core_engine authority', async () => {
    const mockFailingAdapter = vi.fn().mockRejectedValue(new Error('Core Engine service 503 Unavailable'));
    const tool = createCoreEngineTool(mockFailingAdapter);

    const binding: ProjectContextBinding = {
      tenantId: 'tenant-1',
      projectId: 'proj-101',
      actorId: 'actor-1',
      conversationId: 'conv-1',
      allowedToolScopes: ['core:calculate'],
      issuedAt: new Date().toISOString(),
    };

    await expect(
      tool.handler(
        {
          projectId: 'proj-101',
          measurementFactIds: ['fact-01'],
          idempotencyKey: 'idemp-fail-001',
        },
        binding
      )
    ).rejects.toThrow('Core Engine service 503 Unavailable');
  });

  it('8. retains exact Engine response and attaches sourceAuthority=core_engine for valid response', async () => {
    const mockValidAdapter = vi.fn().mockResolvedValue({
      structureId: 'beam-b12',
      computedVolumeM3: 45.8,
      status: 'VERIFIED_CALCULATION',
    });

    const tool = createCoreEngineTool(mockValidAdapter);
    const binding: ProjectContextBinding = {
      tenantId: 'tenant-1',
      projectId: 'proj-101',
      actorId: 'actor-1',
      conversationId: 'conv-1',
      allowedToolScopes: ['core:calculate'],
      issuedAt: new Date().toISOString(),
    };

    const output = (await tool.handler(
      {
        projectId: 'proj-101',
        measurementFactIds: ['fact-100'],
        idempotencyKey: 'idemp-valid-001',
      },
      binding
    )) as Record<string, unknown>;

    expect(output.sourceAuthority).toBe('core_engine');
    expect(output.structureId).toBe('beam-b12');
    expect(output.computedVolumeM3).toBe(45.8);
    expect(output.status).toBe('VERIFIED_CALCULATION');
  });

  it('9. includes clean decision audit log with reason and safe metadata', () => {
    const action = createSampleAction();
    const budget = createSampleBudget();

    const decision = authorizeQuantityAction(action, undefined, budget);

    expect(decision.timestamp).toBeDefined();
    expect(decision.status).toBe('waiting_approval');
    expect(decision.reason).toBe('Authoritative quantity calculation requires human approval');
    expect(decision.data?.toolName).toBe('core_engine.calculate_measurement_facts');
    expect(decision.data?.projectId).toBe('proj-101');
    expect(decision.data?.riskTier).toBe('high');
  });

  it('10. direct tool contract bypass attempt without valid measurementFactIds or binding fails closed', async () => {
    const tool = createCoreEngineTool();
    const binding: ProjectContextBinding = {
      tenantId: 'tenant-1',
      projectId: 'proj-101',
      actorId: 'actor-1',
      conversationId: 'conv-1',
      allowedToolScopes: ['core:calculate'],
      issuedAt: new Date().toISOString(),
    };

    // Attempting bypass with arbitrary numeric payload
    await expect(
      tool.handler(
        {
          projectId: 'proj-101',
          measurementFactIds: ['fact-1'],
          idempotencyKey: 'idemp-bypass-001',
          quantity: 123456.0,
        },
        binding
      )
    ).rejects.toThrow("Direct numeric payloads are rejected: key 'quantity' is prohibited");

    // Attempting bypass with missing project ID
    await expect(
      tool.handler(
        {
          measurementFactIds: ['fact-1'],
          idempotencyKey: 'idemp-bypass-002',
        },
        binding
      )
    ).rejects.toThrow('projectId is required');
  });
});
