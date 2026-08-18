export type SubagentStatus =
  | "requested"
  | "rejected"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "aborted";

export interface SubagentRequest {
  parentRunId: string;
  parentTurnId: string;
  bindingId: string;
  depth: number;
  task: string;
  requestedScopes: readonly string[];
  requestedTools: readonly string[];
  idempotencyKey: string;
  tenantId?: string;
  parentSessionId?: string;
  requestedContextRefs?: readonly string[];
  budget?: SubagentBudget;
}

export interface SubagentBudget {
  maxDepth: number;
  maxDurationMs: number;
  maxIterations: number;
  maxToolCalls: number;
  maxTotalTokens: number;
}

export interface SubagentExecutionInput {
  subagentId: string;
  task: string;
  request: Readonly<SubagentRequest>;
  allowedTools: readonly string[];
  contextRefs: readonly string[];
}

export interface SanitizedSubagentUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface SubagentResult {
  status: "completed" | "failed" | "aborted" | "rejected";
  summary: string;
  content?: string;
  stopReason: string;
  usage: SanitizedSubagentUsage;
  evidenceRefs: string[];
}

export type SubagentExecutorResult = Omit<SubagentResult, "status"> & {
  status?: SubagentResult["status"];
};

export interface SubagentExecutor {
  execute(input: SubagentExecutionInput, signal: AbortSignal): Promise<SubagentExecutorResult>;
}

export interface SubagentRecord {
  subagentId: string;
  request: Readonly<SubagentRequest>;
  childSessionId?: string;
  status: SubagentStatus;
  createdAt: string;
  updatedAt: string;
  resultRef?: string;
  errorCode?: string;
  result?: SubagentResult;
}

export interface SubagentGuardDecision {
  allowed: boolean;
  code:
    | "allowed"
    | "delegation_not_in_phase"
    | "recursion_denied"
    | "binding_mismatch"
    | "scope_escalation"
    | "forbidden_capability"
    | "disabled"
    | "budget_invalid"
    | "child_limit"
    | "idempotency_conflict"
    | "invalid_request";
}

export interface SubagentLifecycle {
  request(input: SubagentRequest): Promise<SubagentRecord>;
  get(subagentId: string): SubagentRecord | undefined;
  transition(subagentId: string, status: SubagentStatus): Promise<SubagentRecord>;
  guard(input: SubagentRequest): SubagentGuardDecision;
  execute?(subagentId: string, signal?: AbortSignal): Promise<SubagentResult>;
}

export interface SubagentLifecycleOptions {
  parentRunId?: string;
  parentTurnId?: string;
  parentBindingId?: string;
  allowedScopes?: readonly string[];
  allowedTools?: readonly string[];
  now?: () => string;
  db?: import("../state/session-db").SessionDB;
  enabled?: boolean;
  parentSessionId?: string;
  tenantId?: string;
  maxDepth?: number;
  maxChildren?: number;
  executor?: SubagentExecutor;
  childSessionIdFactory?: (input: { subagentId: string; request: Readonly<SubagentRequest> }) => string | Promise<string>;
}

export class SubagentTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubagentTransitionError";
  }
}

function cloneRequest(request: SubagentRequest): SubagentRequest {
  return {
    parentRunId: request.parentRunId,
    parentTurnId: request.parentTurnId,
    bindingId: request.bindingId,
    depth: request.depth,
    task: request.task,
    requestedScopes: [...request.requestedScopes],
    requestedTools: [...request.requestedTools],
    idempotencyKey: request.idempotencyKey,
    ...(request.tenantId ? { tenantId: request.tenantId } : {}),
    ...(request.parentSessionId ? { parentSessionId: request.parentSessionId } : {}),
    ...(request.requestedContextRefs ? { requestedContextRefs: [...request.requestedContextRefs] } : {}),
    ...(request.budget ? { budget: { ...request.budget } } : {}),
  };
}

function cloneRecord(record: SubagentRecord): SubagentRecord {
  return {
    ...record,
    request: cloneRequest(record.request),
    ...(record.result ? { result: structuredClone(record.result) } : {}),
  };
}

function validCapabilityList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.length <= 128 && value.every((item) => typeof item === "string" && /^[A-Za-z0-9._:/-]{1,128}$/u.test(item));
}

function validIdentity(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9._:/-]{1,256}$/u.test(value);
}

/**
 * In-memory Phase 4 delegation boundary. It records a rejected handoff and
 * deliberately has no provider, child loop, or durable restart behavior.
 */
export class InMemorySubagentLifecycle implements SubagentLifecycle {
  private readonly records = new Map<string, SubagentRecord>();
  private readonly idempotency = new Map<string, string>();
  private readonly allowedScopes: ReadonlySet<string>;
  private readonly allowedTools: ReadonlySet<string>;
  private readonly now: () => string;
  private nextId = 1;

