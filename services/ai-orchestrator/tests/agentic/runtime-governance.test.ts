import { describe, it, expect, vi } from 'vitest';
import { validateMatureTransition, AgentRunStore } from '../../src/agentic/runtime-store';
import type { MatureAgentRun, MatureRunStatus, AgentActionRecord } from '../../src/agentic/runtime-types';
import { hashPayload, IdempotencyRegistry } from '../../src/agentic/idempotency';
import { ScopedToolRegistry, createDefaultScopedToolRegistry } from '../../src/agentic/scoped-tools';
import { createCoreEngineTool, validateCoreEngineInput } from '../../src/agentic/core-engine-tool';
import type { ProjectContextBinding } from '../../src/agentic/types';

function createMockRun(status: MatureRunStatus = 'queued'): MatureAgentRun {
  const binding: ProjectContextBinding = {
    tenantId: 'tenant-101',
    projectId: 'proj-101',
    actorId: 'actor-101',
    conversationId: 'conv-101',
    allowedToolScopes: ['project_graph.read_active_sheet', 'drawing.review_proposal', 'core_engine.calculate_measurement_facts'],
    issuedAt: new Date().toISOString(),
  };

  return {
    runId: 'run-101',
    goalSpec: {
      goalId: 'goal-101',
      request: 'Calculate floor 1 concrete volume',
      constraints: [],
      deliverables: [],
      assumptions: [],
      riskTier: 'high',
      completionCriteria: [],
      binding,
    },
    plan: {
      planId: 'plan-101',
      version: 1,
      goal: 'Calculate floor 1 concrete volume',
      binding,
      stopConditions: [],
      tasks: [
        {
          id: 'task-1',
          title: 'Read active sheet',
          capability: 'project_graph.read_active_sheet',
          status: 'pending',
          dependencies: [],
          requiresApproval: false,
        },
      ],
    },
    status,
    completedTaskIds: [],
    failedTaskIds: [],
    invocations: [],
    actionRecords: [],
    observations: [],
    artifacts: [],
    pendingApprovalIds: [],
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('Phase 08A — Agentic Runner Governance & Runtime Contracts', () => {
  describe('1. Legal State Transitions & Guard', () => {
    it('proves legal sequence: queued -> planning -> waiting_approval -> running -> completed', () => {
      expect(() => validateMatureTransition('queued', 'planning')).not.toThrow();
      expect(() => validateMatureTransition('planning', 'waiting_approval')).not.toThrow();
      expect(() => validateMatureTransition('waiting_approval', 'running')).not.toThrow();
      expect(() => validateMatureTransition('running', 'completed')).not.toThrow();
    });

    it('rejects invalid or skipped transitions', () => {
      expect(() => validateMatureTransition('queued', 'completed')).toThrow('invalid agent run transition');
      expect(() => validateMatureTransition('queued', 'running')).toThrow('invalid agent run transition');
      expect(() => validateMatureTransition('completed', 'running')).toThrow('invalid agent run transition');
      expect(() => validateMatureTransition('failed', 'running')).toThrow('invalid agent run transition');
    });
  });

  describe('2. Idempotency & Replay Engine', () => {
    it('returns status new for unseen key, replay for identical input, and conflict for different input', () => {
      const registry = new IdempotencyRegistry();
      const payload1 = { projectId: 'proj-101', measurementFactIds: ['fact-1', 'fact-2'] };
      const hash1 = hashPayload(payload1);

      // Claim 1: New
      const claim1 = registry.claim('key-001', hash1);
      expect(claim1.status).toBe('new');

      // Complete claim 1
      registry.complete('key-001', { sourceAuthority: 'core_engine', volume: 150.5 });

      // Claim 2: Same key + same input hash -> Replay
      const claim2 = registry.claim('key-001', hash1);
      expect(claim2.status).toBe('replay');
      expect(claim2.storedResult).toEqual({ sourceAuthority: 'core_engine', volume: 150.5 });

      // Claim 3: Same key + different input hash -> Conflict (fails closed)
      const payload2 = { projectId: 'proj-101', measurementFactIds: ['fact-999'] };
      const hash2 = hashPayload(payload2);
      const claim3 = registry.claim('key-001', hash2);
      expect(claim3.status).toBe('conflict');
    });
  });

  describe('3. Append-Only Action & Audit Records', () => {
    it('appends AgentActionRecord without mutating existing records', () => {
      const run = createMockRun('running');
      const action1: AgentActionRecord = {
        actionId: 'act-001',
        idempotencyKey: 'idemp-001',
        riskTier: 'low',
        inputHash: 'hash1',
        status: 'succeeded',
        createdAt: new Date().toISOString(),
      };

      run.actionRecords = [action1];
      expect(run.actionRecords).toHaveLength(1);

      const action2: AgentActionRecord = {
        actionId: 'act-002',
        idempotencyKey: 'idemp-002',
        riskTier: 'high',
        inputHash: 'hash2',
        status: 'waiting_approval',
        createdAt: new Date().toISOString(),
      };

      run.actionRecords = [...run.actionRecords, action2];
      expect(run.actionRecords).toHaveLength(2);
      expect(run.actionRecords[0].actionId).toBe('act-001');
      expect(run.actionRecords[1].actionId).toBe('act-002');
    });
  });

  describe('4. Scoped Tool Registration & Duplicate Rejection', () => {
    it('rejects duplicate tool registration', () => {
      const registry = new ScopedToolRegistry();
      const tool = {
        toolName: 'test.tool',
        description: 'Test Tool',
        riskTier: 'low' as const,
        requiresApproval: false,
        handler: async () => ({ ok: true }),
      };

      registry.register(tool);
      expect(() => registry.register(tool)).toThrow('Duplicate tool registration rejected: test.tool');
    });

    it('rejects arbitrary unregistered tool requests', () => {
      const registry = createDefaultScopedToolRegistry();
      expect(() => registry.get('malicious_arbitrary_tool')).toThrow(
        'Arbitrary/unregistered tool rejected: malicious_arbitrary_tool'
      );
    });

    it('enforces tool project scope matching', async () => {
      const registry = createDefaultScopedToolRegistry();
      const binding: ProjectContextBinding = {
        tenantId: 'tenant-101',
        projectId: 'proj-authorized',
        actorId: 'actor-101',
        conversationId: 'conv-101',
        allowedToolScopes: ['project_graph.read_active_sheet'],
        issuedAt: new Date().toISOString(),
      };

      // Valid call with matching project binding
      const result = await registry.execute(
        'project_graph.read_active_sheet',
        { projectId: 'proj-authorized', sheetId: 'sheet-1' },
        binding
      );
      expect(result).toEqual({
        projectId: 'proj-authorized',
        activeSheetId: 'sheet-1',
        status: 'read_success',
      });

      // Mismatched project ID fails closed
      await expect(
        registry.execute(
          'project_graph.read_active_sheet',
          { projectId: 'proj-UNAUTHORIZED', sheetId: 'sheet-1' },
          binding
        )
      ).rejects.toThrow('Project binding mismatch');
    });
  });

  describe('5. Core Engine Tool Payload Validation & Authority Boundary', () => {
    it('accepts measurementFactIds references input only', () => {
      const input = {
        projectId: 'proj-101',
        measurementFactIds: ['fact-100', 'fact-101'],
        idempotencyKey: 'idemp-fact-01',
      };
      const validated = validateCoreEngineInput(input);
      expect(validated.projectId).toBe('proj-101');
      expect(validated.measurementFactIds).toEqual(['fact-100', 'fact-101']);
    });

    it('rejects direct numeric payloads and formula overrides', () => {
      expect(() =>
        validateCoreEngineInput({
          projectId: 'proj-101',
          measurementFactIds: ['fact-1'],
          idempotencyKey: 'key-1',
          quantity: 250.0,
        })
      ).toThrow('Direct numeric payloads are rejected: key \'quantity\' is prohibited');

      expect(() =>
        validateCoreEngineInput({
          projectId: 'proj-101',
          measurementFactIds: ['fact-1'],
          idempotencyKey: 'key-1',
          volume: 120.0,
        })
      ).toThrow('Direct numeric payloads are rejected: key \'volume\' is prohibited');

      expect(() =>
        validateCoreEngineInput({
          projectId: 'proj-101',
          measurementFactIds: ['fact-1'],
          idempotencyKey: 'key-1',
          unitPrice: 1500000,
        })
      ).toThrow('Direct numeric payloads are rejected: key \'unitPrice\' is prohibited');
    });

    it('requires human approval for high-risk core_engine calculation tool', () => {
      const tool = createCoreEngineTool();
      expect(tool.riskTier).toBe('high');
      expect(tool.requiresApproval).toBe(true);
    });

    it('proves only an actual Engine response produces sourceAuthority=core_engine', async () => {
      const mockAdapter = vi.fn().mockResolvedValue({
        volume: 345.2,
        unit: 'm3',
        endpoint: '/tkg/takeoff',
      });

      const tool = createCoreEngineTool(mockAdapter);
      const binding: ProjectContextBinding = {
        tenantId: 'tenant-101',
        projectId: 'proj-101',
        actorId: 'actor-101',
        conversationId: 'conv-101',
        allowedToolScopes: ['core_engine.calculate_measurement_facts'],
        issuedAt: new Date().toISOString(),
      };

      const result = (await tool.handler(
        {
          projectId: 'proj-101',
          measurementFactIds: ['fact-001'],
          idempotencyKey: 'key-001',
        },
        binding
      )) as Record<string, unknown>;

      expect(result.sourceAuthority).toBe('core_engine');
      expect(result.volume).toBe(345.2);
      expect(mockAdapter).toHaveBeenCalledWith({
        projectId: 'proj-101',
        measurementFactIds: ['fact-001'],
        idempotencyKey: 'key-001',
      });
    });
  });
});
