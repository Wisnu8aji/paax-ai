// paax/web — Event Protocol v2 contract (KONSUMEN — F2).
//
// KONTRAK 7 MP §7.7 (Event Protocol v2). File ini adalah kontrak TIPE sisi web
// untuk KONSUMSI event dari agent_runtime F1 (store/event_store.py +
// gateway/relay.py). JANGAN diubah — kontrak v2 dibekukan APOLLO; F2 hanya
// membaca. Berbeda dengan konsol R1 (v1: actor{kind,id,model,...}) — v2
// membawa agent_id/worker_id/session_id/provider/model sebagai field params
// langsung, event_id `paax:evt:<runid>:<seq>:<uuid8>`, payload_ref string path.
//
// Validator deterministik (bukan LLM). Dipakai ws-client, scan.ts, dan test.

export const EVENT_PROTOCOL_VERSION = '2.0'

export type RedactionState = 'clean' | 'partial' | 'blocked'
export type PersistenceStatus = 'durable' | 'in_memory'

export interface PaaxEventParams {
  event_id: string
  run_id: string
  task_id: string | null
  parent_task_id: string | null
  agent_id: string | null
  session_id: string | null
  worker_id: string | null
  provider: string | null
  model: string | null
  sequence: number
  timestamp: string
  type: string
  stage: string | null
  payload_summary: Record<string, unknown> | null
  payload_ref: string | null
  redaction_state: RedactionState
  persistence_status: PersistenceStatus
}

export interface PaaxEventEnvelope {
  jsonrpc: '2.0'
  method: 'paax.event'
  params: PaaxEventParams
  /** Marker replay dari gateway (relay.replay menambah `_replay: true`). */
  _replay?: boolean
}

export interface PaaxCommandEnvelope {
  jsonrpc: '2.0'
  method: 'paax.command'
  params: {
    command: 'stop' | 'pause' | 'resume' | 'approve' | 'replay' | 'clarify.respond'
    run_id: string
    task_id?: string | null
    payload?: Record<string, unknown>
  }
}

// ── Event types v2 (MP §7.7) ────────────────────────────────────────────────

export const RUNTIME_EVENT_TYPES = [
  'run.started', 'task.started', 'task.progress', 'task.completed', 'task.failed',
  'agent.started', 'agent.completed', 'subagent.started', 'subagent.completed',
  'reasoning.delta', 'reasoning.available', 'tool.started', 'tool.progress',
  'tool.completed', 'tool.failed', 'command.started', 'command.output',
  'command.completed', 'artifact.created',
] as const

export const DOMAIN_EVENT_TYPES = [
  'spectra.classified', 'adex.created', 'issue.detected', 'repair.requested',
  'repair.completed', 'cortex.entity_created', 'cortex.relation_created',
  'measurement.requested', 'formula.requested', 'formula.completed',
  'quanta.row_created', 'approval.requested', 'approval.resolved',
  'nexus.build_started', 'nexus.build_completed', 'run.completed',
] as const

export const ATHENA_EVENT_TYPES = [
  'run.paused', 'run.resumed', 'run.stopped', 'run.failed',
  'task.waiting_tool', 'task.waiting_subagent', 'task.waiting_approval',
  'usage.recorded', 'receipt.created', 'replay.started', 'replay.batch',
  'error.classified', 'retry.scheduled',
] as const

export const ALL_EVENT_TYPES: readonly string[] = [
  ...RUNTIME_EVENT_TYPES, ...DOMAIN_EVENT_TYPES, ...ATHENA_EVENT_TYPES,
]

const EVENT_TYPE_SET = new Set<string>(ALL_EVENT_TYPES)
const REDACTION_SET = new Set<string>(['clean', 'partial', 'blocked'])
const PERSISTENCE_SET = new Set<string>(['durable', 'in_memory'])

// ── Task Plan v1 (KONTRAK 6 MP §7.6) — 12 task system-owned ─────────────────

export const TASK_PLAN: ReadonlyArray<{ id: string; title: string }> = [
  { id: 'T01', title: 'Source Intake & Lock' },
  { id: 'T02', title: 'Render Pages & Build Sheet Inventory' },
  { id: 'T03', title: 'Classify Sheets & Build SPECTRA' },
  { id: 'T04', title: 'Extract Classified Sheets to ADEX' },
  { id: 'T05', title: 'Examine & Repair Ambiguous Evidence' },
  { id: 'T06', title: 'Resolve Cross-Sheet Meaning & Build CORTEX' },
  { id: 'T07', title: 'Reconstruct Geometry & Topology' },
  { id: 'T08', title: 'Classify Construction Elements & Work Items' },
  { id: 'T09', title: 'Plan Measurements' },
  { id: 'T10', title: 'Calculate & Compose QUANTA' },
  { id: 'T11', title: 'Verify, Audit & User Approval' },
  { id: 'T12', title: 'Publish, Build NEXUS & Export' },
]

export const TASK_STATES = [
  'pending', 'queued', 'running', 'waiting_tool', 'waiting_subagent',
  'waiting_approval', 'paused', 'completed', 'failed', 'cancelled',
] as const

export type TaskState = (typeof TASK_STATES)[number]

// ── Validasi ────────────────────────────────────────────────────────────────

