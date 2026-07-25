import { randomUUID } from 'node:crypto';
import type { AgentToolRegistry } from './tool-contract';
import { buildEngineeringPlan } from './goal-planner';
import type { ProjectContextBinding } from './types';
import type { GoalSpec, MatureAgentRun } from './runtime-types';
import { AgentRunStore } from './runtime-store';
import { validateEngineeringClaim, type EngineeringClaim } from './claim-validator';

export class MatureAreteOrchestrator {
  constructor(private readonly store: AgentRunStore, private readonly tools: AgentToolRegistry) {}

  async createRun(request: string, binding: ProjectContextBinding, options?: Partial<Pick<GoalSpec, 'constraints' | 'deliverables' | 'assumptions' | 'riskTier' | 'completionCriteria'>>): Promise<MatureAgentRun> {
    const now = new Date().toISOString();
    const goalSpec: GoalSpec = {
      goalId: `goal-${randomUUID()}`, request, constraints: options?.constraints ?? [], deliverables: options?.deliverables ?? [],
      assumptions: options?.assumptions ?? [], riskTier: options?.riskTier ?? 'medium',
      completionCriteria: options?.completionCriteria ?? ['all mandatory claims verified', 'all requested deliverables created'], binding,
    };
    const run: MatureAgentRun = {
      runId: `run-${randomUUID()}`, goalSpec, plan: buildEngineeringPlan(request, binding), status: 'queued',
      completedTaskIds: [], failedTaskIds: [], invocations: [], observations: [], artifacts: [], pendingApprovalIds: [],
      version: 0, createdAt: now, updatedAt: now,
    };
    return await this.store.create(run);
  }

  validateClaims(run: MatureAgentRun, claims: EngineeringClaim[]): void {
    const failures = claims.flatMap((claim) => validateEngineeringClaim(claim, run.goalSpec.binding.projectId).errors.map((error) => `${claim.claimId}: ${error}`));
    if (failures.length) throw new Error(`claim validation failed: ${failures.join('; ')}`);
  }
}
