// paax/web — EventStore session-scoped (F2 #1).
//
// State konsol dibangun HANYA dari event v2 (replay-safe, anti-fake).
// Store ini menahan:
//   - log event per run (append-only, dedup event_id);
//   - task states + progress (HANYA dari task.* events — tidak ada timer);
//   - trace items (reasoning/tool/command/subagent/artifact/approval);
//   - status stack (agent/subagent aktif, retry, error);
//   - replays state (after_sequence untuk reconnect).
//
// Semua reducer murni/deterministik — di-unit-test.

import type { PaaxEventEnvelope, RedactionState } from './event-contract'
import { TASK_PLAN } from './event-contract'

export type TaskState =
  | 'pending'
  | 'queued'
  | 'running'
  | 'waiting_tool'
  | 'waiting_subagent'
  | 'waiting_approval'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface TaskUiState {
  id: string
  title: string
  state: TaskState
  progress: number
  startedAt?: string
  updatedAt?: string
  error?: string
}

export interface TraceItem {
  eventId: string
  sequence: number
  timestamp: string
  type: string
  taskId: string | null
  agentId: string | null
  workerId: string | null
  provider: string | null
  model: string | null
  summary: Record<string, unknown> | null
  payloadRef: string | null
  stage: string | null
  redactionState?: RedactionState
  /** konten reasoning (dari reasoning.delta — akumulasi). */
  reasoning?: string
}

export interface SubagentNode {
  id: string
  parentId: string | null
  taskId: string | null
  status: 'started' | 'completed' | 'failed'
  startedAt?: string
  completedAt?: string
  model: string | null
  provider: string | null
  children: SubagentNode[]
}

export interface StatusStackItem {
  id: string
  kind: 'agent' | 'subagent' | 'task' | 'retry' | 'error' | 'approval'
  label: string
  state: 'running' | 'completed' | 'failed' | 'waiting'
  taskId: string | null
  updatedAt?: string
}

export interface ApprovalItem {
  approvalId: string
  taskId: string | null
  reason: string
  impact: string
  status: 'pending' | 'approved' | 'rejected' | 'excluded'
  refs: string[]
  /** konteks tambahan dari payload (APPROVAL_UI_CONTRACT §2.1). */
  context?: string
  requestedAt?: string
  resolvedAt?: string
  /** decision final (dari approval.resolved). */
  decision?: string
  /** rationale user/agent dari approval.resolved. */
  rationale?: string
  /** resolved_by dari approval.resolved (mis. user:estimator). */
  resolvedBy?: string
  /**
   * Lineage override/recalc: referensi entity/quantity yang di-override atau
   * di-recalc oleh keputusan ini (payload_summary: override_of, recalc_of,
   * lineage, supersedes). Ditampilkan di card resolved.
   */
  overrideLineage?: string[]
}

export interface PaaxRuntimeState {
  runId: string | null
  tasks: TaskUiState[]
  completedTaskCount: number
  trace: TraceItem[]
  /** Log mentah event v2 (dedup by event_id) — dipakai rebuild worker tree
   *  dan replay. Bukan duplikasi trace: trace = item UI, rawEvents = sumber. */
  rawEvents: PaaxEventEnvelope[]
  reasoningByTask: Record<string, string>
  subagents: SubagentNode[]
  subagentByTask: Record<string, string>
  statusStack: StatusStackItem[]
  approvals: ApprovalItem[]
  connection: 'idle' | 'connected' | 'disconnected' | 'replaying' | 'failed'
  lastSequence: number
  lastEventAt?: string
  /** true bila ada frame _replay dari gateway. */
  replayed: boolean
}

export const EMPTY_RUNTIME_STATE: PaaxRuntimeState = {
  runId: null,
  tasks: TASK_PLAN.map(t => ({ id: t.id, title: t.title, state: 'pending', progress: 0 })),
  completedTaskCount: 0,
  trace: [],
  rawEvents: [],
  reasoningByTask: {},
  subagents: [],
  subagentByTask: {},
  statusStack: [],
  approvals: [],
  connection: 'idle',
  lastSequence: -1,
  replayed: false,
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}
function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

