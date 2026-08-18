import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import {
  ALL_ENVIRONMENT_PERMISSIONS,
  DEFAULT_ENVIRONMENT_SCOPE,
  DEFAULT_PROTECTED_PATH_PATTERNS,
  createAuditId,
  type BaseEnvironment,
  type EnvironmentAuditRecord,
  type EnvironmentAuditSink,
  type EnvironmentDecisionCode,
  type EnvironmentIsolation,
  type EnvironmentOperation,
  type EnvironmentPermission,
  type EnvironmentRequest,
  type EnvironmentResult,
  type EnvironmentScope,
} from "./base";
import { validateEnvironmentInvocation } from "./invocation-context";

const execFileAsync = promisify(execFile);
const MAX_COMMAND_CHARS = 4_000;
const SKIPPED_DIRECTORIES = new Set([".git", ".next", "node_modules", "graphify-out", ".local-runtime"]);

export interface EnvironmentCommandOptions {
  cwd: string;
  signal: AbortSignal;
  timeoutMs: number;
  maxBuffer: number;
  windowsHide: boolean;
}

export interface EnvironmentCommandResult {
  stdout: string;
  stderr: string;
}

export type EnvironmentCommandRunner = (
  executable: string,
  args: readonly string[],
  options: EnvironmentCommandOptions,
) => Promise<EnvironmentCommandResult>;

export interface LocalEnvironmentOptions {
  root: string;
  permissions?: Iterable<EnvironmentPermission>;
  scope?: Partial<EnvironmentScope>;
  auditSink?: EnvironmentAuditSink;
  now?: () => string;
  auditIdFactory?: () => string;
  hash?: (value: string) => string;
  commandRunner?: EnvironmentCommandRunner;
}

interface ResolvedPath {
  absolute: string;
  relativePath: string;
}

interface ParsedCommand {
  kind: "pwd" | "version" | "list" | "read" | "search" | "git";
  display: string;
  executable?: string;
  args?: readonly string[];
  path?: string;
  query?: string;
}

type Authorization = {
  ok: true;
  resolved?: ResolvedPath;
  command?: ParsedCommand;
} | {
  ok: false;
  decision: Exclude<EnvironmentDecisionCode, "allowed">;
  errorCode: string;
  relativePath?: string;
};

const DEFAULT_PERMISSIONS = new Set<EnvironmentPermission>(ALL_ENVIRONMENT_PERMISSIONS);

function defaultHash(value: string): string {
  // Hashing is deliberately injected rather than exposing query/command data
  // in the audit record.
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function defaultCommandRunner(executable: string, args: readonly string[], options: EnvironmentCommandOptions): Promise<EnvironmentCommandResult> {
  return execFileAsync(executable, [...args], {
    cwd: options.cwd,
    signal: options.signal,
    timeout: options.timeoutMs,
    maxBuffer: options.maxBuffer,
    windowsHide: options.windowsHide,
    shell: false,
  }).then((result) => ({ stdout: String(result.stdout ?? ""), stderr: String(result.stderr ?? "") }));
}

function abortError(): Error {
  const error = new Error("environment operation aborted");
  error.name = "AbortError";
  return error;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function normalizePath(value: string): string {
  return value.split(sep).join("/");
}

function comparablePath(value: string): string {
  const normalized = resolve(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function isInside(root: string, candidate: string): boolean {
  const relativePath = relative(comparablePath(root), comparablePath(candidate));
  return !isAbsolute(relativePath) && relativePath !== ".." && !relativePath.startsWith(`..${sep}`);
}

function matchesProtected(patterns: readonly RegExp[], value: string): boolean {
  return patterns.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  });
}

function redactText(value: string): string {
  return value
    .replace(/(authorization\s*:\s*bearer\s+)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)\s*[:=]\s*)[^\s,;]+/gi, "$1[REDACTED]");
}

function safeCommandToken(value: string): boolean {
  return /^[\w./\\:*?.-]+$/u.test(value) && !value.includes("..") && !isAbsolute(value) && !value.startsWith("-");
}