export interface ValidationIssue {
  code:
    | 'MISSING_FIELD'
    | 'BAD_JSONRPC'
    | 'BAD_METHOD'
    | 'INVALID_EVENT_ID'
    | 'INVALID_SEQUENCE'
    | 'INVALID_TIMESTAMP'
    | 'UNKNOWN_EVENT_TYPE'
    | 'INVALID_REDACTION'
    | 'INVALID_PERSISTENCE'
  path: string
}

export interface EventValidationResult {
  valid: boolean
  issues: ValidationIssue[]
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.length > 0

function isValidEventId(id: string): boolean {
  // v2: paax:evt:<runid>:<seq>:<uuid8>
  return /^paax:evt:.+:\d+:[0-9a-fA-F]{8}$/.test(id)
}

function isValidRunId(id: string): boolean {
  // v2: paax:run:<runid>
  return /^paax:run:.+$/.test(id)
}

export function validatePaaxEvent(raw: unknown): EventValidationResult {
  const issues: ValidationIssue[] = []

  if (!isObject(raw)) {
    return { valid: false, issues: [{ code: 'MISSING_FIELD', path: '$' }] }
  }
  if (raw.jsonrpc !== '2.0') {
    issues.push({ code: 'BAD_JSONRPC', path: 'jsonrpc' })
  }
  if (raw.method !== 'paax.event') {
    issues.push({ code: 'BAD_METHOD', path: 'method' })
  }

  const p = raw.params
  if (!isObject(p)) {
    issues.push({ code: 'MISSING_FIELD', path: 'params' })
    return { valid: issues.length === 0, issues }
  }

  for (const field of ['event_id', 'run_id', 'timestamp', 'type'] as const) {
    if (!isNonEmptyString(p[field])) {
      issues.push({ code: 'MISSING_FIELD', path: `params.${field}` })
    }
  }

  if (isNonEmptyString(p.event_id) && !isValidEventId(p.event_id)) {
    issues.push({ code: 'INVALID_EVENT_ID', path: 'params.event_id' })
  }
  if (isNonEmptyString(p.run_id) && !isValidRunId(p.run_id)) {
    // run_id non-konvensional tetap bisa diterima (replay gateway memakai apa
    // adanya) — hanya peringatan ringan: INVALID_EVENT_ID dipakai untuk
    // event_id; run_id cukup harus non-empty.
  }
  if (typeof p.sequence !== 'number' || !Number.isInteger(p.sequence) || p.sequence < 0) {
    issues.push({ code: 'INVALID_SEQUENCE', path: 'params.sequence' })
  }
  if (!isNonEmptyString(p.timestamp) || Number.isNaN(new Date(p.timestamp as string).getTime())) {
    issues.push({ code: 'INVALID_TIMESTAMP', path: 'params.timestamp' })
  }
  if (isNonEmptyString(p.type) && !EVENT_TYPE_SET.has(p.type)) {
    issues.push({ code: 'UNKNOWN_EVENT_TYPE', path: 'params.type' })
  }
  if (typeof p.redaction_state === 'string' && !REDACTION_SET.has(p.redaction_state)) {
    issues.push({ code: 'INVALID_REDACTION', path: 'params.redaction_state' })
  }
  if (typeof p.persistence_status === 'string' && !PERSISTENCE_SET.has(p.persistence_status)) {
    issues.push({ code: 'INVALID_PERSISTENCE', path: 'params.persistence_status' })
  }

  return { valid: issues.length === 0, issues }
}

/** Helper: bentuk envelope valid v2 (dipakai fixture demo berlabel TEST). */
export function makeEventEnvelope(params: {
  event_id: string
  run_id: string
  task_id?: string | null
  parent_task_id?: string | null
  agent_id?: string | null
  session_id?: string | null
  worker_id?: string | null
  provider?: string | null
  model?: string | null
  sequence: number
  timestamp: string
  type: string
  stage?: string | null
  payload_summary?: Record<string, unknown> | null
  payload_ref?: string | null
  redaction_state?: RedactionState
  persistence_status?: PersistenceStatus
}): PaaxEventEnvelope {
  return {
    jsonrpc: '2.0',
    method: 'paax.event',
    params: {
      event_id: params.event_id,
      run_id: params.run_id,
      task_id: params.task_id ?? null,
      parent_task_id: params.parent_task_id ?? null,
      agent_id: params.agent_id ?? null,
      session_id: params.session_id ?? null,
      worker_id: params.worker_id ?? null,
      provider: params.provider ?? null,
      model: params.model ?? null,
      sequence: params.sequence,
      timestamp: params.timestamp,
      type: params.type,
      stage: params.stage ?? null,
      payload_summary: params.payload_summary ?? null,
      payload_ref: params.payload_ref ?? null,
      redaction_state: params.redaction_state ?? 'clean',
      persistence_status: params.persistence_status ?? 'durable',
    },
  }
}

/** Build frame command client→server (paax.command). */
export function makeCommandEnvelope(params: {
  command: 'stop' | 'pause' | 'resume' | 'approve' | 'replay' | 'clarify.respond'
  run_id: string
  task_id?: string | null
  payload?: Record<string, unknown>
}): PaaxCommandEnvelope {
  return {
    jsonrpc: '2.0',
    method: 'paax.command',
    params: {
      command: params.command,
      run_id: params.run_id,
      task_id: params.task_id ?? null,
      payload: params.payload,
    },
  }
}
