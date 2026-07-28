import type { ProjectContextBinding } from './types';
import { AgentToolRegistry } from './tool-contract';

export interface ActiveSheetToolInput { projectId: string; runId: string; pageIndex: number; }
export interface ReviewProposalToolInput { projectId: string; proposalId: string; decision: 'approve' | 'reject'; note?: string; }
export interface CoreEngineFactsInput { projectId: string; measurementFactIds: string[]; idempotencyKey: string; }

export interface DrawingToolHandlers {
  readActiveSheet(input: ActiveSheetToolInput, binding: ProjectContextBinding): Promise<unknown>;
  reviewProposal(input: ReviewProposalToolInput, binding: ProjectContextBinding): Promise<unknown>;
  calculateMeasurementFacts(input: CoreEngineFactsInput, binding: ProjectContextBinding): Promise<unknown>;
}

function rejectDirectNumericQuantity(input: Record<string, unknown>): void {
  for (const key of ['quantity', 'result', 'total', 'volume', 'area', 'length', 'count', 'value']) {
    if (typeof input[key] === 'number') throw new Error(`direct numeric payload is forbidden for Core Engine tool: ${key}`);
  }
}

export function registerDrawingIntelligenceTools(registry: AgentToolRegistry, handlers: DrawingToolHandlers): AgentToolRegistry {
  registry.register<ActiveSheetToolInput, unknown>({
    name: 'project_graph.read_active_sheet', scope: 'project_graph:read', sideEffect: 'none', timeoutMs: 15_000,
    execute(input, binding) {
      if (!Number.isInteger(input.pageIndex) || input.pageIndex < 0 || !input.runId?.trim()) throw new Error('runId and non-negative pageIndex are required');
      return handlers.readActiveSheet(input, binding);
    },
  });
  registry.register<ReviewProposalToolInput, unknown>({
    name: 'drawing.review_proposal', scope: 'drawing:review', sideEffect: 'draft', timeoutMs: 15_000,
    execute(input, binding) {
      if (!input.proposalId?.trim() || !['approve', 'reject'].includes(input.decision)) throw new Error('valid proposal decision is required');
      return handlers.reviewProposal(input, binding);
    },
  });
  registry.register<CoreEngineFactsInput, unknown>({
    name: 'core_engine.calculate_measurement_facts', scope: 'core:calculate', sideEffect: 'authoritative_write', timeoutMs: 30_000,
    execute(input, binding) {
      rejectDirectNumericQuantity(input as unknown as Record<string, unknown>);
      if (!Array.isArray(input.measurementFactIds) || !input.measurementFactIds.length || input.measurementFactIds.some((id) => !String(id).trim())) {
        throw new Error('verified Measurement Fact IDs are required');
      }
      if (!input.idempotencyKey?.trim()) throw new Error('idempotencyKey is required');
      return handlers.calculateMeasurementFacts(input, binding);
    },
  });
  return registry;
}