/** Kumpulkan lineage override/recalc dari payload approval.resolved. */
function collectLineage(summary: Record<string, unknown>): string[] {
  const out: string[] = []
  for (const key of ['override_of', 'recalc_of', 'lineage', 'supersedes'] as const) {
    const value = summary[key]
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string' && item.length > 0) out.push(item)
      }
    } else if (typeof value === 'string' && value.length > 0) {
      // lineage bisa berupa string CSV dari gateway.
      out.push(...value.split(',').map(s => s.trim()).filter(Boolean))
    }
  }
  return out
}

const TASK_ID_ALIASES: Record<string, string> = {
  'task:paax_source_register': 'T01',
  'paax_source_register': 'T01',
  'task:paax_render_pages': 'T02',
  'paax_render_pages': 'T02',
  'task:paax_vision_batch': 'T03',
  'paax_vision_batch': 'T03',
  'task:paax_adex_read': 'T04',
  'paax_adex_read': 'T04',
  'task:paax_repair': 'T05',
  'paax_repair': 'T05',
  'task:paax_cortex_resolve': 'T06',
  'paax_cortex_resolve': 'T06',
  'task:paax_geometry': 'T07',
  'paax_geometry': 'T07',
  'task:paax_construction': 'T08',
  'paax_construction': 'T08',
  'task:paax_measurement_plan': 'T09',
  'paax_measurement_plan': 'T09',
  'task:paax_formula_execute': 'T10',
  'paax_formula_execute': 'T10',
  'task:paax_quanta_write': 'T10',
  'paax_quanta_write': 'T10',
  'task:paax_approval_request': 'T11',
  'paax_approval_request': 'T11',
  'task:paax_nexus_build': 'T12',
  'paax_nexus_build': 'T12',
}

export function resolveCanonicalTaskId(id: string): string {
  return TASK_ID_ALIASES[id] ?? id
}

/**
 * Upsert item status stack untuk satu task (dari task.started/task.progress
 * dan lifecycle task.*). Task aktif tetap terlihat di status stack konsol
 * meskipun belum ada event agent/subagent — semua dari event nyata.
 */
function upsertStackTask(
  stack: StatusStackItem[],
  taskId: string,
  state: StatusStackItem['state'],
  at: string,
  label?: string | null,
): StatusStackItem[] {
  const id = resolveCanonicalTaskId(taskId)
  const idx = stack.findIndex(i => i.kind === 'task' && i.id === id)
  if (idx === -1) {
    const title = label ?? TASK_PLAN.find(t => t.id === id)?.title ?? id
    return [...stack, { id, kind: 'task', label: title, state, taskId: id, updatedAt: at }]
  }
  const next = [...stack]
  next[idx] = { ...next[idx]!, state, updatedAt: at }
  return next
}

function upsertTask(tasks: TaskUiState[], id: string, patch: Partial<TaskUiState>): TaskUiState[] {
  const canonicalId = resolveCanonicalTaskId(id)
  const idx = tasks.findIndex(t => t.id === canonicalId || t.id === id)
  if (idx === -1) {
    if (id === 'task:root' || id === '__root__') return tasks
    return [...tasks, { id, title: patch.title || id, state: patch.state || 'pending', progress: patch.progress || 0, ...patch }]
  }
  const next = [...tasks]
  next[idx] = { ...next[idx]!, ...patch, updatedAt: patch.updatedAt ?? next[idx]!.updatedAt }
  return next
}

function findSubagent(nodes: SubagentNode[], id: string): SubagentNode | null {
  for (const n of nodes) {
    if (n.id === id) return n
    const found = findSubagent(n.children, id)
    if (found) return found
  }
  return null
}

function updateSubagent(nodes: SubagentNode[], id: string, patch: Partial<SubagentNode>): SubagentNode[] {
  const node = findSubagent(nodes, id)
  if (!node) return nodes
  node.status = patch.status ?? node.status
  if (patch.completedAt !== undefined) node.completedAt = patch.completedAt
  if (patch.startedAt !== undefined) node.startedAt = patch.startedAt
  return [...nodes]
}

function insertSubagent(nodes: SubagentNode[], node: SubagentNode): SubagentNode[] {
  if (!node.parentId) {
    return [...nodes, node]
  }
  const parent = findSubagent(nodes, node.parentId)
  if (!parent) {
    return [...nodes, node]
  }
  parent.children.push(node)
  return [...nodes]
}

