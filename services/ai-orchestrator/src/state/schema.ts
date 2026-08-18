import { DatabaseSync } from "node:sqlite";

export const SESSION_DB_SCHEMA_VERSION = 1;
export const DEFAULT_MAX_JSON_BYTES = 64_000;
export const DEFAULT_MAX_EVENT_BYTES = 120_000;

export type LineageRelation = "branch" | "compression" | "delegate";
export type MessageRole = "user" | "assistant" | "tool" | "system" | "summary";
export type RunStatus = "queued" | "running" | "completed" | "failed" | "aborted" | "rejected";
export type ToolInvocationStatus = "queued" | "awaiting_approval" | "running" | "completed" | "failed" | "rejected" | "aborted";
export type MemoryKind = "semantic" | "episodic" | "procedural" | "standard" | "review";
export type MemoryStatus = "active" | "superseded" | "rejected";
export type SubagentStatus = "queued" | "running" | "completed" | "failed" | "aborted" | "rejected";

export interface StateSessionIdentity {
  sessionId?: string;
  keyFingerprint: string;
  tenantId: string;
  actorId: string;
  channel: string;
  projectId?: string;
  conversationId: string;
  threadId?: string;
  workspaceId?: string;
  snapshotId?: string;
  documentRevisionId?: string;
  createdAt?: string;
}

export interface MemoryProvenance {
  source: string;
  sourceId?: string;
  provider?: string;
  model?: string;
  promptVersion?: string;
  createdBy?: string;
}

const SECRET_KEY = /(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|authorization|cookie|set-cookie)/i;
const SECRET_VALUE = /(bearer\s+|(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)\s*[:=]\s*)[^\s,;]+/gi;

export class StateSerializationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StateSerializationError";
  }
}

function sanitizeJsonValue(value: unknown, seen: WeakSet<object>, depth: number): unknown {
  if (depth > 8) return "[TRUNCATED]";
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    if (typeof value === "number" && !Number.isFinite(value)) throw new StateSerializationError("state JSON contains a non-finite number");
    return value;
  }
  if (typeof value === "string") return value.replace(SECRET_VALUE, "$1[REDACTED]").slice(0, 32_000);
  if (typeof value !== "object") throw new StateSerializationError("state JSON contains an unsupported value");
  if (seen.has(value)) throw new StateSerializationError("state JSON contains a cycle");
  seen.add(value);
  try {
    if (Array.isArray(value)) return value.slice(0, 256).map((item) => sanitizeJsonValue(item, seen, depth + 1));
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>).slice(0, 256)) {
      output[key] = SECRET_KEY.test(key) ? "[REDACTED]" : sanitizeJsonValue(child, seen, depth + 1);
    }
    return output;
  } finally {
    seen.delete(value);
  }
}

export function safeJsonEncode(value: unknown, maxBytes = DEFAULT_MAX_JSON_BYTES): string {
  if (!Number.isInteger(maxBytes) || maxBytes <= 0) throw new StateSerializationError("state JSON size bound is invalid");
  let encoded: string;
  try {
    encoded = JSON.stringify(sanitizeJsonValue(value, new WeakSet<object>(), 0));
  } catch (error) {
    if (error instanceof StateSerializationError) throw error;
    throw new StateSerializationError("state JSON could not be serialized");
  }
  if (Buffer.byteLength(encoded, "utf8") > maxBytes) throw new StateSerializationError("state JSON exceeds the configured size bound");
  return encoded;
}

export function safeJsonDecode(encoded: string): unknown {
  try {
    return JSON.parse(encoded);
  } catch {
    throw new StateSerializationError("persisted state JSON is malformed");
  }
}