  constructor(private readonly options: SubagentLifecycleOptions = {}) {
    this.allowedScopes = new Set(options.allowedScopes ?? []);
    this.allowedTools = new Set(options.allowedTools ?? []);
    this.now = options.now ?? (() => new Date().toISOString());
  }

  guard(input: SubagentRequest): SubagentGuardDecision {
    if (!input || !validIdentity(input.parentRunId) || !validIdentity(input.parentTurnId) || !validIdentity(input.bindingId)) {
      return { allowed: false, code: "invalid_request" };
    }
    if (this.options.parentRunId && input.parentRunId !== this.options.parentRunId) {
      return { allowed: false, code: "binding_mismatch" };
    }
    if (this.options.parentTurnId && input.parentTurnId !== this.options.parentTurnId) {
      return { allowed: false, code: "binding_mismatch" };
    }
    if (this.options.parentBindingId && input.bindingId !== this.options.parentBindingId) {
      return { allowed: false, code: "binding_mismatch" };
    }
    if (!Number.isInteger(input.depth) || input.depth < 0) return { allowed: false, code: "invalid_request" };
    if (input.depth !== 0) return { allowed: false, code: "recursion_denied" };
    if (typeof input.task !== "string" || !input.task.trim() || input.task.length > 8_000) {
      return { allowed: false, code: "invalid_request" };
    }
    if (!validCapabilityList(input.requestedScopes) || !validCapabilityList(input.requestedTools)) {
      return { allowed: false, code: "invalid_request" };
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(input.idempotencyKey)) {
      return { allowed: false, code: "invalid_request" };
    }
    if (input.requestedScopes.some((scope) => !this.allowedScopes.has(scope)) || input.requestedTools.some((tool) => !this.allowedTools.has(tool))) {
      return { allowed: false, code: "scope_escalation" };
    }
    return { allowed: true, code: "allowed" };
  }

  async request(input: SubagentRequest): Promise<SubagentRecord> {
    const replayId = typeof input?.idempotencyKey === "string" ? this.idempotency.get(input.idempotencyKey) : undefined;
    if (replayId) return this.get(replayId)!;

    const decision = this.guard(input);
    const now = this.now();
    const subagentId = `subagent-${this.nextId++}`;
    const request = cloneRequest({
      ...input,
      requestedScopes: Array.isArray(input?.requestedScopes) ? input.requestedScopes : [],
      requestedTools: Array.isArray(input?.requestedTools) ? input.requestedTools : [],
    });
    const record: SubagentRecord = {
      subagentId,
      request,
      status: "rejected",
      createdAt: now,
      updatedAt: now,
      errorCode: decision.allowed ? "delegation_not_in_phase" : decision.code,
    };
    this.records.set(subagentId, record);
    if (/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(request.idempotencyKey)) this.idempotency.set(request.idempotencyKey, subagentId);
    return cloneRecord(record);
  }

  get(subagentId: string): SubagentRecord | undefined {
    const record = this.records.get(subagentId);
    return record ? cloneRecord(record) : undefined;
  }

  async transition(subagentId: string, status: SubagentStatus): Promise<SubagentRecord> {
    const record = this.records.get(subagentId);
    if (!record) throw new SubagentTransitionError("subagent record not found");
    if (record.status === status) return cloneRecord(record);
    const allowed = {
      requested: new Set<SubagentStatus>(["queued", "rejected", "aborted"]),
      queued: new Set<SubagentStatus>(["running", "rejected", "aborted"]),
      running: new Set<SubagentStatus>(["completed", "failed", "aborted"]),
      rejected: new Set<SubagentStatus>(),
      completed: new Set<SubagentStatus>(),
      failed: new Set<SubagentStatus>(),
      aborted: new Set<SubagentStatus>(),
    } satisfies Record<SubagentStatus, ReadonlySet<SubagentStatus>>;
    if (!allowed[record.status].has(status)) throw new SubagentTransitionError(`invalid subagent transition: ${record.status} -> ${status}`);
    record.status = status;
    record.updatedAt = this.now();
    return cloneRecord(record);
  }
}

/** Durable, single-child execution boundary. It receives an executor/factory; it never calls a provider or owns a second loop. */
export class DurableSubagentLifecycle implements SubagentLifecycle {
  private readonly records = new Map<string, SubagentRecord>();
  private readonly idempotency = new Map<string, string>();
  private readonly allowedScopes: ReadonlySet<string>;
  private readonly allowedTools: ReadonlySet<string>;
  private readonly now: () => string;
  private readonly maxDepth: number;
  private readonly maxChildren: number;
  private readonly enabled: boolean;