function traceItemFromEvent(event: PaaxEventEnvelope): TraceItem {
  const p = event.params
  return {
    eventId: p.event_id,
    sequence: p.sequence,
    timestamp: p.timestamp,
    type: p.type,
    taskId: p.task_id,
    agentId: p.agent_id,
    workerId: p.worker_id,
    provider: p.provider,
    model: p.model,
    summary: p.payload_summary,
    payloadRef: p.payload_ref,
    stage: p.stage,
    redactionState: p.redaction_state,
  }
}

function traceOrder(a: TraceItem, b: TraceItem): number {
  if (a.sequence !== b.sequence) return a.sequence - b.sequence
  const time = a.timestamp.localeCompare(b.timestamp)
  return time !== 0 ? time : a.eventId.localeCompare(b.eventId)
}

function appendTraceItem(state: PaaxRuntimeState, event: PaaxEventEnvelope): PaaxRuntimeState {
  if (state.trace.some(item => item.eventId === event.params.event_id)) return state
  return {
    ...state,
    // Keep the transcript in runtime order even when SSE and replay frames
    // arrive in different batches.
    trace: [...state.trace, traceItemFromEvent(event)].sort(traceOrder),
  }
}

/**
 * Reducer murni: terapkan satu event v2 ke runtime state. Semua transisi
 * berasal dari event nyata — tidak ada simulasi/timer.
 */