export function safeStateText(value: unknown, maxChars = 32_000): string {
  if (typeof value !== "string") throw new StateSerializationError("state text must be a string");
  const text = value.replace(SECRET_VALUE, "$1[REDACTED]").slice(0, maxChars);
  if (!text.trim()) throw new StateSerializationError("state text is empty");
  return text;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  key_fingerprint TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  project_id TEXT,
  conversation_id TEXT NOT NULL,
  thread_id TEXT,
  workspace_id TEXT,
  snapshot_id TEXT,
  document_revision_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_run_id TEXT
);
CREATE INDEX IF NOT EXISTS sessions_scope_idx ON sessions(tenant_id, project_id, conversation_id, updated_at);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool', 'system', 'summary')),
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'message',
  idempotency_key TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(session_id, sequence),
  UNIQUE(session_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS messages_session_sequence_idx ON messages(session_id, sequence);
CREATE TABLE IF NOT EXISTS state_fts_source (
  record_id TEXT PRIMARY KEY,
  scope_type TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  session_id TEXT,
  project_id TEXT,
  kind TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE VIRTUAL TABLE IF NOT EXISTS state_fts USING fts5(
  record_id UNINDEXED,
  scope_type UNINDEXED,
  tenant_id UNINDEXED,
  session_id UNINDEXED,
  project_id UNINDEXED,
  kind UNINDEXED,
  content,
  created_at UNINDEXED,
  tokenize = 'unicode61'
);
CREATE TABLE IF NOT EXISTS memory_records (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  project_id TEXT,
  session_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('semantic', 'episodic', 'procedural', 'standard', 'review')),
  memory_key TEXT NOT NULL,
  value TEXT NOT NULL,
  provenance_json TEXT NOT NULL,
  evidence_refs_json TEXT NOT NULL,
  confidence REAL,
  status TEXT NOT NULL CHECK (status IN ('active', 'superseded', 'rejected')),
  supersedes_id TEXT REFERENCES memory_records(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS memory_scope_idx ON memory_records(tenant_id, project_id, session_id, status, updated_at);
CREATE TABLE IF NOT EXISTS lineage (
  id TEXT PRIMARY KEY,
  relation TEXT NOT NULL CHECK (relation IN ('branch', 'compression', 'delegate')),
  parent_id TEXT NOT NULL,
  child_id TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(relation, parent_id, child_id)
);
CREATE TABLE IF NOT EXISTS runs (
  run_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'aborted', 'rejected')),
  input_hash TEXT,
  final_json TEXT,
  started_at TEXT NOT NULL,
  finalized_at TEXT,
  UNIQUE(session_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS runs_session_idx ON runs(session_id, started_at);
CREATE TABLE IF NOT EXISTS agent_runs (
  run_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 0),
  state_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS agent_runs_status_idx ON agent_runs(status, updated_at);
CREATE TABLE IF NOT EXISTS run_events (
  run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence >= 0),
  event_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  PRIMARY KEY(run_id, sequence),
  UNIQUE(run_id, event_id)
);
CREATE INDEX IF NOT EXISTS run_events_session_idx ON run_events(session_id, run_id, sequence);
CREATE TABLE IF NOT EXISTS tool_invocations (
  invocation_id TEXT PRIMARY KEY,
  turn_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL,
  tool_call_id TEXT NOT NULL,
  name TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'awaiting_approval', 'running', 'completed', 'failed', 'rejected', 'aborted')),
  approval_id TEXT,
  result_json TEXT,
  summary TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(run_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS tool_invocations_run_idx ON tool_invocations(run_id, sequence);
CREATE TABLE IF NOT EXISTS compression_runs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  lock_key TEXT NOT NULL,
  holder_id TEXT NOT NULL,
  lease_until TEXT NOT NULL,
  source_hash TEXT,
  strategy TEXT,
  receipt_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(session_id, lock_key)
);
CREATE TABLE IF NOT EXISTS subagent_runs (
  subagent_id TEXT PRIMARY KEY,
  parent_run_id TEXT NOT NULL,
  parent_session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  child_session_id TEXT REFERENCES sessions(session_id) ON DELETE SET NULL,
  tenant_id TEXT NOT NULL,
  depth INTEGER NOT NULL CHECK (depth >= 0),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'aborted', 'rejected')),
  budget_json TEXT NOT NULL,
  requested_tools_json TEXT NOT NULL,
  result_json TEXT,
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(parent_run_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS cron_jobs (
  job_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  session_id TEXT,
  name TEXT NOT NULL,
  schedule_type TEXT NOT NULL,
  schedule_value TEXT NOT NULL,
  prompt TEXT NOT NULL,
  config_json TEXT NOT NULL,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cron_runs (
  run_id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES cron_jobs(job_id) ON DELETE CASCADE,
  occurrence_key TEXT NOT NULL,
  scheduled_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('claimed', 'completed', 'failed', 'recovered')),
  lease_owner TEXT,
  lease_until TEXT,
  idempotency_key TEXT NOT NULL,
  result_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(job_id, occurrence_key),
  UNIQUE(job_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  session_id TEXT,
  run_id TEXT,
  type TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_scope_idx ON audit_events(tenant_id, session_id, run_id, created_at);
`;

export interface MigrationOptions {
  filename?: string;
  maxJsonBytes?: number;
  busyTimeoutMs?: number;
}

export function applySessionDbMigrations(db: DatabaseSync, options: MigrationOptions = {}): void {
  const busyTimeoutMs = Math.max(0, Math.min(Math.floor(options.busyTimeoutMs ?? 5_000), 120_000));
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}`);
  if (options.filename && options.filename !== ":memory:") db.exec("PRAGMA journal_mode = WAL");
  db.exec("CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  const current = db.prepare("SELECT value FROM schema_meta WHERE key = 'version'").get() as { value?: string } | undefined;
  const version = current?.value ? Number(current.value) : 0;
  if (!Number.isInteger(version) || version > SESSION_DB_SCHEMA_VERSION) throw new StateSerializationError("session database schema version is unsupported");
  if (version === SESSION_DB_SCHEMA_VERSION) {
    // Keep the migration forward-compatible for databases created by the
    // previous Phase 6 build before the mature-run projection was added.
    db.exec("CREATE TABLE IF NOT EXISTS agent_runs (run_id TEXT PRIMARY KEY, status TEXT NOT NULL, version INTEGER NOT NULL CHECK (version >= 0), state_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
    db.exec("CREATE INDEX IF NOT EXISTS agent_runs_status_idx ON agent_runs(status, updated_at)");
    return;
  }
  db.exec("BEGIN IMMEDIATE");
  try {
    if (version < 1) {
      db.exec(SCHEMA_SQL);
      db.prepare("INSERT INTO schema_meta(key, value) VALUES ('version', ?)").run(String(SESSION_DB_SCHEMA_VERSION));
    }
    db.exec("COMMIT");
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch { /* preserve the original migration error */ }
    throw error;
  }
}

export function getSessionDbTables(db: DatabaseSync): string[] {
  return (db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'virtual table') ORDER BY name").all() as Array<{ name: string }>).map((row) => row.name);
}
