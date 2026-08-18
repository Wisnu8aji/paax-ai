import { randomUUID } from "node:crypto";
import type { ToolExecutionContext } from "../types";
import { validateEnvironmentInvocation } from "./invocation-context";

export type EnvironmentPermission =
  | "workspace_list"
  | "workspace_read"
  | "workspace_search"
  | "read_only_command";

export type EnvironmentOperation = "list" | "read" | "search" | "command";

export interface EnvironmentScope {
  root: string;
  protectedPathPatterns: RegExp[];
  maxReadBytes: number;
  maxOutputChars: number;
  maxSearchMatches: number;
  allowSymlinks: false;
  maxListEntries?: number;
  maxSearchFiles?: number;
  commandTimeoutMs?: number;
}

export interface EnvironmentIsolation {
  backend: "local" | "docker" | "ssh";
  readOnly: true;
  network: "none";
  processPerCall: true;
}

export interface EnvironmentAuditContext {
  runId: string;
  toolCallId: string;
  invocationId: string;
  actor: "agent" | "user" | "scheduler" | "subagent";
}

export interface EnvironmentRequest {
  operation: EnvironmentOperation;
  permission: EnvironmentPermission;
  path?: string;
  query?: string;
  command?: string;
  args?: string[];
  maxChars?: number;
  audit: EnvironmentAuditContext;
  signal?: AbortSignal;
  executionContext?: ToolExecutionContext;
}

export type EnvironmentDecisionCode =
  | "allowed"
  | "permission_denied"
  | "path_outside_scope"
  | "protected_path"
  | "symlink_outside_scope"
  | "symlink_not_allowed"
  | "command_not_allowlisted"
  | "request_too_large"
  | "aborted"
  | "execution_failed"
  | "unsupported_backend"
  | "invocation_context_invalid";

export interface EnvironmentAuditRecord {
  auditId: string;
  at: string;
  operation: EnvironmentOperation;
  permission: EnvironmentPermission;
  decision: EnvironmentDecisionCode;
  relativePath?: string;
  queryHash?: string;
  commandHash?: string;
  runId: string;
  toolCallId: string;
  invocationId: string;
  durationMs?: number;
  errorCode?: string;
  contextFingerprint?: string;
}

export interface EnvironmentAuditSink {
  append(record: EnvironmentAuditRecord): void | Promise<void>;
}

export interface EnvironmentResult<T = unknown> {
  ok: boolean;
  decision: EnvironmentDecisionCode;
  value?: T;
  errorCode?: string;
  auditId: string;
}

export interface BaseEnvironment {
  readonly permissions: ReadonlySet<EnvironmentPermission>;
  readonly scope: EnvironmentScope;
  readonly isolation: EnvironmentIsolation;
  authorize(request: EnvironmentRequest): Promise<EnvironmentResult<undefined>>;
  execute<T>(request: EnvironmentRequest): Promise<EnvironmentResult<T>>;
  close(): Promise<void>;
}

export const DEFAULT_ENVIRONMENT_SCOPE = {
  maxReadBytes: 256_000,
  maxOutputChars: 60_000,
  maxSearchMatches: 60,
  maxListEntries: 120,
  maxSearchFiles: 300,
  commandTimeoutMs: 15_000,
} as const;

export const DEFAULT_PROTECTED_PATH_PATTERNS: RegExp[] = [
  /(?:^|[\\/])\.env(?:\.[^\\/]*)?(?:$|[\\/])/i,
  /(?:^|[\\/])(?:credentials(?:\.[^\\/]*)?|service-credentials|id_(?:rsa|ed25519))(?:$|[\\/])/i,
  /(?:^|[\\/])[^\\/]+\.(?:pem|key|p12|pfx|crt)$/i,
];

export const ALL_ENVIRONMENT_PERMISSIONS: readonly EnvironmentPermission[] = [
  "workspace_list",
  "workspace_read",
  "workspace_search",
  "read_only_command",
];

export function createAuditId(): string {
  return `audit-${randomUUID()}`;
}

export interface UnsupportedEnvironmentOptions {
  auditSink?: EnvironmentAuditSink;
  now?: () => string;
  auditIdFactory?: () => string;
}

/**
 * Explicit fail-closed boundary used by backends that are reserved for a
 * later phase. It never falls back to the local process.
 */
export class UnsupportedEnvironment implements BaseEnvironment {
  readonly permissions = new Set<EnvironmentPermission>();
  readonly scope: EnvironmentScope = {
    root: "",
    protectedPathPatterns: [],
    maxReadBytes: DEFAULT_ENVIRONMENT_SCOPE.maxReadBytes,
    maxOutputChars: DEFAULT_ENVIRONMENT_SCOPE.maxOutputChars,
    maxSearchMatches: DEFAULT_ENVIRONMENT_SCOPE.maxSearchMatches,
    allowSymlinks: false,
  };
  readonly isolation: EnvironmentIsolation;

  private readonly auditSink: EnvironmentAuditSink;
  private readonly now: () => string;
  private readonly auditIdFactory: () => string;

  constructor(private readonly backend: "docker" | "ssh", options: UnsupportedEnvironmentOptions = {}) {
    this.isolation = { backend, readOnly: true, network: "none", processPerCall: true };
    this.auditSink = options.auditSink ?? { append: () => undefined };
    this.now = options.now ?? (() => new Date().toISOString());
    this.auditIdFactory = options.auditIdFactory ?? createAuditId;
  }

  async authorize(request: EnvironmentRequest): Promise<EnvironmentResult<undefined>> {
    return this.result(request);
  }

  async execute<T>(request: EnvironmentRequest): Promise<EnvironmentResult<T>> {
    return this.result<T>(request);
  }

  async close(): Promise<void> {
    // Unsupported backends have no resources. The method is intentionally
    // idempotent so callers can use one cleanup path for all backends.
  }

  private async result<T>(request: EnvironmentRequest): Promise<EnvironmentResult<T>> {
    const auditId = this.auditIdFactory();
    const contextValidation = validateEnvironmentInvocation({
      executionContext: request.executionContext,
      runId: request.audit.runId,
      toolCallId: request.audit.toolCallId,
      invocationId: request.audit.invocationId,
      toolName: request.executionContext?.toolName ?? "",
      operation: request.operation,
    });
    if (!contextValidation.ok) {
      await this.auditSink.append({
        auditId,
        at: this.now(),
        operation: request.operation,
        permission: request.permission,
        decision: "invocation_context_invalid",
        runId: request.audit.runId,
        toolCallId: request.audit.toolCallId,
        invocationId: request.audit.invocationId,
        errorCode: contextValidation.errorCode,
        ...(request.executionContext?.bindingFingerprint ? { contextFingerprint: request.executionContext.bindingFingerprint } : {}),
      });
      return { ok: false, decision: "invocation_context_invalid", errorCode: contextValidation.errorCode, auditId };
    }
    await this.auditSink.append({
      auditId,
      at: this.now(),
      operation: request.operation,
      permission: request.permission,
      decision: "unsupported_backend",
      runId: request.audit.runId,
      toolCallId: request.audit.toolCallId,
      invocationId: request.audit.invocationId,
      errorCode: "unsupported_backend",
      ...(request.executionContext?.bindingFingerprint ? { contextFingerprint: request.executionContext.bindingFingerprint } : {}),
    });
    return { ok: false, decision: "unsupported_backend", errorCode: "unsupported_backend", auditId };
  }
}
