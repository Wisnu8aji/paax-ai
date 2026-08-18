import { randomUUID } from "node:crypto";
import { redactValue } from "../security/redaction";

export interface TraceRecord {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  correlationId?: string;
  name: string;
  status: "unset" | "ok" | "error";
  startedAt: string;
  endedAt?: string;
  attributes: Readonly<Record<string, unknown>>;
  errorCode?: string;
}

export interface TraceSpan {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  annotate(attributes: Record<string, unknown>): void;
  end(status?: "unset" | "ok" | "error"): void;
  error(error: unknown): void;
}

export interface TraceRecorderOptions {
  exporter?: (record: TraceRecord) => void | Promise<void>;
  now?: () => string;
}

function boundedAttributes(value: Record<string, unknown>): Record<string, unknown> {
  const filtered = Object.fromEntries(Object.entries(value).filter(([key]) => !/(?:^|_)(?:prompt|content|reasoning|raw)(?:_|$)/i.test(key)));
  const sanitized = redactValue(filtered);
  const record = sanitized && typeof sanitized === "object" && !Array.isArray(sanitized) ? sanitized as Record<string, unknown> : {};
  return Object.fromEntries(Object.entries(record).slice(0, 64));
}

interface MutableSpan {
  record: TraceRecord;
  ended: boolean;
}

export class TraceRecorder {
  private readonly now: () => string;
  private readonly pending: TraceRecord[] = [];
  private readonly spans = new Map<string, MutableSpan>();

  constructor(private readonly options: TraceRecorderOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  start(name: string, options: { traceId?: string; parentSpanId?: string; correlationId?: string; attributes?: Record<string, unknown> } = {}): TraceSpan {
    const record: TraceRecord = {
      traceId: options.traceId ?? randomUUID(),
      spanId: randomUUID(),
      ...(options.parentSpanId ? { parentSpanId: options.parentSpanId } : {}),
      ...(options.correlationId ? { correlationId: options.correlationId.slice(0, 128) } : {}),
      name: name.slice(0, 128),
      status: "unset",
      startedAt: this.now(),
      attributes: boundedAttributes(options.attributes ?? {}),
    };
    const mutable: MutableSpan = { record, ended: false };
    this.spans.set(record.spanId, mutable);
    return {
      traceId: record.traceId,
      spanId: record.spanId,
      ...(record.parentSpanId ? { parentSpanId: record.parentSpanId } : {}),
      annotate: (attributes) => {
        if (mutable.ended) return;
        mutable.record = { ...mutable.record, attributes: boundedAttributes({ ...mutable.record.attributes, ...attributes }) };
      },
      error: (error) => {
        if (mutable.ended) return;
        mutable.record = { ...mutable.record, status: "error", errorCode: error instanceof Error ? error.name.slice(0, 64) : "unknown_error" };
      },
      end: (status = "ok") => {
        if (mutable.ended) return;
        mutable.ended = true;
        mutable.record = { ...mutable.record, status, endedAt: this.now() };
        this.pending.push(mutable.record);
        this.spans.delete(record.spanId);
      },
    };
  }

  async flush(): Promise<void> {
    const records = this.pending.splice(0);
    if (!this.options.exporter) return;
    for (const record of records) {
      try { await this.options.exporter(record); } catch { /* exporter failure is isolated */ }
    }
  }
}