function splitCommand(command: string, args: readonly string[] | undefined): string[] | null {
  const raw = [command, ...(args ?? [])].map((part) => part.trim()).join(" ").trim();
  if (!raw || raw.length > MAX_COMMAND_CHARS || /[;&|`$<>\r\n()]/u.test(raw) || /["']/u.test(raw)) return null;
  const tokens = raw.split(/\s+/u);
  return tokens.every((token) => token.length > 0 && !/[;&|`$<>\r\n()]/u.test(token)) ? tokens : null;
}

function commandExecutable(name: string): string {
  if (process.platform !== "win32") return name;
  if (name === "node") return process.execPath;
  return `${name}.exe`;
}

export class LocalEnvironment implements BaseEnvironment {
  readonly permissions: ReadonlySet<EnvironmentPermission>;
  readonly scope: EnvironmentScope;
  readonly isolation: EnvironmentIsolation = { backend: "local", readOnly: true, network: "none", processPerCall: true };

  private readonly rootRealpath: string;
  private readonly auditSink: EnvironmentAuditSink;
  private readonly now: () => string;
  private readonly auditIdFactory: () => string;
  private readonly hash: (value: string) => string;
  private readonly commandRunner: EnvironmentCommandRunner;
  private readonly activeControllers = new Set<AbortController>();
  private closed = false;

  constructor(options: LocalEnvironmentOptions) {
    const requestedRoot = options.root?.trim();
    if (!requestedRoot) throw new Error("environment root is required");
    try {
      const info = statSync(requestedRoot);
      if (!info.isDirectory()) throw new Error("environment root is not a directory");
      this.rootRealpath = realpathSync.native(requestedRoot);
    } catch (error) {
      if (error instanceof Error && /environment root/.test(error.message)) throw error;
      throw new Error("environment root is invalid");
    }

    const suppliedScope = options.scope ?? {};
    const protectedPathPatterns = suppliedScope.protectedPathPatterns ?? DEFAULT_PROTECTED_PATH_PATTERNS.map((pattern) => new RegExp(pattern.source, pattern.flags));
    this.scope = {
      root: this.rootRealpath,
      protectedPathPatterns,
      maxReadBytes: finitePositive(suppliedScope.maxReadBytes, DEFAULT_ENVIRONMENT_SCOPE.maxReadBytes),
      maxOutputChars: finitePositive(suppliedScope.maxOutputChars, DEFAULT_ENVIRONMENT_SCOPE.maxOutputChars),
      maxSearchMatches: finitePositive(suppliedScope.maxSearchMatches, DEFAULT_ENVIRONMENT_SCOPE.maxSearchMatches),
      allowSymlinks: false,
      maxListEntries: finitePositive(suppliedScope.maxListEntries, DEFAULT_ENVIRONMENT_SCOPE.maxListEntries),
      maxSearchFiles: finitePositive(suppliedScope.maxSearchFiles, DEFAULT_ENVIRONMENT_SCOPE.maxSearchFiles),
      commandTimeoutMs: finitePositive(suppliedScope.commandTimeoutMs, DEFAULT_ENVIRONMENT_SCOPE.commandTimeoutMs),
    };
    this.permissions = new Set(options.permissions ?? DEFAULT_PERMISSIONS);
    this.auditSink = options.auditSink ?? { append: () => undefined };
    this.now = options.now ?? (() => new Date().toISOString());
    this.auditIdFactory = options.auditIdFactory ?? createAuditId;
    this.hash = options.hash ?? defaultHash;
    this.commandRunner = options.commandRunner ?? defaultCommandRunner;
  }

  async authorize(request: EnvironmentRequest): Promise<EnvironmentResult<undefined>> {
    const startedAt = Date.now();
    const auditId = this.auditIdFactory();
    const authorization = await this.authorizeRequest(request);
    return this.auditResult(request, authorization, auditId, Date.now() - startedAt);
  }

