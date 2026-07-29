import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AgentRunStore } from '../../src/agentic/runtime-store';
import { AgentExecutionLoop } from '../../src/agentic/execution-loop';
import type { MatureAgentRun, ProjectContextBinding } from '../../src/agentic/index';
import { createDefaultScopedToolRegistry } from '../../src/agentic/scoped-tools';
import { createCoreEngineTool } from '../../src/agentic/core-engine-tool';

const testStorePath = resolve(process.cwd(), '.test-data/execution-loop-test-store.json');

async function cleanupStore() {
  try {
    await rm(testStorePath, { force: true });
  } catch {}
}

function createGovernedRun(runId = 'run-gov-001', projectId = 'proj-101'): MatureAgentRun {
  const binding: ProjectContextBinding = {
    tenantId: 'tenant-101',
    projectId,
    actorId: 'actor-101',
    conversationId: 'conv-101',
    allowedToolScopes: [
      'project_graph.read_active_sheet',
      'drawing.review_proposal',
      'core_engine.calculate_measurement_facts',
    ],
    issuedAt: new Date().toISOString(),
  };

  return {
    runId,
    goalSpec: {
      goalId: 'goal-001',
      request: 'Governance Execution Loop Test',
      constraints: [],
      deliverables: [],
      assumptions: [],
      riskTier: 'high',
      completionCriteria: [],
      binding,
    },
    plan: {
      planId: 'plan-001',
      version: 1,
      goal: 'Governance Execution Loop Test',
      binding,
      stopConditions: [],
      tasks: [
        {
          id: 'task-read-sheet',
          title: 'Read active sheet',
          capability: 'resolve_project_scope',
          status: 'pending',
          dependencies: [],
          requiresApproval: false,
        },
        {
          id: 'task-calc-engine',
          title: 'Calculate measurement facts',
          capability: 'run_core_formula',
          status: 'pending',
          dependencies: ['task-read-sheet'],
          requiresApproval: true,
        },
      ],
    },
    status: 'running',
    completedTaskIds: [],
    failedTaskIds: [],
    invocations: [],
    actionRecords: [],
    observations: [],
    artifacts: [],
    pendingApprovalIds: [],
    version: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    budget: { maxToolCalls: 10, maxTokens: 50_000, maxCostUsd: 2, maxDurationMs: 60_000 },
    budgetUsage: { toolCalls: 0, tokens: 0, costUsd: 0, startedAtMs: Date.now() },
    auditTimeline: [],
  };
}