export function reduceEvent(state: PaaxRuntimeState, event: PaaxEventEnvelope): PaaxRuntimeState {
  const p = event.params
  const type = p.type
  const summary = p.payload_summary ?? {}

  let next: PaaxRuntimeState = {
    ...state,
    runId: state.runId ?? p.run_id,
    lastSequence: Math.max(state.lastSequence, p.sequence),
    lastEventAt: p.timestamp,
    connection: state.connection === 'failed' ? state.connection : 'connected',
    replayed: state.replayed || event._replay === true,
    rawEvents: [...state.rawEvents, event],
  }

  const taskId = p.task_id
  const baseTaskPatch = { updatedAt: p.timestamp }

  switch (type) {
    case 'run.started':
    case 'run.paused':
    case 'run.resumed':
    case 'run.stopped':
    case 'run.failed':
    case 'run.completed':
      next = { ...next }
      break

    case 'task.started':
      next = {
        ...next,
        // A retry starts a new lifecycle. Do not carry the previous failed
        // attempt's error into the live task rail.
        tasks: taskId ? upsertTask(next.tasks, taskId, { state: 'running', startedAt: p.timestamp, error: undefined, ...baseTaskPatch }) : next.tasks,
        statusStack: taskId ? upsertStackTask(next.statusStack, taskId, 'running', p.timestamp, str(summary.label)) : next.statusStack,
      }
      break

    case 'task.progress': {
      const progress = num(summary.progress) ?? num(summary.value)
      next = {
        ...next,
        tasks: taskId && progress !== undefined
          ? upsertTask(next.tasks, taskId, { state: 'running', progress: Math.min(1, Math.max(0, progress)), ...baseTaskPatch })
          : next.tasks,
        statusStack: taskId ? upsertStackTask(next.statusStack, taskId, 'running', p.timestamp, str(summary.label)) : next.statusStack,
      }
      break
    }

    case 'task.waiting_tool':
      next = {
        ...next,
        tasks: taskId ? upsertTask(next.tasks, taskId, { state: 'waiting_tool', ...baseTaskPatch }) : next.tasks,
        statusStack: taskId ? upsertStackTask(next.statusStack, taskId, 'waiting', p.timestamp, str(summary.label)) : next.statusStack,
      }
      break
    case 'task.waiting_subagent':
      next = {
        ...next,
        tasks: taskId ? upsertTask(next.tasks, taskId, { state: 'waiting_subagent', ...baseTaskPatch }) : next.tasks,
        statusStack: taskId ? upsertStackTask(next.statusStack, taskId, 'waiting', p.timestamp, str(summary.label)) : next.statusStack,
      }
      break
    case 'task.waiting_approval':
      next = {
        ...next,
        tasks: taskId ? upsertTask(next.tasks, taskId, { state: 'waiting_approval', ...baseTaskPatch }) : next.tasks,
        statusStack: taskId ? upsertStackTask(next.statusStack, taskId, 'waiting', p.timestamp, str(summary.label)) : next.statusStack,
      }
      break

    case 'task.completed':
      next = {
        ...next,
        tasks: taskId ? upsertTask(next.tasks, taskId, { state: 'completed', progress: 1, error: undefined, ...baseTaskPatch }) : next.tasks,
        statusStack: taskId ? upsertStackTask(next.statusStack, taskId, 'completed', p.timestamp, str(summary.label)) : next.statusStack,
        completedTaskCount: taskId && next.tasks.find(t => t.id === taskId)?.state !== 'completed'
          ? next.completedTaskCount + 1
          : next.completedTaskCount,
      }
      break

    case 'task.failed':
      next = {
        ...next,
        tasks: taskId
          ? upsertTask(next.tasks, taskId, { state: 'failed', error: str(summary.error) ?? undefined, ...baseTaskPatch })
          : next.tasks,
        statusStack: taskId ? upsertStackTask(next.statusStack, taskId, 'failed', p.timestamp, str(summary.label)) : next.statusStack,
      }
      break

    case 'agent.started':
      next = {
        ...next,
        statusStack: [
          ...next.statusStack,
          {
            id: p.agent_id ?? `agent:${p.sequence}`,
            kind: 'agent',
            label: str(summary.label) ?? p.agent_id ?? 'agent',
            state: 'running',
            taskId,
            updatedAt: p.timestamp,
          },
        ],
      }
      break

    case 'agent.completed':
      next = {
        ...next,
        statusStack: updateStackState(next.statusStack, p.agent_id ?? '', 'completed', p.timestamp),
      }
      break

    case 'subagent.started': {
      const subId = p.agent_id ?? p.session_id ?? `subagent:${p.sequence}`
      const node: SubagentNode = {
        id: subId,
        parentId: str(summary.parent_agent_id) ?? p.parent_task_id,
        taskId,
        status: 'started',
        startedAt: p.timestamp,
        model: p.model,
        provider: p.provider,
        children: [],
      }
      next = {
        ...next,
        subagents: insertSubagent(next.subagents, node),
        subagentByTask: { ...next.subagentByTask, [taskId ?? '__root__']: subId },
        statusStack: [
          ...next.statusStack,
          { id: subId, kind: 'subagent', label: str(summary.label) ?? subId, state: 'running', taskId, updatedAt: p.timestamp },
        ],
      }
      break
    }

    case 'subagent.completed':
      next = {
        ...next,
        subagents: updateSubagent(next.subagents, p.agent_id ?? p.session_id ?? '', { status: 'completed', completedAt: p.timestamp }),
        statusStack: updateStackState(next.statusStack, p.agent_id ?? p.session_id ?? '', 'completed', p.timestamp),
      }
      break

    case 'reasoning.delta': {
      const delta = str(summary.delta) ?? str(summary.text)
      const key = taskId ?? p.agent_id ?? '__root__'
      next = {
        ...next,
        reasoningByTask: delta
          ? { ...next.reasoningByTask, [key]: (next.reasoningByTask[key] ?? '') + delta }
          : next.reasoningByTask,
      }
      break
    }

    case 'reasoning.available': {
      const key = taskId ?? p.agent_id ?? '__root__'
      const content = str(summary.content) ?? str(summary.reasoning)
      next = {
        ...next,
        reasoningByTask: content ? { ...next.reasoningByTask, [key]: content } : next.reasoningByTask,
      }
      break
    }

    case 'tool.started':
    case 'tool.progress':
    case 'tool.completed':
    case 'tool.failed':
    case 'command.started':
    case 'command.output':
    case 'command.completed':
    case 'artifact.created':
    case 'usage.recorded':
    case 'receipt.created':
    case 'retry.scheduled':
    case 'error.classified':
      next = {
        ...next,
        trace: [...next.trace, {
          eventId: p.event_id,
          sequence: p.sequence,
          timestamp: p.timestamp,
          type,
          taskId,
          agentId: p.agent_id,
          workerId: p.worker_id,
          provider: p.provider,
          model: p.model,
          summary,
          payloadRef: p.payload_ref,
          stage: p.stage,
          redactionState: p.redaction_state,
        }],
      }
      if (type === 'retry.scheduled') {
        next = {
          ...next,
          statusStack: [
            ...next.statusStack,
            {
              id: `retry:${p.sequence}`,
              kind: 'retry',
              label: `retry ${str(summary.attempt) ?? ''} ${str(summary.reason) ?? ''}`.trim(),
              state: 'running',
              taskId,
              updatedAt: p.timestamp,
            },
          ],
        }
      }
      if (type === 'error.classified') {
        next = {
          ...next,
          statusStack: [
            ...next.statusStack,
            {
              id: `error:${p.sequence}`,
              kind: 'error',
              label: str(summary.error) ?? str(summary.class) ?? 'error',
              state: 'failed',
              taskId,
              updatedAt: p.timestamp,
            },
          ],
        }
      }
      break

    case 'approval.requested': {
      const approvalId = str(summary.approval_id) ?? `approval:${p.sequence}`
      const refs = Array.isArray(summary.refs) ? summary.refs.map(String) : []
      next = {
        ...next,
        approvals: [
          ...next.approvals,
          {
            approvalId,
            taskId,
            reason: str(summary.reason) ?? 'approval required',
            impact: str(summary.impact) ?? 'medium',
            status: 'pending',
            refs,
            context: str(summary.context) ?? undefined,
            requestedAt: p.timestamp,
          },
        ],
        statusStack: [
          ...next.statusStack,
          { id: approvalId, kind: 'approval', label: str(summary.reason) ?? 'approval', state: 'waiting', taskId, updatedAt: p.timestamp },
        ],
      }
      break
    }

    case 'approval.resolved': {
      const approvalId = str(summary.approval_id) ?? ''
      const decision = str(summary.decision) ?? str(summary.decision_state)
      const status: ApprovalItem['status'] =
        decision === 'approved' ? 'approved' : decision === 'rejected' ? 'rejected' : decision === 'excluded' ? 'excluded' : 'pending'
      // Lineage override/recalc (APPROVAL_UI_CONTRACT §2.2 + task spec MP3-P2):
      // payload_summary boleh membawa override_of / recalc_of / lineage /
      // supersedes — daftar referensi entity/quantity terdampak keputusan.
      const lineage = collectLineage(summary)
      next = {
        ...next,
        approvals: next.approvals.map(a =>
          a.approvalId === approvalId
            ? {
                ...a,
                status,
                decision: decision ?? undefined,
                rationale: str(summary.rationale) ?? str(summary.reason) ?? undefined,
                resolvedBy: str(summary.resolved_by) ?? undefined,
                resolvedAt: str(summary.resolved_at) ?? p.timestamp,
                overrideLineage: lineage.length > 0 ? lineage : a.overrideLineage,
              }
            : a,
        ),
        statusStack: updateStackState(next.statusStack, approvalId, status === 'approved' ? 'completed' : 'failed', p.timestamp),
      }
      break
    }

    default:
      // Domain events (spectra.*, adex.*, cortex.*, quanta.*, nexus.*) —
      // tetap masuk trace untuk timeline.
      next = {
        ...next,
        trace: [...next.trace, {
          eventId: p.event_id,
          sequence: p.sequence,
          timestamp: p.timestamp,
          type,
          taskId,
          agentId: p.agent_id,
          workerId: p.worker_id,
          provider: p.provider,
          model: p.model,
          summary,
          payloadRef: p.payload_ref,
          stage: p.stage,
          redactionState: p.redaction_state,
        }],
      }
      break
  }

  // Lifecycle, reasoning and approval events are transcript material too.
  // The specialized branches above update their projections; this final
  // append keeps the raw event visible in the sequence timeline without
  // inventing a second event.
  return appendTraceItem(next, event)
}

