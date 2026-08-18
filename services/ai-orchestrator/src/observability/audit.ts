import type { SessionDB, AuditEventRecord } from "../state/session-db";
import { redactValue } from "../security/redaction";

export interface AuditRecordInput {
  id?: string;
  tenantId?: string;
  sessionId?: string;
  runId?: string;
  type: string;
  metadata?: unknown;
  createdAt?: string;
}

export interface SanitizedAuditSinkOptions {
  db: SessionDB;
  exporter?: (record: AuditEventRecord) => void | Promise<void>;
  maxMetadataBytes?: number;
  failClosed?: boolean;
}

function sanitizeAudit(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[TRUNCATED]";
  if (Array.isArray(value)) return value.slice(0, 128).map((item) => sanitizeAudit(item, depth + 1));
  if (!value || typeof value !== "object") return redactValue(value);
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>).slice(0, 128)) {
    if (/(?:^|_)(?:prompt|content|reasoning|raw)(?:_|$)/i.test(key)) continue;
    result[key] = sanitizeAudit(child, depth + 1);
  }
  return redactValue(result);
}

function boundedMetadata(value: unknown, maxBytes: number): Record<string, unknown> {
  const sanitized = sanitizeAudit(value ?? {});
  const record = sanitized && typeof sanitized === "object" && !Array.isArray(sanitized) ? sanitized as Record<string, unknown> : { value: sanitized };
  if (Buffer.byteLength(JSON.stringify(record), "utf8") <= maxBytes) return record;
  return { truncated: true, keys: Object.keys(record).slice(0, 64) };
}

/** SessionDB-backed audit boundary; exporters see only sanitized bounded records. */
export class SanitizedAuditSink {
  private readonly maxMetadataBytes: number;

  constructor(private readonly options: SanitizedAuditSinkOptions) {
    this.maxMetadataBytes = Math.max(1_024, Math.min(Math.floor(options.maxMetadataBytes ?? 32_000), 128_000));
  }

  async record(input: AuditRecordInput): Promise<void> {
    const metadata = boundedMetadata(input.metadata, this.maxMetadataBytes);
    let persisted: AuditEventRecord | undefined;
    try {
      this.options.db.recordAudit({ ...input, metadata });
      const records = this.options.db.listAudit({ tenantId: input.tenantId, sessionId: input.sessionId, runId: input.runId });
      persisted = records.at(-1);
    } catch {
      if (this.options.failClosed) throw new Error("audit persistence failed");
      return;
    }
    if (persisted && this.options.exporter) {
      try { await this.options.exporter(persisted); } catch { /* exporter failure cannot change canonical semantics */ }
    }
  }

  /** Records are persisted/exported synchronously per call; flush is an explicit shutdown seam. */
  async flush(): Promise<void> {
    return Promise.resolve();
  }
}