  constructor(private readonly options: SubagentLifecycleOptions = {}) {
    this.allowedScopes = new Set(options.allowedScopes ?? []);
    this.allowedTools = new Set(options.allowedTools ?? []);
    this.now = options.now ?? (() => new Date().toISOString());
    this.maxDepth = options.maxDepth ?? 1;
    this.maxChildren = options.maxChildren ?? 4;
    this.enabled = options.enabled ?? false;
  }

  guard(input: SubagentRequest): SubagentGuardDecision {
    if (!this.enabled) return { allowed: false, code: "disabled" };
    if (!input || !validIdentity(input.parentRunId) || !validIdentity(input.parentTurnId) || !validIdentity(input.bindingId)) return { allowed: false, code: "invalid_request" };
    if (this.options.parentRunId && input.parentRunId !== this.options.parentRunId) return { allowed: false, code: "binding_mismatch" };
    if (this.options.parentTurnId && input.parentTurnId !== this.options.parentTurnId) return { allowed: false, code: "binding_mismatch" };
    if (this.options.parentBindingId && input.bindingId !== this.options.parentBindingId) return { allowed: false, code: "binding_mismatch" };
    if (!Number.isInteger(input.depth) || input.depth !== 0 || input.depth >= this.maxDepth) return { allowed: false, code: "recursion_denied" };
    if (typeof input.task !== "string" || !input.task.trim() || input.task.length > 8_000) return { allowed: false, code: "invalid_request" };
    if (!validCapabilityList(input.requestedScopes) || !validCapabilityList(input.requestedTools)) return { allowed: false, code: "invalid_request" };
    if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(input.idempotencyKey)) return { allowed: false, code: "invalid_request" };
    if (input.requestedScopes.some((scope) => !this.allowedScopes.has(scope))) return { allowed: false, code: "scope_escalation" };
    const forbidden = new Set(["delegate_task", "cron_create", "memory_write", "memory_commit", "message_delivery", "privileged"]);
    if (input.requestedTools.some((tool) => forbidden.has(tool))) return { allowed: false, code: "forbidden_capability" };
    if (input.requestedTools.some((tool) => !this.allowedTools.has(tool))) return { allowed: false, code: "scope_escalation" };
    const budget = input.budget ?? { maxDepth: 1, maxDurationMs: 30_000, maxIterations: 4, maxToolCalls: 8, maxTotalTokens: 16_000 };
    if (budget.maxDepth !== 1 || !Number.isInteger(budget.maxDurationMs) || budget.maxDurationMs < 1 || budget.maxDurationMs > 600_000 || !Number.isInteger(budget.maxIterations) || budget.maxIterations < 1 || budget.maxIterations > 32 || !Number.isInteger(budget.maxToolCalls) || budget.maxToolCalls < 0 || budget.maxToolCalls > 64 || !Number.isInteger(budget.maxTotalTokens) || budget.maxTotalTokens < 1 || budget.maxTotalTokens > 128_000) return { allowed: false, code: "budget_invalid" };
    if (this.records.size >= this.maxChildren) return { allowed: false, code: "child_limit" };
    return { allowed: true, code: "allowed" };
  }

  async request(input: SubagentRequest): Promise<SubagentRecord> {
    const existingId = this.idempotency.get(input.idempotencyKey);
    if (existingId) {
      const existing = this.records.get(existingId)!;
      if (JSON.stringify(existing.request) !== JSON.stringify(cloneRequest(input))) {
        return { ...cloneRecord(existing), status: "rejected", errorCode: "idempotency_conflict" };
      }
      return cloneRecord(existing);
    }
    const decision = this.guard(input);
    const now = this.now();
    const subagentId = `subagent-${this.records.size + 1}`;
    const request = cloneRequest(input);
    const childSessionId = decision.allowed && this.options.childSessionIdFactory
      ? await this.options.childSessionIdFactory({ subagentId, request })
      : undefined;
    const record: SubagentRecord = { subagentId, request, ...(childSessionId ? { childSessionId } : {}), status: decision.allowed ? "queued" : "rejected", createdAt: now, updatedAt: now, ...(decision.allowed ? {} : { errorCode: decision.code }) };
    this.records.set(subagentId, record);
    this.idempotency.set(input.idempotencyKey, subagentId);
    if (this.options.db) {
      this.options.db.recordSubagent({ subagentId, parentRunId: input.parentRunId, parentSessionId: input.parentSessionId ?? this.options.parentSessionId ?? "parent-session", ...(childSessionId ? { childSessionId } : {}), tenantId: input.tenantId ?? this.options.tenantId ?? "tenant", depth: input.depth, status: record.status === "rejected" ? "rejected" : "queued", budget: input.budget ?? {}, requestedTools: input.requestedTools, idempotencyKey: input.idempotencyKey, createdAt: now });
      this.options.db.recordLineage({
        relation: "delegate",
        parentId: input.parentRunId,
        childId: subagentId,
        metadata: {
          status: record.status,
          ...(record.errorCode ? { errorCode: record.errorCode } : {}),
        },
      });
    }
    return cloneRecord(record);
  }

  get(subagentId: string): SubagentRecord | undefined {
    const local = this.records.get(subagentId);
    if (local) return cloneRecord(local);
    const durable = this.options.db?.getSubagent(subagentId);
    if (!durable) return undefined;
    const record: SubagentRecord = { subagentId: durable.subagentId, request: { parentRunId: durable.parentRunId, parentTurnId: durable.parentRunId, bindingId: this.options.parentBindingId ?? "durable", depth: durable.depth, task: "durable child task", requestedScopes: [], requestedTools: durable.requestedTools, idempotencyKey: durable.idempotencyKey, tenantId: durable.tenantId, parentSessionId: durable.parentSessionId }, ...(durable.childSessionId ? { childSessionId: durable.childSessionId } : {}), status: durable.status, createdAt: durable.createdAt, updatedAt: durable.updatedAt, result: durable.result as SubagentResult | undefined };
    return cloneRecord(record);
  }

  async transition(subagentId: string, status: SubagentStatus): Promise<SubagentRecord> {
    const record = this.records.get(subagentId);
    if (!record) throw new SubagentTransitionError("subagent record not found");
    if (record.status === status) return cloneRecord(record);
    const allowed = { requested: new Set<SubagentStatus>(["queued", "rejected", "aborted"]), queued: new Set<SubagentStatus>(["running", "rejected", "aborted"]), running: new Set<SubagentStatus>(["completed", "failed", "aborted"]), rejected: new Set<SubagentStatus>(), completed: new Set<SubagentStatus>(), failed: new Set<SubagentStatus>(), aborted: new Set<SubagentStatus>() } satisfies Record<SubagentStatus, ReadonlySet<SubagentStatus>>;
    if (!allowed[record.status].has(status)) throw new SubagentTransitionError(`invalid subagent transition: ${record.status} -> ${status}`);
    record.status = status;
    record.updatedAt = this.now();
    if (this.options.db) this.options.db.transitionSubagent({ subagentId, status: status === "requested" ? "queued" : status });
    return cloneRecord(record);
  }

  async execute(subagentId: string, signal?: AbortSignal): Promise<SubagentResult> {
    const record = this.records.get(subagentId);
    if (!record) return { status: "rejected", summary: "subagent not found", stopReason: "not_found", usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, evidenceRefs: [] };
    if (record.status === "rejected") return { status: "rejected", summary: record.errorCode ?? "subagent rejected", stopReason: record.errorCode ?? "rejected", usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, evidenceRefs: [] };
    if (!this.options.executor) {
      await this.transition(subagentId, "failed");
      return { status: "failed", summary: "subagent executor unavailable", stopReason: "executor_unavailable", usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, evidenceRefs: [] };
    }
    await this.transition(subagentId, "running");
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    const budget = record.request.budget ?? { maxDurationMs: 30_000 } as SubagentBudget;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    try {
      timer = setTimeout(() => { timedOut = true; controller.abort(); }, Math.min(budget.maxDurationMs ?? 30_000, 600_000));
      const result = await this.options.executor.execute({ subagentId, task: record.request.task, request: record.request, allowedTools: record.request.requestedTools.filter((tool) => !["delegate_task", "cron_create", "memory_write", "memory_commit", "message_delivery", "privileged"].includes(tool)), contextRefs: [...(record.request.requestedContextRefs ?? [])] }, controller.signal);
      if (timedOut || signal?.aborted) {
        await this.transition(subagentId, "aborted");
        return { ...result, status: "aborted", stopReason: "timeout" };
      }
      const resultStatus = result.status ?? "completed";
      record.result = { ...result, status: resultStatus, content: result.content?.slice(0, 32_000), summary: result.summary.slice(0, 4_000), evidenceRefs: result.evidenceRefs.slice(0, 64) };
      await this.transition(subagentId, resultStatus);
      if (this.options.db) this.options.db.transitionSubagent({ subagentId, status: resultStatus, result: record.result });
      return structuredClone(record.result);
    } catch (error) {
      await this.transition(subagentId, "aborted");
      return { status: "aborted", summary: "subagent execution aborted", stopReason: timedOut || signal?.aborted ? "timeout" : "executor_error", usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, evidenceRefs: [] };
    } finally {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }
}