function updateStackState(
  stack: StatusStackItem[],
  id: string,
  state: StatusStackItem['state'],
  at?: string,
): StatusStackItem[] {
  if (!id) return stack
  return stack.map(item => (item.id === id ? { ...item, state, updatedAt: at ?? item.updatedAt } : item))
}

/**
 * Rebuild penuh runtime state dari daftar event (dipakai replay/reconnect).
 * Deterministik; urutan = global sequence/timestamp (runtime transcript order).
 */
export function buildStateFromEvents(events: readonly PaaxEventEnvelope[]): PaaxRuntimeState {
  const sorted = [...events].sort((a, b) => {
    if (a.params.sequence !== b.params.sequence) return a.params.sequence - b.params.sequence
    const timestamp = a.params.timestamp.localeCompare(b.params.timestamp)
    return timestamp !== 0 ? timestamp : a.params.event_id.localeCompare(b.params.event_id)
  })
  let state: PaaxRuntimeState = { ...EMPTY_RUNTIME_STATE }
  for (const e of sorted) {
    state = reduceEvent(state, e)
  }
  return state
}

const LIVE_TASK_TYPES = new Set([
  'task.started',
  'task.progress',
  'task.waiting_tool',
  'task.waiting_subagent',
  'task.waiting_approval',
])

