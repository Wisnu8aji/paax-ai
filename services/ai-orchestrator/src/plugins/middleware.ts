export type PluginMiddlewareStage = "beforeTurn" | "beforeModel" | "beforeTool" | "afterTool" | "afterTurn";

export interface PluginMiddlewareIdentity {
  readonly tenantId: string;
  readonly actorId: string;
  readonly runId: string;
  readonly [key: string]: unknown;
}

export interface PluginMiddlewareAuthority {
  readonly approval: string;
  readonly budget: Readonly<Record<string, number>>;
  readonly toolPermissions: readonly string[];
  readonly provider: string;
  readonly [key: string]: unknown;
}

export interface PluginMiddlewareContext {
  readonly stage: PluginMiddlewareStage;
  readonly identity: PluginMiddlewareIdentity;
  readonly authority: PluginMiddlewareAuthority;
  readonly metadata: Record<string, unknown>;
}

export interface PluginMiddleware {
  pluginId: string;
  id: string;
  stage: PluginMiddlewareStage;
  priority: number;
  handle(context: PluginMiddlewareContext, next: () => Promise<void>): Promise<void> | void;
}

export interface PluginMiddlewareTrace {
  pluginId: string;
  middlewareId: string;
  stage: PluginMiddlewareStage;
  event: "before" | "after" | "error";
  metadata: Record<string, unknown>;
}

export class PluginMiddlewareError extends Error {
  constructor(readonly code: "middleware_next_twice" | "middleware_failed" | "middleware_closed", message: string) {
    super(message);
    this.name = "PluginMiddlewareError";
  }
}

const SECRET_KEY = /(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|authorization)/i;

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[TRUNCATED]";
  if (typeof value === "string") return value.replace(/Bearer\s+[^\s]+/gi, "Bearer [REDACTED]").slice(0, 4_000);
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (Array.isArray(value)) return value.slice(0, 64).map((item) => sanitize(item, depth + 1));
  if (!value || typeof value !== "object") return "[UNSUPPORTED]";
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>).slice(0, 128)) result[key] = SECRET_KEY.test(key) ? "[REDACTED]" : sanitize(child, depth + 1);
  return result;
}

function cloneContext(context: PluginMiddlewareContext, stage: PluginMiddlewareStage): PluginMiddlewareContext {
  const identity = Object.freeze({ ...context.identity });
  const authority = Object.freeze({ ...context.authority, budget: Object.freeze({ ...context.authority.budget }), toolPermissions: Object.freeze([...context.authority.toolPermissions]) });
  const metadata = sanitize(context.metadata) as Record<string, unknown>;
  Object.freeze(metadata);
  return Object.freeze({ stage, identity, authority, metadata });
}

export interface PluginMiddlewarePipelineOptions {
  onTrace?: (trace: PluginMiddlewareTrace) => void;
}

export interface PluginMiddlewarePipeline {
  run(stage: PluginMiddlewareStage, context: PluginMiddlewareContext, downstream: () => Promise<void>): Promise<void>;
  close(): Promise<void>;
}

export function composePluginMiddleware(middleware: readonly PluginMiddleware[], options: PluginMiddlewarePipelineOptions = {}): PluginMiddlewarePipeline {
  const ordered = [...middleware].sort((a, b) => a.priority - b.priority || a.pluginId.localeCompare(b.pluginId) || a.id.localeCompare(b.id));
  let closed = false;
  const trace = (item: PluginMiddleware, stage: PluginMiddlewareStage, event: PluginMiddlewareTrace["event"], metadata: Record<string, unknown>) => {
    try { options.onTrace?.({ pluginId: item.pluginId, middlewareId: item.id, stage, event, metadata: sanitize(metadata) as Record<string, unknown> }); } catch { /* trace failure is isolated */ }
  };
  return {
    async run(stage, context, downstream) {
      if (closed) throw new PluginMiddlewareError("middleware_closed", "plugin middleware pipeline is closed");
      const selected = ordered.filter((item) => item.stage === stage);
      const safeContext = cloneContext(context, stage);
      let index = -1;
      const dispatch = async (nextIndex: number): Promise<void> => {
        if (nextIndex <= index) throw new PluginMiddlewareError("middleware_next_twice", "plugin middleware called next more than once");
        index = nextIndex;
        const item = selected[nextIndex];
        if (!item) return downstream();
        trace(item, stage, "before", safeContext.metadata);
        try {
          let nextCalls = 0;
          await item.handle(safeContext, async () => {
            nextCalls += 1;
            if (nextCalls > 1) throw new PluginMiddlewareError("middleware_next_twice", "plugin middleware called next more than once");
            await dispatch(nextIndex + 1);
          });
          trace(item, stage, "after", safeContext.metadata);
        } catch (error) {
          trace(item, stage, "error", safeContext.metadata);
          if (error instanceof PluginMiddlewareError) throw error;
          throw new PluginMiddlewareError("middleware_failed", "plugin middleware failed");
        }
      };
      try { await dispatch(0); } catch (error) { closed = true; throw error; }
    },
    async close() { closed = true; },
  };
}
