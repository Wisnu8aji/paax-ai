import { describe, expect, it, vi } from 'vitest';
import { AgentToolRegistry } from './tool-contract';
import { registerDrawingIntelligenceTools } from './drawing-tools';

const binding = { tenantId: 'T', projectId: 'P', actorId: 'U', conversationId: 'C', allowedToolScopes: ['project_graph:read','drawing:review','core:calculate'], issuedAt: new Date().toISOString() };

describe('Drawing Intelligence agent tools', () => {
  it('registers exactly the governed drawing tools', () => {
    const registry = registerDrawingIntelligenceTools(new AgentToolRegistry(), { readActiveSheet: vi.fn(), reviewProposal: vi.fn(), calculateMeasurementFacts: vi.fn() });
    expect(registry.list()).toEqual(['core_engine.calculate_measurement_facts','drawing.review_proposal','project_graph.read_active_sheet']);
  });

  it('rejects direct numeric quantity payload and requires approval for Core Engine', async () => {
    const calculate = vi.fn();
    const registry = registerDrawingIntelligenceTools(new AgentToolRegistry(), { readActiveSheet: vi.fn(), reviewProposal: vi.fn(), calculateMeasurementFacts: calculate });
    await expect(registry.execute('core_engine.calculate_measurement_facts', { projectId:'P', measurementFactIds:['M1'], idempotencyKey:'K', quantity: 99 } as any, binding as any, { tokenId:'A', projectId:'P', toolName:'core_engine.calculate_measurement_facts', approvedBy:'owner', expiresAt:new Date(Date.now()+10000).toISOString() })).rejects.toThrow('direct numeric payload');
    await expect(registry.execute('core_engine.calculate_measurement_facts', { projectId:'P', measurementFactIds:['M1'], idempotencyKey:'K' }, binding as any)).rejects.toThrow('approval token');
    expect(calculate).not.toHaveBeenCalled();
  });
});
