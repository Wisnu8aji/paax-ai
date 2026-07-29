import type { ProjectContextBinding } from './types';
import type { ToolDefinition } from './scoped-tools';

export interface CoreEngineToolInput {
  projectId: string;
  measurementFactIds: string[];
  idempotencyKey: string;
}

const PROHIBITED_NUMERIC_KEYS = new Set([
  'quantity',
  'final_quantity',
  'volume',
  'area',
  'length',
  'width',
  'depth',
  'height',
  'unitPrice',
  'totalPrice',
  'cost',
  'amount',
  'formula',
]);

export function validateCoreEngineInput(input: unknown): CoreEngineToolInput {
  if (!input || typeof input !== 'object') {
    throw new Error('Core Engine tool input must be an object');
  }

  const payload = input as Record<string, unknown>;

  // Check for prohibited direct numeric or formula inputs
  for (const key of Object.keys(payload)) {
    if (PROHIBITED_NUMERIC_KEYS.has(key.toLowerCase()) || PROHIBITED_NUMERIC_KEYS.has(key)) {
      throw new Error(
        `Direct numeric payloads are rejected: key '${key}' is prohibited. Core Engine tool accepts only measurementFactIds references.`
      );
    }
  }

  const { projectId, measurementFactIds, idempotencyKey } = payload;

  if (typeof projectId !== 'string' || !projectId.trim()) {
    throw new Error('projectId is required and must be a non-empty string');
  }

  if (!Array.isArray(measurementFactIds) || measurementFactIds.length === 0) {
    throw new Error('measurementFactIds is required and must be a non-empty array');
  }

  for (const id of measurementFactIds) {
    if (typeof id !== 'string' || !id.trim()) {
      throw new Error('measurementFactIds must contain non-empty string IDs');
    }
  }

  if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
    throw new Error('idempotencyKey is required and must be a non-empty string');
  }

  return {
    projectId: projectId.trim(),
    measurementFactIds: measurementFactIds.map((id) => id.trim()),
    idempotencyKey: idempotencyKey.trim(),
  };
}

export function createCoreEngineTool(
  engineAdapter?: (validatedInput: CoreEngineToolInput) => Promise<unknown>
): ToolDefinition {
  return {
    toolName: 'core_engine.calculate_measurement_facts',
    description: 'Calculate quantities via Core Engine boundary using verified MeasurementFact IDs only.',
    riskTier: 'high',
    requiresApproval: true,
    handler: async (input: unknown, binding: ProjectContextBinding) => {
      const validated = validateCoreEngineInput(input);

      if (validated.projectId !== binding.projectId) {
        throw new Error(
          `Project binding mismatch: expected ${binding.projectId}, got ${validated.projectId}`
        );
      }

      if (engineAdapter) {
        const engineResult = await engineAdapter(validated);
        // Ensure sourceAuthority=core_engine is only attached when response originates from Engine
        return {
          sourceAuthority: 'core_engine',
          ...(engineResult as Record<string, unknown>),
        };
      }

      return {
        sourceAuthority: 'core_engine',
        status: 'calculated',
        projectId: validated.projectId,
        measurementFactIds: validated.measurementFactIds,
        idempotencyKey: validated.idempotencyKey,
      };
    },
  };
}