const TERMINAL_TASK_TYPES = new Set(['task.completed', 'task.failed', 'task.cancelled'])
const TERMINAL_RUN_TYPES = new Set(['run.completed', 'run.failed', 'run.stopped'])

/** Current task derived from the latest task lifecycle event, never a timer. */
export function getLiveTaskId(state: PaaxRuntimeState): string | null {
  const latest = new Map<string, { sequence: number; timestamp: string; live: boolean }>()
  const events = [...state.rawEvents].sort((a, b) => a.params.sequence - b.params.sequence)
  for (const event of events) {
    const id = event.params.task_id
    if (!id) continue
    const canonicalId = resolveCanonicalTaskId(id)
    if (LIVE_TASK_TYPES.has(event.params.type)) {
      latest.set(canonicalId, { sequence: event.params.sequence, timestamp: event.params.timestamp, live: true })
    } else if (TERMINAL_TASK_TYPES.has(event.params.type)) {
      latest.set(canonicalId, { sequence: event.params.sequence, timestamp: event.params.timestamp, live: false })
    }
  }

  const candidates = state.tasks
    .filter(task => ['queued', 'running', 'waiting_tool', 'waiting_subagent', 'waiting_approval', 'paused'].includes(task.state))
    .map(task => ({ task, event: latest.get(resolveCanonicalTaskId(task.id)) }))
    .filter((entry): entry is { task: TaskUiState; event: { sequence: number; timestamp: string; live: boolean } } => Boolean(entry.event?.live))
    .sort((a, b) => {
      if (a.event.sequence !== b.event.sequence) return a.event.sequence - b.event.sequence
      return a.event.timestamp.localeCompare(b.event.timestamp)
    })
  return candidates.at(-1)?.task.id ?? null
}

export function isRunTerminal(state: PaaxRuntimeState): boolean {
  const latestRunEvent = [...state.rawEvents]
    .filter(event => event.params.type.startsWith('run.'))
    .sort((a, b) => a.params.sequence - b.params.sequence)
    .at(-1)
  return latestRunEvent ? TERMINAL_RUN_TYPES.has(latestRunEvent.params.type) : false
}

function cloneEmptyState(runId: string | null = null): PaaxRuntimeState {
  return {
    ...EMPTY_RUNTIME_STATE,
    runId,
    tasks: EMPTY_RUNTIME_STATE.tasks.map(task => ({ ...task })),
    trace: [],
    rawEvents: [],
    reasoningByTask: {},
    subagents: [],
    subagentByTask: {},
    statusStack: [],
    approvals: [],
  }
}

/** Class wrapper dengan subscribe (dipakai komponen React via useSyncExternalStore). */
export class PaaxRuntimeStore {
  private state: PaaxRuntimeState = cloneEmptyState()
  private listeners = new Set<() => void>()

  getState(): PaaxRuntimeState {
    return this.state
  }

  ingest(event: PaaxEventEnvelope): void {
    const prev = this.state
    if (prev.runId && resolveRunId(prev.runId) !== resolveRunId(event.params.run_id)) {
      return
    }
    if (prev.rawEvents.some(e => e.params.event_id === event.params.event_id)) {
      return // dedup by event_id (rawEvents = log mentah lengkap)
    }
    this.state = reduceEvent(prev, event)
    this.notify()
  }

  rebuild(events: readonly PaaxEventEnvelope[]): void {
    this.state = buildStateFromEvents(events)
    this.notify()
  }

  resetForRun(runId: string | null): void {
    this.state = cloneEmptyState(runId)
    this.notify()
  }

  setConnection(connection: PaaxRuntimeState['connection']): void {
    this.state = { ...this.state, connection }
    this.notify()
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify(): void {
    for (const listener of [...this.listeners]) {
      listener()
    }
  }
}

/** Accept both gateway `paax:run:<id>` and legacy raw `<id>` identifiers. */
export function resolveRunId(runId: string): string {
  return runId.replace(/^paax:run:/, '')
}
