import { createHash } from "node:crypto";
import type {
  GatewayChannel,
  GatewaySessionSource,
} from "@paax/schemas";
import type { SessionDB as DurableSessionDB } from "../state/session-db";

const MAX_FIELD_LENGTH = 256;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export interface SessionSource extends GatewaySessionSource {
  tenantId: string;
  actorId: string;
}

export interface SessionRecord {
  sessionId: string;
  keyFingerprint: string;
  source: SessionSource;
  createdAt: string;
  updatedAt: string;
  lastRunId?: string;
}

export interface SessionStore {
  resolve(source: SessionSource): Promise<SessionRecord>;
  get(sessionId: string): Promise<SessionRecord | null>;
  attachRun(sessionId: string, runId: string): Promise<SessionRecord>;
  assertBinding(sessionId: string, source: SessionSource): Promise<SessionRecord>;
}

export class SessionBindingError extends Error {
  readonly status: 400 | 403 | 404 | 409;
  readonly code: string;

  constructor(message: string, status: 400 | 403 | 404 | 409 = 409, code = "session_binding_mismatch") {
    super(message);
    this.name = "SessionBindingError";
    this.status = status;
    this.code = code;
  }
}

function normalizeField(value: unknown, field: string, required: boolean): string | undefined {
  if (value === undefined || value === null || value === "") {
    if (required) throw new SessionBindingError(`missing session field: ${field}`, 400, "invalid_session_source");
    return undefined;
  }
  if (typeof value !== "string") throw new SessionBindingError(`invalid session field: ${field}`, 400, "invalid_session_source");
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_FIELD_LENGTH || CONTROL_CHARS.test(normalized)) {
    throw new SessionBindingError(`invalid session field: ${field}`, 400, "invalid_session_source");
  }
  return normalized;
}

export function normalizeSessionSource(source: SessionSource): SessionSource {
  const channel = normalizeField(source.channel, "channel", true) as GatewayChannel;
  if (channel !== "command_room" && channel !== "agent_runs") {
    throw new SessionBindingError("unsupported session channel", 400, "invalid_session_source");
  }
  const normalized: SessionSource = {
    channel,
    tenantId: normalizeField(source.tenantId, "tenantId", true)!,
    actorId: normalizeField(source.actorId, "actorId", true)!,
    conversationId: normalizeField(source.conversationId, "conversationId", true)!,
  };
  for (const field of ["projectId", "threadId", "workspaceId", "snapshotId", "documentRevisionId"] as const) {
    const value = normalizeField(source[field], field, false);
    if (value !== undefined) normalized[field] = value;
  }
  return Object.freeze(normalized);
}

export function canonicalSessionKey(source: SessionSource): string {
  const normalized = normalizeSessionSource(source);
  const fields = [
    normalized.channel,
    normalized.tenantId,
    normalized.actorId,
    normalized.projectId ?? "",
    normalized.conversationId,
    normalized.threadId ?? "",
    normalized.workspaceId ?? "",
  ];
  return ["session-key-v1", ...fields.map((field) => `${field.length}:${field}`)].join("|");
}

export function sessionKeyFingerprint(source: SessionSource): string {
  return createHash("sha256").update(canonicalSessionKey(source), "utf8").digest("hex");
}

function immutableRecord(record: SessionRecord): SessionRecord {
  return Object.freeze({
    ...record,
    source: Object.freeze({ ...record.source }),
  });
}

/**
 * Phase 2 deliberately keeps routing state in-process. A durable SessionDB
 * adapter is a later migration seam and is not implied by this implementation.
 */
export class InMemorySessionStore implements SessionStore {
  private readonly byFingerprint = new Map<string, SessionRecord>();
  private readonly byId = new Map<string, SessionRecord>();

  async resolve(source: SessionSource): Promise<SessionRecord> {
    const normalized = normalizeSessionSource(source);
    const fingerprint = sessionKeyFingerprint(normalized);
    const existing = this.byFingerprint.get(fingerprint);
    if (existing) return existing;

    const now = new Date().toISOString();
    const record = immutableRecord({
      sessionId: `session-${fingerprint}`,
      keyFingerprint: fingerprint,
      source: normalized,
      createdAt: now,
      updatedAt: now,
    });
    this.byFingerprint.set(fingerprint, record);
    this.byId.set(record.sessionId, record);
    return record;
  }

