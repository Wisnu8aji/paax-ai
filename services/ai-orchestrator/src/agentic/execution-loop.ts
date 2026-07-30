import { createHash, randomUUID } from 'node:crypto';
import type { AgentApprovalToken, AgentToolRegistry } from './tool-contract';
import type { AgentRunStore } from './runtime-store';
import type { MatureAgentRun, ToolInvocationRecord, AgentActionRecord } from './runtime-types';
import { hashPayload, IdempotencyRegistry } from './idempotency';
import { createDefaultScopedToolRegistry, ScopedToolRegistry } from './scoped-tools';
import { createCoreEngineTool, validateCoreEngineInput } from './core-engine-tool';

const TOOL_BY_CAPABILITY: Record<string, string | undefined> = {
  resolve_project_scope: 'project_graph.read_active_sheet',
  query_construction_graph: 'project_graph.read_active_sheet',
  resolve_physical_instances: 'project_graph.read_active_sheet',
  validate_measurement_facts: 'drawing.review_proposal',
  run_core_formula: 'core_engine.calculate_measurement_facts',
};

function readyTask(run: MatureAgentRun) {
  const done = new Set(run.completedTaskIds);
  return run.plan.tasks.find(
    (task) =>
      !done.has(task.id) &&
      !run.failedTaskIds.includes(task.id) &&
      task.dependencies.every((id) => done.has(id))
  );
}

function audit(
  run: MatureAgentRun,
  type: string,
  message: string,
  data?: unknown
): MatureAgentRun {
  return {
    ...run,
    auditTimeline: [
      ...(run.auditTimeline ?? []),
      {
        eventId: `event-${randomUUID()}`,
        type,
        message,
        createdAt: new Date().toISOString(),
        data,
      },
    ],
  };
}

function checkAndRecordBudget(
  run: MatureAgentRun,
  delta: { toolCalls?: number; tokens?: number; costUsd?: number }
): { run: MatureAgentRun; budgetBefore: any; budgetAfter: any } {
  const budget = run.budget;
  const current = run.budgetUsage;
  if (!budget || !current) throw new Error('run budget is missing');

  const budgetBefore = { ...current };
  const next = {
    ...current,
    toolCalls: current.toolCalls + (delta.toolCalls ?? 0),
    tokens: current.tokens + (delta.tokens ?? 0),
    costUsd: current.costUsd + (delta.costUsd ?? 0),
  };

  if (next.toolCalls > budget.maxToolCalls) throw new Error('budget exhausted: tool calls');
  if (next.tokens > budget.maxTokens) throw new Error('budget exhausted: tokens');
  if (next.costUsd > budget.maxCostUsd) throw new Error('budget exhausted: cost');
  if (Date.now() - next.startedAtMs > budget.maxDurationMs) throw new Error('budget exhausted: duration');

  const budgetAfter = { ...next };
  return {
    run: { ...run, budgetUsage: next },
    budgetBefore,
    budgetAfter,
  };
}

export class AgentExecutionLoop {
  private readonly idempotencyRegistry = new IdempotencyRegistry();
  private readonly scopedTools: ScopedToolRegistry;
  private readonly legacyRegistry?: AgentToolRegistry;

  constructor(
    private readonly store: AgentRunStore,
    tools?: ScopedToolRegistry | AgentToolRegistry,
    private readonly coreEngineAdapter?: (input: any) => Promise<unknown>
  ) {
    if (tools && 'describe' in tools && typeof tools.describe === 'function') {
      this.legacyRegistry = tools as AgentToolRegistry;
      this.scopedTools = createDefaultScopedToolRegistry();
    } else {
      this.scopedTools = (tools as ScopedToolRegistry) ?? createDefaultScopedToolRegistry();
    }

    if (!this.scopedTools.has('core_engine.calculate_measurement_facts')) {
      this.scopedTools.register(createCoreEngineTool(this.coreEngineAdapter));
    }
  }

  private hasTool(toolName: string): boolean {
    if (this.legacyRegistry) {
      try {
        this.legacyRegistry.describe(toolName);
        return true;
      } catch {
        return false;
      }
    }
    return this.scopedTools.has(toolName);
  }

  private getToolMeta(toolName: string): { riskTier: 'low' | 'medium' | 'high' | 'critical'; requiresApproval: boolean } {
    if (this.legacyRegistry) {
      const desc = this.legacyRegistry.describe(toolName);
      return {
        riskTier: desc.sideEffect === 'authoritative_write' ? 'high' : 'low',
        requiresApproval: desc.sideEffect === 'authoritative_write',
      };
    }
    const def = this.scopedTools.get(toolName);
    return {
      riskTier: def.riskTier,
      requiresApproval: def.requiresApproval,
    };
  }

