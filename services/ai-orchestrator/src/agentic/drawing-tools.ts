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
      // Fail-closed: runId must be non-empty and pageIndex must be a non-negative integer. No silent defaults.
      const runId = String(input?.runId || (input as any)?.demRunId || '').trim();
      if (!Number.isInteger(input?.pageIndex) || input.pageIndex < 0 || !runId) {
        throw new Error('runId and non-negative pageIndex are required');
      }
      return handlers.readActiveSheet({ ...input, pageIndex: input.pageIndex, runId }, binding);
    },
  });
  registry.register<ReviewProposalToolInput, unknown>({
    name: 'drawing.review_proposal', scope: 'drawing:review', sideEffect: 'draft', timeoutMs: 15_000,
    execute(input, binding) {
      const proposalId = String(input?.proposalId || '').trim();
      if (!proposalId) throw new Error('proposalId is required for review_proposal');
      if (input?.decision !== 'approve' && input?.decision !== 'reject') throw new Error('decision must be approve or reject');
      return handlers.reviewProposal(input, binding);
    },
  });
  registry.register<CoreEngineFactsInput, unknown>({
    name: 'core_engine.calculate_measurement_facts', scope: 'core:calculate', sideEffect: 'authoritative_write', timeoutMs: 30_000,
    execute(input, binding) {
      rejectDirectNumericQuantity(input as unknown as Record<string, unknown>);
      if (!Array.isArray(input?.measurementFactIds) || input.measurementFactIds.length === 0 || input.measurementFactIds.some((id) => !String(id).trim())) {
        throw new Error('measurementFactIds must be a non-empty array of valid IDs');
      }
      const idempotencyKey = String(input?.idempotencyKey || '').trim();
      if (!idempotencyKey) throw new Error('idempotencyKey is required for calculate_measurement_facts');
      return handlers.calculateMeasurementFacts({ ...input, measurementFactIds: input.measurementFactIds.map((id) => String(id).trim()), idempotencyKey }, binding);
    },
  });
  return registry;
}