describe('Phase 08B — Persisted Governed Execution Loop', () => {
  beforeEach(async () => {
    await cleanupStore();
  });

  afterEach(async () => {
    await cleanupStore();
  });

  it('1. completes read tool step cleanly', async () => {
    const store = new AgentRunStore(testStorePath);
    const run = await store.create(createGovernedRun());

    const loop = new AgentExecutionLoop(store);
    const updated = await loop.executeNextStep(run.runId, 0);

    expect(updated.completedTaskIds).toContain('task-read-sheet');
    expect(updated.invocations).toHaveLength(1);
    expect(updated.invocations[0].toolName).toBe('project_graph.read_active_sheet');
    expect(updated.invocations[0].status).toBe('succeeded');
    expect(updated.budgetUsage?.toolCalls).toBe(1);
  });

  it('2. calculation step enters waiting_approval with ZERO Engine calls when unapproved', async () => {
    const store = new AgentRunStore(testStorePath);
    const run = createGovernedRun();
    run.completedTaskIds = ['task-read-sheet'];
    await store.create(run);

    const mockEngineAdapter = vi.fn();
    const loop = new AgentExecutionLoop(store, undefined, mockEngineAdapter);

    const updated = await loop.executeNextStep(run.runId, 0, {
      toolInput: {
        measurementFactIds: ['fact-101', 'fact-102'],
      },
    });

    expect(updated.status).toBe('waiting_approval');
    expect(mockEngineAdapter).not.toHaveBeenCalled();
    expect(updated.pendingApprovalIds).toHaveLength(1);
    expect(updated.invocations).toHaveLength(1);
    expect(updated.invocations[0].toolName).toBe('core_engine.calculate_measurement_facts');
    expect(updated.actionRecords?.[0].status).toBe('waiting_approval');
  });

  it('3. approved calculation calls Engine adapter EXACTLY ONCE', async () => {
    const store = new AgentRunStore(testStorePath);
    const run = createGovernedRun();
    run.completedTaskIds = ['task-read-sheet'];
    await store.create(run);

    const mockEngineAdapter = vi.fn().mockResolvedValue({
      takeoffVolume: 125.4,
      unit: 'm3',
    });

    const loop = new AgentExecutionLoop(store, undefined, mockEngineAdapter);

    const updated = await loop.executeNextStep(run.runId, 0, {
      toolInput: {
        measurementFactIds: ['fact-101', 'fact-102'],
      },
      approvalToken: {
        tokenId: 'token-123',
        projectId: 'proj-101',
        toolName: 'core_engine.calculate_measurement_facts',
        approvedBy: 'estimator-chief',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
    });

    expect(updated.status).toBe('running');
    expect(updated.completedTaskIds).toContain('task-calc-engine');
    expect(mockEngineAdapter).toHaveBeenCalledTimes(1);
    expect(mockEngineAdapter).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'proj-101',
        measurementFactIds: ['fact-101', 'fact-102'],
      })
    );
    expect(updated.invocations[0].output).toEqual({
      sourceAuthority: 'core_engine',
      takeoffVolume: 125.4,
      unit: 'm3',
    });
  });

  it('4. safely resumes/restarts after persisted waiting_approval state', async () => {
    const store = new AgentRunStore(testStorePath);
    const run = createGovernedRun();
    run.completedTaskIds = ['task-read-sheet'];
    run.status = 'waiting_approval';
    await store.create(run);

    const mockEngineAdapter = vi.fn().mockResolvedValue({ status: 'calculated' });
    const loop = new AgentExecutionLoop(store, undefined, mockEngineAdapter);

    const updated = await loop.executeNextStep(run.runId, 0, {
      toolInput: {
        measurementFactIds: ['fact-101'],
      },
      approvalToken: {
        tokenId: 'token-resumed',
        projectId: 'proj-101',
        toolName: 'core_engine.calculate_measurement_facts',
        approvedBy: 'pm-lead',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
    });

    expect(updated.status).toBe('running');
    expect(updated.completedTaskIds).toContain('task-calc-engine');
    expect(mockEngineAdapter).toHaveBeenCalledTimes(1);
  });

  it('5. appends tool/provider failure record honestly on exception', async () => {
    const store = new AgentRunStore(testStorePath);
    const run = createGovernedRun();
    run.completedTaskIds = ['task-read-sheet'];
    await store.create(run);

    const failingEngineAdapter = vi.fn().mockRejectedValue(new Error('HTTP 504 Engine Timeout'));
    const loop = new AgentExecutionLoop(store, undefined, failingEngineAdapter);

    const updated = await loop.executeNextStep(run.runId, 0, {
      toolInput: { measurementFactIds: ['fact-101'] },
      approvalToken: {
        tokenId: 'token-ok',
        projectId: 'proj-101',
        toolName: 'core_engine.calculate_measurement_facts',
        approvedBy: 'pm',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
    });

    expect(updated.status).toBe('failed');
    expect(updated.failure).toContain('HTTP 504 Engine Timeout');
    expect(updated.invocations[0].status).toBe('failed');
    expect(updated.invocations[0].error).toContain('HTTP 504 Engine Timeout');
  });

  it('6. replay performs NO SECOND Engine call for identical idempotency key', async () => {
    const store = new AgentRunStore(testStorePath);
    const run = createGovernedRun();
    run.completedTaskIds = ['task-read-sheet'];
    await store.create(run);

    const mockEngineAdapter = vi.fn().mockResolvedValue({ takeoffVolume: 99.0 });
    const loop = new AgentExecutionLoop(store, undefined, mockEngineAdapter);

    const step1 = await loop.executeNextStep(run.runId, 0, {
      toolInput: { measurementFactIds: ['fact-101'] },
      approvalToken: {
        tokenId: 'token-1',
        projectId: 'proj-101',
        toolName: 'core_engine.calculate_measurement_facts',
        approvedBy: 'pm',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
      idempotencyKey: 'idemp-fixed-001',
    });

    expect(mockEngineAdapter).toHaveBeenCalledTimes(1);

    // Create a second run attempting to reuse identical idempotencyKey + input
    const run2 = createGovernedRun('run-gov-002');
    run2.completedTaskIds = ['task-read-sheet'];
    await store.create(run2);

    const step2 = await loop.executeNextStep(run2.runId, 0, {
      toolInput: { measurementFactIds: ['fact-101'] },
      approvalToken: {
        tokenId: 'token-2',
        projectId: 'proj-101',
        toolName: 'core_engine.calculate_measurement_facts',
        approvedBy: 'pm',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
      idempotencyKey: 'idemp-fixed-001',
    });

    expect(mockEngineAdapter).toHaveBeenCalledTimes(1); // STILL 1 call!
    expect(step2.actionRecords?.[0].status).toBe('replayed');
  });

  it('7. idempotency conflict (same key + different input) fails closed', async () => {
    const store = new AgentRunStore(testStorePath);
    const run = createGovernedRun();
    run.completedTaskIds = ['task-read-sheet'];
    await store.create(run);

    const mockEngineAdapter = vi.fn().mockResolvedValue({ takeoffVolume: 50.0 });
    const loop = new AgentExecutionLoop(store, undefined, mockEngineAdapter);

    await loop.executeNextStep(run.runId, 0, {
      toolInput: { measurementFactIds: ['fact-101'] },
      approvalToken: {
        tokenId: 'token-1',
        projectId: 'proj-101',
        toolName: 'core_engine.calculate_measurement_facts',
        approvedBy: 'pm',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
      idempotencyKey: 'idemp-shared-key',
    });

    const run2 = createGovernedRun('run-gov-002');
    run2.completedTaskIds = ['task-read-sheet'];
    await store.create(run2);

    const conflictResult = await loop.executeNextStep(run2.runId, 0, {
      toolInput: { measurementFactIds: ['fact-DIFFERENT-INPUT'] },
      approvalToken: {
        tokenId: 'token-2',
        projectId: 'proj-101',
        toolName: 'core_engine.calculate_measurement_facts',
        approvedBy: 'pm',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
      idempotencyKey: 'idemp-shared-key',
    });

    expect(conflictResult.status).toBe('failed');
    expect(conflictResult.failure).toContain('Idempotency conflict for key idemp-shared-key');
  });

  it('8. expectedVersion conflict fails closed with no execution', async () => {
    const store = new AgentRunStore(testStorePath);
    const run = await store.create(createGovernedRun());

    const loop = new AgentExecutionLoop(store);

    await expect(loop.executeNextStep(run.runId, 999)).rejects.toThrow('stale agent run: expected 999, actual 0');
  });

  it('9. arbitrary browser input containing direct numeric payload is rejected', async () => {
    const store = new AgentRunStore(testStorePath);
    const run = createGovernedRun();
    run.completedTaskIds = ['task-read-sheet'];
    await store.create(run);

    const loop = new AgentExecutionLoop(store);

    await expect(
      loop.executeNextStep(run.runId, 0, {
        toolInput: {
          measurementFactIds: ['fact-101'],
          quantity: 9999.0, // Prohibited direct numeric input
        },
      })
    ).rejects.toThrow("Direct numeric payloads are rejected: key 'quantity' is prohibited");
  });

  it('10. project binding mismatch is rejected', async () => {
    const store = new AgentRunStore(testStorePath);
    const run = await store.create(createGovernedRun());

    const loop = new AgentExecutionLoop(store);

    await expect(
      loop.executeNextStep(run.runId, 0, {
        toolInput: {
          projectId: 'proj-UNAUTHORIZED-MISMATCH',
        },
      })
    ).rejects.toThrow('Project binding mismatch: expected proj-101, got proj-UNAUTHORIZED-MISMATCH');
  });

  it('11. captures budget usage before/after snapshots and fails when budget is exhausted', async () => {
    const store = new AgentRunStore(testStorePath);
    const run = createGovernedRun();
    run.budget = { maxToolCalls: 1, maxTokens: 1000, maxCostUsd: 1, maxDurationMs: 10000 };
    await store.create(run);

    const loop = new AgentExecutionLoop(store);

    const step1 = await loop.executeNextStep(run.runId, 0);
    expect(step1.actionRecords?.[0].budgetBefore?.toolCalls).toBe(0);
    expect(step1.actionRecords?.[0].budgetAfter?.toolCalls).toBe(1);

    // Step 2 attempts second tool call exceeding maxToolCalls=1
    const run2 = createGovernedRun('run-budget-002');
    run2.completedTaskIds = ['task-read-sheet'];
    run2.budget = { maxToolCalls: 1, maxTokens: 1000, maxCostUsd: 1, maxDurationMs: 10000 };
    run2.budgetUsage = { toolCalls: 1, tokens: 0, costUsd: 0, startedAtMs: Date.now() };
    await store.create(run2);

    const step2 = await loop.executeNextStep(run2.runId, 0, {
      toolInput: { measurementFactIds: ['fact-1'] },
      approvalToken: {
        tokenId: 'token-ok',
        projectId: 'proj-101',
        toolName: 'core_engine.calculate_measurement_facts',
        approvedBy: 'pm',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
    });

    expect(step2.status).toBe('failed');
    expect(step2.failure).toContain('budget exhausted: tool calls');
  });

  it('12. attaches sourceAuthority=core_engine ONLY from validated Engine response', async () => {
    const store = new AgentRunStore(testStorePath);
    const run = createGovernedRun();
    run.completedTaskIds = ['task-read-sheet'];
    await store.create(run);

    const mockEngineAdapter = vi.fn().mockResolvedValue({
      calcResult: 88.5,
    });

    const loop = new AgentExecutionLoop(store, undefined, mockEngineAdapter);

    const updated = await loop.executeNextStep(run.runId, 0, {
      toolInput: { measurementFactIds: ['fact-1'] },
      approvalToken: {
        tokenId: 'token-ok',
        projectId: 'proj-101',
        toolName: 'core_engine.calculate_measurement_facts',
        approvedBy: 'pm',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
    });

    const output = updated.invocations[0].output as Record<string, unknown>;
    expect(output.sourceAuthority).toBe('core_engine');
    expect(output.calcResult).toBe(88.5);
  });
});