  private async executeTool(
    toolName: string,
    input: Record<string, unknown>,
    binding: any,
    approvalToken?: AgentApprovalToken
  ): Promise<unknown> {
    if (this.legacyRegistry) {
      return await this.legacyRegistry.execute(toolName, input, binding, approvalToken);
    }
    return await this.scopedTools.execute(toolName, input, binding);
  }

  async executeNextStep(
    runId: string,
    expectedVersion: number,
    options: {
      toolInput?: Record<string, unknown>;
      approvalToken?: AgentApprovalToken;
      idempotencyKey?: string;
      tokens?: number;
      costUsd?: number;
    } = {}
  ): Promise<MatureAgentRun> {
    const loaded = await this.store.get(runId);
    if (!loaded) throw new Error(`agent run not found: ${runId}`);

    let run: MatureAgentRun = loaded;
    if (run.version !== expectedVersion) {
      throw new Error(`stale agent run: expected ${expectedVersion}, actual ${run.version}`);
    }

    if (['failed', 'completed', 'cancelled'].includes(run.status)) {
      throw new Error(`agent run is terminal: ${run.status}`);
    }

    const task = readyTask(run);
    if (!task) {
      const completed = run.plan.tasks.every((candidate) =>
        run.completedTaskIds.includes(candidate.id)
      );
      if (!completed) throw new Error('no executable task is ready');
      return await this.store.update(
        audit({ ...run, status: 'completed' }, 'run_completed', 'All tasks completed'),
        expectedVersion
      );
    }

    const toolName = TOOL_BY_CAPABILITY[task.capability];
    if (!toolName) {
      run = audit(
        {
          ...run,
          status: 'running',
          completedTaskIds: [...new Set([...run.completedTaskIds, task.id])],
        },
        'task_completed',
        `Orchestration-only task completed: ${task.id}`
      );
      return await this.store.update(run, expectedVersion);
    }

    if (!this.hasTool(toolName)) {
      throw new Error(`Arbitrary/unregistered tool rejected: ${toolName}`);
    }

    const toolMeta = this.getToolMeta(toolName);

    // Formulate tool input & validate project binding
    const input: Record<string, unknown> = {
      projectId: run.goalSpec.binding.projectId,
      runId: run.runId,
      pageIndex: 0,
      ...(options.toolInput ?? {}),
    };

    if (input.projectId !== run.goalSpec.binding.projectId) {
      throw new Error(
        `Project binding mismatch: expected ${run.goalSpec.binding.projectId}, got ${input.projectId}`
      );
    }

    const key =
      options.idempotencyKey ??
      String((input as any).idempotencyKey ?? `${run.runId}:${task.id}:${hashPayload(input)}`);

    input.idempotencyKey = key;

    // Enforce Phase 08A direct-numeric-payload rejection for core_engine tool
    if (toolName === 'core_engine.calculate_measurement_facts') {
      validateCoreEngineInput(input);
    }

    const hashableInput = { ...input };
    delete hashableInput.runId;
    const inputHash = hashPayload(hashableInput);

    // Claim idempotency
    const claim = this.idempotencyRegistry.claim(key, inputHash);

    if (claim.status === 'conflict') {
      const failed = {
        ...run,
        status: 'failed' as const,
        activeTaskId: undefined,
        failedTaskIds: [...new Set([...run.failedTaskIds, task.id])],
        failure: `Idempotency conflict for key ${key}: same key supplied with different payload input`,
      };
      return await this.store.update(
        audit(failed, 'idempotency_conflict', `Idempotency conflict for key ${key}`),
        expectedVersion
      );
    }

    // Replay handling: if same key+input was previously completed, return stored result without second execution
    if (claim.status === 'replay') {
      const previousOutput = claim.storedResult;
      run = audit(
        {
          ...run,
          status: 'running',
          completedTaskIds: [...new Set([...run.completedTaskIds, task.id])],
          observations: [
            ...run.observations,
            {
              observationId: `obs-${randomUUID()}`,
              taskId: task.id,
              source: toolName.startsWith('core_engine.') ? 'engine' : 'tool',
              summary: 'Replayed persisted idempotent tool result',
              evidenceRefs: [],
              createdAt: new Date().toISOString(),
            },
          ],
          actionRecords: [
            ...(run.actionRecords ?? []),
            {
              actionId: `act-${randomUUID()}`,
              idempotencyKey: key,
              riskTier: toolMeta.riskTier,
              inputHash,
              outputHash: claim.record?.outputHash,
              status: 'replayed',
              createdAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
            },
          ],
        },
        'tool_replayed',
        `Reused ${toolName} result without second execution`,
        { idempotencyKey: key }
      );
      return await this.store.update(run, expectedVersion);
    }

    // Budget check and recording before/after
    const requiresApproval = toolMeta.requiresApproval && !options.approvalToken;
    let budgetResult;
    try {
      budgetResult = checkAndRecordBudget(run, {
        toolCalls: requiresApproval ? 0 : 1,
        tokens: options.tokens,
        costUsd: options.costUsd,
      });
      run = budgetResult.run;
    } catch (budgetError: any) {
      const failed = {
        ...run,
        status: 'failed' as const,
        activeTaskId: undefined,
        failedTaskIds: [...new Set([...run.failedTaskIds, task.id])],
        failure: String(budgetError?.message ?? budgetError),
      };
      return await this.store.update(
        audit(failed, 'budget_exhausted', `Budget exhausted: ${budgetError.message}`),
        expectedVersion
      );
    }

    // Append ToolInvocationRecord before execution
    const invocation: ToolInvocationRecord = {
      invocationId: `invoke-${randomUUID()}`,
      taskId: task.id,
      toolName,
      input,
      status: 'queued',
      idempotencyKey: key,
    };

    const actionRecord: AgentActionRecord = {
      actionId: `act-${randomUUID()}`,
      idempotencyKey: key,
      riskTier: toolMeta.riskTier,
      approvalId: (options.approvalToken as any)?.tokenId ?? (options.approvalToken as any)?.approvalId,
      budgetBefore: budgetResult.budgetBefore,
      budgetAfter: budgetResult.budgetAfter,
      inputHash,
      status: requiresApproval ? 'waiting_approval' : 'running',
      createdAt: new Date().toISOString(),
    };

    run = audit(
      {
        ...run,
        activeTaskId: task.id,
        status: requiresApproval ? 'waiting_approval' : 'waiting_tool',
        invocations: [...run.invocations, invocation],
        actionRecords: [...(run.actionRecords ?? []), actionRecord],
        pendingApprovalIds: requiresApproval
          ? [...new Set([...run.pendingApprovalIds, `appr-${key}`])]
          : run.pendingApprovalIds,
      },
      'tool_queued',
      `Queued ${toolName}`,
      { invocationId: invocation.invocationId, requiresApproval }
    );

    run = await this.store.update(run, expectedVersion); // invocation & action persisted durable before execution

    // If tool requires approval and token is missing, stop at waiting_approval with ZERO Engine calls
    if (requiresApproval) {
      return run;
    }

    // Execute tool
    const running = {
      ...run,
      status: 'waiting_tool' as const,
      invocations: run.invocations.map((record) =>
        record.invocationId === invocation.invocationId
          ? { ...record, status: 'running' as const, startedAt: new Date().toISOString() }
          : record
      ),
    };
    run = await this.store.update(audit(running, 'tool_started', `Executing ${toolName}`), run.version);

    try {
      const rawOutput = await this.executeTool(toolName, input, run.goalSpec.binding, options.approvalToken);

      this.idempotencyRegistry.complete(key, rawOutput);

      const succeeded = {
        ...run,
        status: 'running' as const,
        activeTaskId: undefined,
        completedTaskIds: [...new Set([...run.completedTaskIds, task.id])],
        invocations: run.invocations.map((record) =>
          record.invocationId === invocation.invocationId
            ? {
                ...record,
                status: 'succeeded' as const,
                output: rawOutput,
                completedAt: new Date().toISOString(),
              }
            : record
        ),
        actionRecords: (run.actionRecords ?? []).map((rec) =>
          rec.idempotencyKey === key
            ? {
                ...rec,
                status: 'succeeded' as const,
                outputHash: hashPayload(rawOutput),
                completedAt: new Date().toISOString(),
              }
            : rec
        ),
        observations: [
          ...run.observations,
          {
            observationId: `obs-${randomUUID()}`,
            taskId: task.id,
            source: toolName.startsWith('core_engine.') ? ('engine' as const) : ('tool' as const),
            summary: `${toolName} succeeded`,
            evidenceRefs: [],
            createdAt: new Date().toISOString(),
          },
        ],
      };
      return await this.store.update(
        audit(succeeded, 'tool_succeeded', `${toolName} succeeded`),
        run.version
      );
    } catch (error: any) {
      const failureMsg = String(error?.message ?? error);
      const failed = {
        ...run,
        status: 'failed' as const,
        activeTaskId: undefined,
        failedTaskIds: [...new Set([...run.failedTaskIds, task.id])],
        failure: failureMsg,
        invocations: run.invocations.map((record) =>
          record.invocationId === invocation.invocationId
            ? {
                ...record,
                status: 'failed' as const,
                error: failureMsg,
                completedAt: new Date().toISOString(),
              }
            : record
        ),
        actionRecords: (run.actionRecords ?? []).map((rec) =>
          rec.idempotencyKey === key
            ? {
                ...rec,
                status: 'failed' as const,
                error: failureMsg,
                completedAt: new Date().toISOString(),
              }
            : rec
        ),
      };
      return await this.store.update(
        audit(failed, 'tool_failed', `${toolName} failed`, { error: failureMsg }),
        run.version
      );
    }
  }
}
