import { createHash, randomUUID } from 'node:crypto';
import type { AgentApprovalToken, AgentToolRegistry } from './tool-contract';
import type { AgentRunStore } from './runtime-store';
import type { MatureAgentRun, ToolInvocationRecord } from './runtime-types';

const TOOL_BY_CAPABILITY: Record<string, string | undefined> = {
  resolve_project_scope: 'project_graph.read_active_sheet',
  query_construction_graph: 'project_graph.read_active_sheet',
  resolve_physical_instances: 'project_graph.read_active_sheet',
  validate_measurement_facts: 'drawing.review_proposal',
  run_core_formula: 'core_engine.calculate_measurement_facts',
};

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function readyTask(run: MatureAgentRun) {
  const done = new Set(run.completedTaskIds);
  return run.plan.tasks.find((task) => !done.has(task.id) && !run.failedTaskIds.includes(task.id) && task.dependencies.every((id) => done.has(id)));
}

function audit(run: MatureAgentRun, type: string, message: string, data?: unknown): MatureAgentRun {
  return { ...run, auditTimeline: [...(run.auditTimeline ?? []), { eventId: `event-${randomUUID()}`, type, message, createdAt: new Date().toISOString(), data }] };
}

function consumeBudget(run: MatureAgentRun, delta: { toolCalls?: number; tokens?: number; costUsd?: number }): MatureAgentRun {
  const budget = run.budget;
  const current = run.budgetUsage;
  if (!budget || !current) throw new Error('run budget is missing');
  const next = { ...current, toolCalls: current.toolCalls + (delta.toolCalls ?? 0), tokens: current.tokens + (delta.tokens ?? 0), costUsd: current.costUsd + (delta.costUsd ?? 0) };
  if (next.toolCalls > budget.maxToolCalls) throw new Error('budget exhausted: tool calls');
  if (next.tokens > budget.maxTokens) throw new Error('budget exhausted: tokens');
  if (next.costUsd > budget.maxCostUsd) throw new Error('budget exhausted: cost');
  if (Date.now() - next.startedAtMs > budget.maxDurationMs) throw new Error('budget exhausted: duration');
  return { ...run, budgetUsage: next };
}

export class AgentExecutionLoop {
  constructor(private readonly store: AgentRunStore, private readonly tools: AgentToolRegistry) {}

  async executeNextStep(runId: string, expectedVersion: number, options: {
    toolInput?: Record<string, unknown>;
    approvalToken?: AgentApprovalToken;
    idempotencyKey?: string;
    tokens?: number;
    costUsd?: number;
  } = {}): Promise<MatureAgentRun> {
    const loaded = await this.store.get(runId);
    if (!loaded) throw new Error(`agent run not found: ${runId}`);
    let run: MatureAgentRun = loaded;
    if (run.version !== expectedVersion) throw new Error(`stale agent run: expected ${expectedVersion}, actual ${run.version}`);
    if (['failed', 'completed', 'cancelled'].includes(run.status)) throw new Error(`agent run is terminal: ${run.status}`);

    const task = readyTask(run);
    if (!task) {
      const completed = run.plan.tasks.every((candidate) => run.completedTaskIds.includes(candidate.id));
      if (!completed) throw new Error('no executable task is ready');
      return await this.store.update(audit({ ...run, status: 'completed' }, 'run_completed', 'All tasks completed'), expectedVersion);
    }

    const toolName = TOOL_BY_CAPABILITY[task.capability];
    if (!toolName) {
      run = audit({ ...run, status: 'running', completedTaskIds: [...new Set([...run.completedTaskIds, task.id])] }, 'task_completed', `Orchestration-only task completed: ${task.id}`);
      return await this.store.update(run, expectedVersion);
    }

    const input = { projectId: run.goalSpec.binding.projectId, ...(options.toolInput ?? {}) };
    const idempotencyKey = options.idempotencyKey ?? String((input as any).idempotencyKey ?? `${run.runId}:${task.id}:${hash(input)}`);
    const previous = run.invocations.find((record) => record.toolName === toolName && record.idempotencyKey === idempotencyKey && record.status === 'succeeded');
    if (previous) {
      run = audit({ ...run, status: 'running', completedTaskIds: [...new Set([...run.completedTaskIds, task.id])], observations: [...run.observations, { observationId: `obs-${randomUUID()}`, taskId: task.id, source: toolName.startsWith('core_engine.') ? 'engine' : 'tool', summary: 'Replayed persisted idempotent tool result', evidenceRefs: [], createdAt: new Date().toISOString() }] }, 'tool_replayed', `Reused ${toolName} without a second call`, { invocationId: previous.invocationId });
      return await this.store.update(run, expectedVersion);
    }

    const metadata = this.tools.describe(toolName);
    const invocation: ToolInvocationRecord = { invocationId: `invoke-${randomUUID()}`, taskId: task.id, toolName, input, status: 'queued', idempotencyKey };
    run = consumeBudget(audit({ ...run, activeTaskId: task.id, status: metadata.sideEffect === 'authoritative_write' && !options.approvalToken ? 'waiting_approval' : 'waiting_tool', invocations: [...run.invocations, invocation] }, 'tool_queued', `Queued ${toolName}`, { invocationId: invocation.invocationId }), { toolCalls: metadata.sideEffect === 'authoritative_write' && !options.approvalToken ? 0 : 1, tokens: options.tokens, costUsd: options.costUsd });
    run = await this.store.update(run, expectedVersion); // invocation is durable before execution

    if (metadata.sideEffect === 'authoritative_write' && !options.approvalToken) return run;

    const running = { ...run, status: 'waiting_tool' as const, invocations: run.invocations.map((record) => record.invocationId === invocation.invocationId ? { ...record, status: 'running' as const, startedAt: new Date().toISOString() } : record) };
    run = await this.store.update(audit(running, 'tool_started', `Executing ${toolName}`), run.version);
    try {
      const output = await this.tools.execute(toolName, input as any, run.goalSpec.binding, options.approvalToken);
      const succeeded = { ...run, status: 'running' as const, activeTaskId: undefined, completedTaskIds: [...new Set([...run.completedTaskIds, task.id])], invocations: run.invocations.map((record) => record.invocationId === invocation.invocationId ? { ...record, status: 'succeeded' as const, output, completedAt: new Date().toISOString() } : record), observations: [...run.observations, { observationId: `obs-${randomUUID()}`, taskId: task.id, source: toolName.startsWith('core_engine.') ? 'engine' as const : 'tool' as const, summary: `${toolName} succeeded`, evidenceRefs: [], createdAt: new Date().toISOString() }] };
      return await this.store.update(audit(succeeded, 'tool_succeeded', `${toolName} succeeded`), run.version);
    } catch (error: any) {
      const failed = { ...run, status: 'failed' as const, activeTaskId: undefined, failedTaskIds: [...new Set([...run.failedTaskIds, task.id])], failure: String(error?.message ?? error), invocations: run.invocations.map((record) => record.invocationId === invocation.invocationId ? { ...record, status: 'failed' as const, error: String(error?.message ?? error), completedAt: new Date().toISOString() } : record) };
      return await this.store.update(audit(failed, 'tool_failed', `${toolName} failed`, { error: failed.failure }), run.version);
    }
  }
}