  async get(sessionId: string): Promise<SessionRecord | null> {
    return this.byId.get(sessionId) ?? null;
  }

  async attachRun(sessionId: string, runId: string): Promise<SessionRecord> {
    const normalizedRunId = normalizeField(runId, "runId", true)!;
    const current = await this.get(sessionId);
    if (!current) throw new SessionBindingError("session not found", 404, "session_not_found");
    const updated = immutableRecord({ ...current, lastRunId: normalizedRunId, updatedAt: new Date().toISOString() });
    this.byFingerprint.set(updated.keyFingerprint, updated);
    this.byId.set(updated.sessionId, updated);
    return updated;
  }

  async assertBinding(sessionId: string, source: SessionSource): Promise<SessionRecord> {
    const current = await this.get(sessionId);
    if (!current) throw new SessionBindingError("session not found", 404, "session_not_found");
    const fingerprint = sessionKeyFingerprint(source);
    if (fingerprint !== current.keyFingerprint) {
      throw new SessionBindingError("session binding mismatch", 409);
    }
    return current;
  }
}

function durableToGateway(record: import("../state/session-db").SessionRecord): SessionRecord {
  const source: SessionSource = normalizeSessionSource({
    channel: record.channel as GatewayChannel,
    tenantId: record.tenantId,
    actorId: record.actorId,
    ...(record.projectId ? { projectId: record.projectId } : {}),
    conversationId: record.conversationId,
    ...(record.threadId ? { threadId: record.threadId } : {}),
    ...(record.workspaceId ? { workspaceId: record.workspaceId } : {}),
    ...(record.snapshotId ? { snapshotId: record.snapshotId } : {}),
    ...(record.documentRevisionId ? { documentRevisionId: record.documentRevisionId } : {}),
  });
  return immutableRecord({ sessionId: record.sessionId, keyFingerprint: record.keyFingerprint, source, createdAt: record.createdAt, updatedAt: record.updatedAt, ...(record.lastRunId ? { lastRunId: record.lastRunId } : {}) });
}

/** Production session store backed by the single composition-root SessionDB. */
export class SqliteSessionStore implements SessionStore {
  constructor(private readonly db: DurableSessionDB) {}

  async resolve(source: SessionSource): Promise<SessionRecord> {
    const normalized = normalizeSessionSource(source);
    const record = this.db.createOrGetSession({
      sessionId: `session-${sessionKeyFingerprint(normalized)}`,
      keyFingerprint: sessionKeyFingerprint(normalized),
      tenantId: normalized.tenantId,
      actorId: normalized.actorId,
      channel: normalized.channel,
      projectId: normalized.projectId,
      conversationId: normalized.conversationId,
      threadId: normalized.threadId,
      workspaceId: normalized.workspaceId,
      snapshotId: normalized.snapshotId,
      documentRevisionId: normalized.documentRevisionId,
    });
    return durableToGateway(record);
  }

  async get(sessionId: string): Promise<SessionRecord | null> {
    const record = this.db.getSession(sessionId);
    return record ? durableToGateway(record) : null;
  }

  async attachRun(sessionId: string, runId: string): Promise<SessionRecord> {
    try { return durableToGateway(this.db.attachRun(sessionId, runId)); }
    catch (error) {
      if (error instanceof Error && /not found/i.test(error.message)) throw new SessionBindingError("session not found", 404, "session_not_found");
      throw error;
    }
  }

  async assertBinding(sessionId: string, source: SessionSource): Promise<SessionRecord> {
    const current = await this.get(sessionId);
    if (!current) throw new SessionBindingError("session not found", 404, "session_not_found");
    if (current.keyFingerprint !== sessionKeyFingerprint(source)) throw new SessionBindingError("session binding mismatch", 409);
    return current;
  }
}
