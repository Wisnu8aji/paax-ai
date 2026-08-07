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

import type { PaaxEventEnvelope } from './event-contract'
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
  kind: 'agent' | 'subagent' | 'retry' | 'error' | 'approval'
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
  requestedAt?: string
  resolvedAt?: string
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

function upsertTask(tasks: TaskUiState[], id: string, patch: Partial<TaskUiState>): TaskUiState[] {
  const idx = tasks.findIndex(t => t.id === id)
  if (idx === -1) {
    return tasks
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
        tasks: taskId ? upsertTask(next.tasks, taskId, { state: 'running', startedAt: p.timestamp, ...baseTaskPatch }) : next.tasks,
      }
      break

    case 'task.progress': {
      const progress = num(summary.progress) ?? num(summary.value)
      next = {
        ...next,
        tasks: taskId && progress !== undefined
          ? upsertTask(next.tasks, taskId, { state: 'running', progress: Math.min(1, Math.max(0, progress)), ...baseTaskPatch })
          : next.tasks,
      }
      break
    }

    case 'task.waiting_tool':
      next = { ...next, tasks: taskId ? upsertTask(next.tasks, taskId, { state: 'waiting_tool', ...baseTaskPatch }) : next.tasks }
      break
    case 'task.waiting_subagent':
      next = { ...next, tasks: taskId ? upsertTask(next.tasks, taskId, { state: 'waiting_subagent', ...baseTaskPatch }) : next.tasks }
      break
    case 'task.waiting_approval':
      next = { ...next, tasks: taskId ? upsertTask(next.tasks, taskId, { state: 'waiting_approval', ...baseTaskPatch }) : next.tasks }
      break

    case 'task.completed':
      next = {
        ...next,
        tasks: taskId ? upsertTask(next.tasks, taskId, { state: 'completed', progress: 1, ...baseTaskPatch }) : next.tasks,
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
      next = {
        ...next,
        approvals: next.approvals.map(a =>
          a.approvalId === approvalId
            ? { ...a, status, resolvedAt: p.timestamp }
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
        }],
      }
      break
  }

  return next
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
 * Deterministik; urutan = sequence asc per task (fix ordering v1).
 */
export function buildStateFromEvents(events: readonly PaaxEventEnvelope[]): PaaxRuntimeState {
  const sorted = [...events].sort((a, b) => {
    const ta = a.params.task_id ?? ''
    const tb = b.params.task_id ?? ''
    if (ta !== tb) return ta < tb ? -1 : 1
    return a.params.sequence - b.params.sequence
  })
  let state: PaaxRuntimeState = { ...EMPTY_RUNTIME_STATE }
  for (const e of sorted) {
    state = reduceEvent(state, e)
  }
  return state
}

/** Class wrapper dengan subscribe (dipakai komponen React via useSyncExternalStore). */
export class PaaxRuntimeStore {
  private state: PaaxRuntimeState = { ...EMPTY_RUNTIME_STATE }
  private listeners = new Set<() => void>()

  getState(): PaaxRuntimeState {
    return this.state
  }

  ingest(event: PaaxEventEnvelope): void {
    const prev = this.state
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