  async execute<T>(request: EnvironmentRequest): Promise<EnvironmentResult<T>> {
    const startedAt = Date.now();
    const auditId = this.auditIdFactory();
    const authorization = await this.authorizeRequest(request);
    if (!authorization.ok) return this.auditResult<T>(request, authorization, auditId, Date.now() - startedAt);

    const controller = new AbortController();
    const onAbort = () => controller.abort();
    request.signal?.addEventListener("abort", onAbort, { once: true });
    this.activeControllers.add(controller);
    try {
      if (controller.signal.aborted) throw abortError();
      let value: T;
      switch (request.operation) {
        case "list":
          value = await this.executeList(authorization.resolved!, controller.signal) as T;
          break;
        case "read":
          value = await this.executeRead(authorization.resolved!, request.maxChars, controller.signal) as T;
          break;
        case "search":
          value = await this.executeSearch(authorization.resolved!, request.query!.trim(), request.maxChars, controller.signal) as T;
          break;
        case "command":
          value = await this.executeCommand(authorization.command!, request.maxChars, controller.signal) as T;
          break;
      }
      if (controller.signal.aborted) throw abortError();
      return this.auditResult(request, { ok: true }, auditId, Date.now() - startedAt, value);
    } catch (error) {
      const failure: Authorization = controller.signal.aborted || isAbortError(error)
        ? { ok: false, decision: "aborted", errorCode: "aborted" }
        : error instanceof RequestTooLargeError
          ? { ok: false, decision: "request_too_large", errorCode: error.code }
          : error instanceof EnvironmentFailure
            ? failureForEnvironmentCode(error.code)
            : { ok: false, decision: "execution_failed", errorCode: "execution_failed" };
      return this.auditResult<T>(request, failure, auditId, Date.now() - startedAt);
    } finally {
      this.activeControllers.delete(controller);
      request.signal?.removeEventListener("abort", onAbort);
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    for (const controller of this.activeControllers) controller.abort();
    this.activeControllers.clear();
  }

  private async authorizeRequest(request: EnvironmentRequest): Promise<Authorization> {
    if (this.closed) return { ok: false, decision: "execution_failed", errorCode: "environment_closed" };
    if (request.signal?.aborted) return { ok: false, decision: "aborted", errorCode: "aborted" };
    const contextValidation = validateEnvironmentInvocation({
      executionContext: request.executionContext,
      runId: request.audit.runId,
      toolCallId: request.audit.toolCallId,
      invocationId: request.audit.invocationId,
      toolName: request.executionContext?.toolName ?? "",
      operation: request.operation,
    });
    if (!contextValidation.ok) return { ok: false, decision: "invocation_context_invalid", errorCode: contextValidation.errorCode };
    if (request.executionContext?.environmentRoot && comparablePath(request.executionContext.environmentRoot) !== comparablePath(this.scope.root)) return { ok: false, decision: "invocation_context_invalid", errorCode: "environment_root_mismatch" };
    if (request.executionContext) {
      const policy = request.executionContext.policy;
      if (policy.available !== true || policy.sideEffect === "write" || policy.riskTier === "critical") return { ok: false, decision: "permission_denied", errorCode: "environment_policy_denied" };
      const scope = policy.scope;
      if (scope && request.executionContext.binding && request.executionContext.binding.allowedToolScopes.length > 0 && !request.executionContext.binding.allowedToolScopes.includes(scope)) return { ok: false, decision: "permission_denied", errorCode: "tool_scope_denied" };
      if (!request.executionContext.binding) return { ok: false, decision: "invocation_context_invalid", errorCode: "invocation_context_invalid" };
    }
    const expectedPermission: EnvironmentPermission = request.operation === "list"
      ? "workspace_list"
      : request.operation === "read"
        ? "workspace_read"
        : request.operation === "search"
          ? "workspace_search"
          : "read_only_command";
    if (request.permission !== expectedPermission || !this.permissions.has(request.permission)) {
      return { ok: false, decision: "permission_denied", errorCode: "permission_denied" };
    }

    if (request.operation === "command") {
      const command = this.parseCommand(request.command, request.args);
      if (!command) return { ok: false, decision: "command_not_allowlisted", errorCode: "command_not_allowlisted" };
      if (command.path !== undefined) {
        const path = await this.resolveScopedPath(command.path);
        if (!path.ok) return path;
        command.path = path.resolved!.relativePath;
        return { ok: true, command: { ...command, path: path.resolved!.relativePath } };
      }
      return { ok: true, command };
    }

    const path = await this.resolveScopedPath(request.path ?? ".");
    if (!path.ok) return path;
    if (request.operation === "search") {
      const query = typeof request.query === "string" ? request.query.trim() : "";
      if (!query) return { ok: false, decision: "request_too_large", errorCode: "query_required" };
      if (query.length > MAX_COMMAND_CHARS) return { ok: false, decision: "request_too_large", errorCode: "query_too_large" };
    }
    return { ok: true, resolved: path.resolved };
  }

  private parseCommand(command: string | undefined, args: readonly string[] | undefined): ParsedCommand | null {
    if (typeof command !== "string") return null;
    const tokens = splitCommand(command, args);
    if (!tokens) return null;
    const [name, ...rest] = tokens;
    const lower = name.toLowerCase();
    if ((lower === "pwd" || lower === "get-location") && rest.length === 0) return { kind: "pwd", display: tokens.join(" ") };
    if (lower === "node" && rest.length === 1 && rest[0] === "--version") return { kind: "version", display: tokens.join(" "), executable: "node", args: ["--version"] };
    if ((lower === "pnpm" || lower === "npm") && rest.length === 1 && rest[0] === "--version") return { kind: "version", display: tokens.join(" "), executable: lower, args: ["--version"] };
    if (lower === "get-childitem" && rest.length <= 1 && (!rest[0] || safeCommandToken(rest[0]))) return { kind: "list", display: tokens.join(" "), path: rest[0] ?? "." };
    if (lower === "get-content" && rest.length === 1 && safeCommandToken(rest[0])) return { kind: "read", display: tokens.join(" "), path: rest[0] };
    if (lower === "rg" && (rest.length === 1 || rest.length === 2) && safeCommandToken(rest[0]) && (!rest[1] || safeCommandToken(rest[1]))) return { kind: "search", display: tokens.join(" "), query: rest[0], path: rest[1] ?? "." };
    if (lower === "git" && rest.length === 1 && ["status", "branch", "log"].includes(rest[0].toLowerCase())) return { kind: "git", display: tokens.join(" "), executable: "git", args: [rest[0]] };
    return null;
  }

  private async resolveScopedPath(requested: string): Promise<Authorization> {
    const candidate = resolve(this.rootRealpath, requested || ".");
    const lexicalRelative = normalizePath(relative(this.rootRealpath, candidate));
    if (!isInside(this.rootRealpath, candidate)) return { ok: false, decision: "path_outside_scope", errorCode: "path_outside_scope" };
    if (matchesProtected(this.scope.protectedPathPatterns, lexicalRelative)) return { ok: false, decision: "protected_path", errorCode: "protected_path" };

    try {
      const targetRealpath = await realpath(candidate);
      if (!isInside(this.rootRealpath, targetRealpath)) return { ok: false, decision: "symlink_outside_scope", errorCode: "symlink_outside_scope" };
      if (!this.scope.allowSymlinks && comparablePath(targetRealpath) !== comparablePath(candidate)) return { ok: false, decision: "symlink_not_allowed", errorCode: "symlink_not_allowed" };
      return { ok: true, resolved: { absolute: targetRealpath, relativePath: normalizePath(relative(this.rootRealpath, targetRealpath)) || "." } };
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") return { ok: false, decision: "execution_failed", errorCode: "path_unreadable" };
      let parent = candidate;
      const suffix: string[] = [];
      while (true) {
        try {
          const parentRealpath = await realpath(parent);
          if (!isInside(this.rootRealpath, parentRealpath)) return { ok: false, decision: "symlink_outside_scope", errorCode: "symlink_outside_scope" };
          const reconstructed = resolve(parentRealpath, ...suffix.reverse());
          return { ok: true, resolved: { absolute: reconstructed, relativePath: normalizePath(relative(this.rootRealpath, reconstructed)) || "." } };
        } catch (parentError) {
          if ((parentError as NodeJS.ErrnoException)?.code !== "ENOENT") return { ok: false, decision: "execution_failed", errorCode: "path_unreadable" };
          const next = dirname(parent);
          if (next === parent) return { ok: false, decision: "path_outside_scope", errorCode: "path_outside_scope" };
          suffix.push(parent.slice(next.length + 1));
          parent = next;
        }
      }
    }
  }

  private async executeList(path: ResolvedPath, signal: AbortSignal): Promise<Record<string, unknown>> {
    this.throwIfAborted(signal);
    const entries = await readdir(path.absolute, { withFileTypes: true });
    const visible = entries.filter((entry) => !matchesProtected(this.scope.protectedPathPatterns, normalizePath(path.relativePath === "." ? entry.name : `${path.relativePath}/${entry.name}`)));
    return {
      path: path.relativePath,
      entries: visible.sort((a, b) => a.name.localeCompare(b.name)).slice(0, this.scope.maxListEntries).map((entry) => ({ name: entry.name, kind: entry.isDirectory() ? "directory" : "file" })),
      truncated: visible.length > this.scope.maxListEntries!,
    };
  }

  private async executeRead(path: ResolvedPath, requestedMaxChars: number | undefined, signal: AbortSignal): Promise<Record<string, unknown>> {
    this.throwIfAborted(signal);
    const info = await stat(path.absolute);
    if (!info.isFile()) throw new Error("path is not a file");
    if (info.size > this.scope.maxReadBytes) return Promise.reject(new RequestTooLargeError("read_bytes_exceeded"));
    const content = await readFile(path.absolute, { encoding: "utf8", signal });
    if (Buffer.byteLength(content, "utf8") > this.scope.maxReadBytes) throw new RequestTooLargeError("read_bytes_exceeded");
    const maxChars = boundedLimit(requestedMaxChars, this.scope.maxOutputChars);
    const redacted = redactText(content);
    return { path: path.relativePath, content: redacted.slice(0, maxChars), truncated: redacted.length > maxChars };
  }

  private async executeSearch(path: ResolvedPath, query: string, requestedMaxChars: number | undefined, signal: AbortSignal): Promise<Record<string, unknown>> {
    this.throwIfAborted(signal);
    const files: string[] = [];
    await this.collectFiles(path.absolute, files, signal);
    const maxChars = boundedLimit(requestedMaxChars, this.scope.maxOutputChars);
    const matches: Array<{ path: string; line: number; text: string }> = [];
    for (const file of files) {
      this.throwIfAborted(signal);
      if (matches.length >= this.scope.maxSearchMatches) break;
      try {
        const info = await stat(file);
        if (!info.isFile() || info.size > this.scope.maxReadBytes) continue;
        const content = await readFile(file, { encoding: "utf8", signal });
        content.split(/\r?\n/u).forEach((line, index) => {
          if (matches.length < this.scope.maxSearchMatches && line.toLocaleLowerCase().includes(query.toLocaleLowerCase())) {
            matches.push({ path: normalizePath(relative(this.rootRealpath, file)), line: index + 1, text: redactText(line).slice(0, Math.min(500, maxChars)) });
          }
        });
      } catch (error) {
        if (isAbortError(error)) throw error;
      }
    }
    return { query: redactText(query), matches, truncated: matches.length >= this.scope.maxSearchMatches || files.length >= this.scope.maxSearchFiles! };
  }

  private async collectFiles(directory: string, output: string[], signal: AbortSignal): Promise<void> {
    if (output.length >= this.scope.maxSearchFiles!) return;
    this.throwIfAborted(signal);
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (output.length >= this.scope.maxSearchFiles!) return;
      this.throwIfAborted(signal);
      const candidate = resolve(directory, entry.name);
      const candidateRelative = normalizePath(relative(this.rootRealpath, candidate));
      if (matchesProtected(this.scope.protectedPathPatterns, candidateRelative)) continue;
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) await this.collectFiles(candidate, output, signal);
      } else if (entry.isFile()) output.push(candidate);
    }
  }

  private async executeCommand(command: ParsedCommand, requestedMaxChars: number | undefined, signal: AbortSignal): Promise<Record<string, unknown>> {
    this.throwIfAborted(signal);
    if (command.kind === "pwd") return { command: command.display, executed: true, stdout: `${this.rootRealpath}\n`, stderr: "" };
    if (command.kind === "list") {
      const path = await this.resolveScopedPath(command.path ?? ".");
      if (!path.ok) throw new EnvironmentFailure(path.errorCode);
      const value = await this.executeList(path.resolved!, signal);
      return { command: command.display, executed: true, stdout: formatEntries(value.entries), stderr: "" };
    }
    if (command.kind === "read") {
      const path = await this.resolveScopedPath(command.path!);
      if (!path.ok) throw new EnvironmentFailure(path.errorCode);
      const value = await this.executeRead(path.resolved!, requestedMaxChars, signal);
      return { command: command.display, executed: true, stdout: String(value.content ?? ""), stderr: "", truncated: value.truncated };
    }
    if (command.kind === "search") {
      const path = await this.resolveScopedPath(command.path ?? ".");
      if (!path.ok) throw new EnvironmentFailure(path.errorCode);
      const value = await this.executeSearch(path.resolved!, command.query!, requestedMaxChars, signal);
      return { command: command.display, executed: true, stdout: (value.matches as Array<{ path: string; line: number; text: string }>).map((match) => `${match.path}:${match.line}:${match.text}`).join("\n"), stderr: "", truncated: value.truncated };
    }

    const executable = commandExecutable(command.executable!);
    const output = await this.commandRunner(executable, command.args ?? [], {
      cwd: this.rootRealpath,
      signal,
      timeoutMs: this.scope.commandTimeoutMs!,
      maxBuffer: this.scope.maxOutputChars * 2,
      windowsHide: true,
    });
    this.throwIfAborted(signal);
    return { command: command.display, executed: true, stdout: limitText(redactText(output.stdout), this.scope.maxOutputChars), stderr: limitText(redactText(output.stderr), this.scope.maxOutputChars) };
  }

  private throwIfAborted(signal: AbortSignal): void {
    if (signal.aborted) throw abortError();
  }

  private async auditResult<T>(request: EnvironmentRequest, authorization: Authorization, auditId: string, durationMs: number, value?: T): Promise<EnvironmentResult<T>> {
    const decision = authorization.ok ? "allowed" : authorization.decision;
    const record: EnvironmentAuditRecord = {
      auditId,
      at: this.now(),
      operation: request.operation,
      permission: request.permission,
      decision,
      runId: request.audit.runId,
      toolCallId: request.audit.toolCallId,
      invocationId: request.audit.invocationId,
      durationMs,
      ...(authorization.ok && authorization.resolved?.relativePath && authorization.resolved.relativePath !== "." ? { relativePath: authorization.resolved.relativePath } : {}),
      ...(typeof request.query === "string" ? { queryHash: this.hash(request.query) } : {}),
      ...(typeof request.command === "string" ? { commandHash: this.hash(request.command) } : {}),
      ...(request.executionContext?.bindingFingerprint ? { contextFingerprint: request.executionContext.bindingFingerprint } : {}),
      ...(!authorization.ok ? { errorCode: authorization.errorCode } : {}),
    };
    await this.auditSink.append(record);
    return authorization.ok
      ? { ok: true, decision: "allowed", ...(value === undefined ? {} : { value }), auditId }
      : { ok: false, decision: authorization.decision, errorCode: authorization.errorCode, auditId };
  }
}

