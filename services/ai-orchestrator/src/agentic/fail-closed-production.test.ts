import { describe, test, expect, vi } from 'vitest';
import { AgentToolRegistry } from './tool-contract';
import { registerDrawingIntelligenceTools } from './drawing-tools';

describe('Production Fail-Closed Enforcement (No Synthetic Fallbacks)', () => {
  const dummyBinding = {
    tenantId: 'tenant-test',
    projectId: 'PLHUT-SURAKARTA',
    actorId: 'user-test',
    conversationId: 'conv-test-001',
    issuedAt: new Date().toISOString(),
    allowedToolScopes: ['drawing:review', 'core:calculate', 'project_graph:read'],
  };

  const dummyApproval = {
    tokenId: 'token-123',
    projectId: 'PLHUT-SURAKARTA',
    toolName: 'core_engine.calculate_measurement_facts',
    approvedBy: 'user-test',
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  };

  test('reviewProposal must throw when proposalId is missing or empty', async () => {
    const registry = new AgentToolRegistry();
    const handlers = {
      readActiveSheet: vi.fn(),
      reviewProposal: vi.fn(),
      calculateMeasurementFacts: vi.fn(),
    };
    registerDrawingIntelligenceTools(registry, handlers);

    await expect(
      registry.execute('drawing.review_proposal', { projectId: 'PLHUT-SURAKARTA', proposalId: '', decision: 'approve' } as any, dummyBinding)
    ).rejects.toThrow('proposalId is required');

    expect(handlers.reviewProposal).not.toHaveBeenCalled();
  });

  test('reviewProposal must throw when decision is not approve or reject', async () => {
    const registry = new AgentToolRegistry();
    const handlers = {
      readActiveSheet: vi.fn(),
      reviewProposal: vi.fn(),
      calculateMeasurementFacts: vi.fn(),
    };
    registerDrawingIntelligenceTools(registry, handlers);

    await expect(
      registry.execute('drawing.review_proposal', { projectId: 'PLHUT-SURAKARTA', proposalId: 'prop-123', decision: 'invalid_decision' as any } as any, dummyBinding)
    ).rejects.toThrow('decision must be approve or reject');

    expect(handlers.reviewProposal).not.toHaveBeenCalled();
  });

  test('calculateMeasurementFacts must throw when measurementFactIds is empty', async () => {
    const registry = new AgentToolRegistry();
    const handlers = {
      readActiveSheet: vi.fn(),
      reviewProposal: vi.fn(),
      calculateMeasurementFacts: vi.fn(),
    };
    registerDrawingIntelligenceTools(registry, handlers);

    await expect(
      registry.execute('core_engine.calculate_measurement_facts', { projectId: 'PLHUT-SURAKARTA', measurementFactIds: [], idempotencyKey: 'key-1' } as any, dummyBinding, dummyApproval)
    ).rejects.toThrow('measurementFactIds must be a non-empty array');

    expect(handlers.calculateMeasurementFacts).not.toHaveBeenCalled();
  });

  test('calculateMeasurementFacts must throw when idempotencyKey is missing', async () => {
    const registry = new AgentToolRegistry();
    const handlers = {
      readActiveSheet: vi.fn(),
      reviewProposal: vi.fn(),
      calculateMeasurementFacts: vi.fn(),
    };
    registerDrawingIntelligenceTools(registry, handlers);

    await expect(
      registry.execute('core_engine.calculate_measurement_facts', { projectId: 'PLHUT-SURAKARTA', measurementFactIds: ['mf-001'], idempotencyKey: '' } as any, dummyBinding, dummyApproval)
    ).rejects.toThrow('idempotencyKey is required');

    expect(handlers.calculateMeasurementFacts).not.toHaveBeenCalled();
  });

  test('readActiveSheet must throw when runId is missing or empty — no hardcoded DEM fallback allowed', async () => {
    const registry = new AgentToolRegistry();
    const handlers = {
      readActiveSheet: vi.fn(),
      reviewProposal: vi.fn(),
      calculateMeasurementFacts: vi.fn(),
    };
    registerDrawingIntelligenceTools(registry, handlers);

    // Missing runId must NOT silently fall back to any hardcoded DEM run ID
    await expect(
      registry.execute('project_graph.read_active_sheet', { projectId: 'PLHUT-SURAKARTA', pageIndex: 0, runId: '' } as any, dummyBinding)
    ).rejects.toThrow('runId and non-negative pageIndex are required');

    expect(handlers.readActiveSheet).not.toHaveBeenCalled();
  });

  test('readActiveSheet must throw when pageIndex is negative', async () => {
    const registry = new AgentToolRegistry();
    const handlers = {
      readActiveSheet: vi.fn(),
      reviewProposal: vi.fn(),
      calculateMeasurementFacts: vi.fn(),
    };
    registerDrawingIntelligenceTools(registry, handlers);

    await expect(
      registry.execute('project_graph.read_active_sheet', { projectId: 'PLHUT-SURAKARTA', pageIndex: -1, runId: 'real-run-id-from-server' } as any, dummyBinding)
    ).rejects.toThrow('runId and non-negative pageIndex are required');

    expect(handlers.readActiveSheet).not.toHaveBeenCalled();
  });
});