class RequestTooLargeError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "RequestTooLargeError";
  }
}

class EnvironmentFailure extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "EnvironmentFailure";
  }
}

function finitePositive(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && (value as number) > 0 ? Math.floor(value as number) : fallback;
}

function boundedLimit(requested: number | undefined, maximum: number): number {
  return Math.max(1, Math.min(maximum, finitePositive(requested, maximum)));
}

function limitText(value: string, maximum: number): string {
  return value.slice(0, maximum);
}

function formatEntries(entries: unknown): string {
  if (!Array.isArray(entries)) return "";
  return entries.map((entry) => {
    const item = entry as { kind?: string; name?: string };
    return `${item.kind === "directory" ? "d" : "f"} ${item.name ?? ""}`;
  }).join("\n");
}

function failureForEnvironmentCode(code: string): Authorization {
  const decisions: Record<string, Exclude<Authorization, { ok: true }>["decision"]> = {
    path_outside_scope: "path_outside_scope",
    protected_path: "protected_path",
    symlink_outside_scope: "symlink_outside_scope",
    symlink_not_allowed: "symlink_not_allowed",
    command_not_allowlisted: "command_not_allowlisted",
    request_too_large: "request_too_large",
    aborted: "aborted",
  };
  const decision = decisions[code] ?? "execution_failed";
  return { ok: false, decision, errorCode: code };
}
