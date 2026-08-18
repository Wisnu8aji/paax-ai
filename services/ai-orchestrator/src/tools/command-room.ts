import type {
  BaseEnvironment,
  EnvironmentAuditSink,
  EnvironmentRequest,
  EnvironmentResult,
} from "./environments/base";
import { LocalEnvironment } from "./environments/local";
import type { ToolDefinition, ToolExecutionParams } from "./types";

export interface CommandRoomToolOptions {
  workspaceRoot?: string;
  now?: () => string;
  environment?: BaseEnvironment;
  auditSink?: EnvironmentAuditSink;
  delegateTool?: ToolDefinition;
  mcpCatalog?: () => readonly Record<string, unknown>[];
}

export interface WorkTask {
  id: string;
  title: string;
  state: "pending" | "in_progress" | "completed" | "failed" | "cancelled";
  detail?: string;
}

const WORK_TOOL_METADATA: Record<string, { description: string; available: boolean }> = {
  todo: { description: "Maintain the authoritative task ledger for this work session.", available: true },
  workspace_list: { description: "List files and directories under the configured workspace.", available: true },
  file_read: { description: "Read a bounded UTF-8 text file under the configured workspace.", available: true },
  file_search: { description: "Search text in bounded workspace files.", available: true },
  terminal_run: { description: "Run a read-only allowlisted terminal command; non-allowlisted commands require approval.", available: true },
  tool_search: { description: "Search the registered work tools.", available: true },
  tool_describe: { description: "Describe a registered work tool.", available: true },
  mcp_catalog: { description: "Show configured extension servers and their health state.", available: true },
  delegate_task: { description: "Request a bounded child task when a worker adapter is configured.", available: false },
};

function rootPath(input?: string): string {
  // The runtime must provide a workspace root. An absent root is rejected by
  // LocalEnvironment instead of silently widening scope to process.cwd().
  return input?.trim() || process.env.PAAX_WORKSPACE_ROOT?.trim() || "";
}

function cleanRelativePath(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : ".";
}

function redactText(value: string): string {
  return value
    .replace(/(authorization\s*:\s*bearer\s+)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)\s*[:=]\s*)[^\s,;]+/gi, "$1[REDACTED]");
}

/** Retained as a policy helper; it never parses or executes a shell. */
export function isReadOnlyTerminalCommand(command: unknown): boolean {
  if (typeof command !== "string") return false;
  const clean = command.trim();
  if (!clean || clean.length > 4_000 || /[;&|`$<>\r\n()"']/u.test(clean) || /(^|\s)(\.\.|[A-Za-z]:[\\/])/u.test(clean)) return false;
  return /^(?:pwd|Get-Location|Get-ChildItem(?:\s+[\w./\\:*?-]+)?|Get-Content\s+[\w./\\-]+|rg\s+[\w*?.:/\\-]+(?:\s+[\w./\\-]+)?|git\s+(?:status|branch|log)|node\s+--version|pnpm\s+--version|npm\s+--version)$/iu.test(clean);
}

function auditContext(toolName: string, params?: ToolExecutionParams): EnvironmentRequest["audit"] {
  const runId = params?.runId?.trim() || "command-room";
  const toolCallId = params?.toolCallId?.trim() || toolName;
  return {
    runId,
    toolCallId,
    invocationId: params?.invocationId?.trim() || `${runId}:${toolCallId}`,
    actor: "agent",
  };
}

function errorResult(message: string, errorCode?: string): Record<string, unknown> {
  return { error: message, ...(errorCode ? { errorCode } : {}) };
}

function adaptEnvironmentResult(
  result: EnvironmentResult<Record<string, unknown>>,
  approvalGranted: boolean,
): Record<string, unknown> {
  if (result.ok) return result.value ?? {};
  if (result.decision === "command_not_allowlisted") {
    if (!approvalGranted) return { approval_required: true, executed: false, reason: "Perintah ini tidak termasuk allowlist baca-saja.", errorCode: result.errorCode };
    return { executed: false, error: "perintah ditolak oleh execution environment", errorCode: result.errorCode };
  }
  if (result.decision === "protected_path") return errorResult("path berada di luar workspace atau dilindungi", result.errorCode);
  if (result.decision === "path_outside_scope" || result.decision === "symlink_outside_scope" || result.decision === "symlink_not_allowed") return errorResult("path berada di luar workspace atau dilindungi", result.errorCode);
  if (result.decision === "permission_denied") return errorResult("permission environment ditolak", result.errorCode);
  if (result.decision === "aborted") return errorResult("operasi environment dibatalkan", result.errorCode);
  if (result.decision === "request_too_large") return errorResult("request atau hasil environment melebihi batas", result.errorCode);
  return errorResult("workspace tidak dapat diproses", result.errorCode);
}

function normalizeTasks(value: unknown): WorkTask[] {
  if (!Array.isArray(value)) return [];
  let activeSeen = false;
  return value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))).map((item, index) => {
    const state = item.state === "completed" || item.state === "failed" || item.state === "cancelled" ? item.state : item.state === "in_progress" && !activeSeen ? "in_progress" : "pending";
    if (state === "in_progress") activeSeen = true;
    return {
      id: typeof item.id === "string" && item.id.trim() ? item.id.slice(0, 256) : `task-${index + 1}`,
      title: typeof item.title === "string" && item.title.trim() ? item.title.slice(0, 256) : `Task ${index + 1}`,
      state,
      detail: typeof item.detail === "string" ? redactText(item.detail).slice(0, 16_000) : undefined,
    };
  });
}

function declaration(name: string, description: string, properties: Record<string, unknown>, required?: string[]) {
  return { name, description, parameters: { type: "OBJECT" as const, properties, ...(required ? { required } : {}) } };
}

export function createCommandRoomTools(options: CommandRoomToolOptions = {}): ToolDefinition[] {
  const root = rootPath(options.workspaceRoot);
  let tasks: WorkTask[] = [];
  let environment = options.environment;
  let environmentError: string | undefined;

  const getEnvironment = (): BaseEnvironment | undefined => {
    if (environment) return environment;
    if (environmentError) return undefined;
    try {
      environment = new LocalEnvironment({ root, auditSink: options.auditSink, now: options.now });
      return environment;
    } catch {
      environmentError = "environment_root_invalid";
      return undefined;
    }
  };

  const executeEnvironment = async (
    toolName: string,
    request: Omit<EnvironmentRequest, "audit">,
    params?: ToolExecutionParams,
  ): Promise<Record<string, unknown>> => {
    const current = getEnvironment();
    if (!current) return errorResult("workspace root tidak valid", environmentError);
    const result = await current.execute<Record<string, unknown>>({ ...request, audit: auditContext(toolName, params), signal: params?.signal, executionContext: params?.executionContext });
    return adaptEnvironmentResult(result, params?.approvalGranted === true);
  };

  const delegateTool = options.delegateTool ?? {
    declaration: declaration("delegate_task", WORK_TOOL_METADATA.delegate_task.description, { task: { type: "STRING", description: "Child task description." } }, ["task"]),
    execute: () => ({ available: false, executed: false, reason: "Worker adapter belum dikonfigurasi." }),
    summarize: () => "worker adapter belum tersedia",
  } satisfies ToolDefinition;

  return [
    { declaration: declaration("todo", WORK_TOOL_METADATA.todo.description, { tasks: { type: "ARRAY", description: "Full authoritative task list." } }, ["tasks"]), execute: (args) => { tasks = normalizeTasks(args.tasks); return { tasks }; }, summarize: (result) => `${Array.isArray(result.tasks) ? result.tasks.length : 0} task tercatat` },
    { declaration: declaration("workspace_list", WORK_TOOL_METADATA.workspace_list.description, { path: { type: "STRING", description: "Relative path, default ." } }), execute: (args, params) => executeEnvironment("workspace_list", { operation: "list", permission: "workspace_list", path: cleanRelativePath(args.path) }, params), summarize: (result) => `${Array.isArray(result.entries) ? result.entries.length : 0} entry ditemukan` },
    { declaration: declaration("file_read", WORK_TOOL_METADATA.file_read.description, { path: { type: "STRING", description: "Relative file path." }, max_chars: { type: "INTEGER", description: "Maximum characters." } }, ["path"]), execute: (args, params) => executeEnvironment("file_read", { operation: "read", permission: "workspace_read", path: String(args.path ?? ""), maxChars: typeof args.max_chars === "number" ? args.max_chars : undefined }, params), summarize: (result) => typeof result.error === "string" ? `error: ${result.error}` : "file dibaca" },
    { declaration: declaration("file_search", WORK_TOOL_METADATA.file_search.description, { query: { type: "STRING", description: "Text to find." }, path: { type: "STRING", description: "Relative directory, default ." } }, ["query"]), execute: (args, params) => executeEnvironment("file_search", { operation: "search", permission: "workspace_search", query: String(args.query ?? ""), path: cleanRelativePath(args.path) }, params), summarize: (result) => `${Array.isArray(result.matches) ? result.matches.length : 0} match ditemukan` },
    { declaration: declaration("terminal_run", WORK_TOOL_METADATA.terminal_run.description, { command: { type: "STRING", description: "Read-only allowlisted command." } }, ["command"]), execute: (args, params) => executeEnvironment("terminal_run", { operation: "command", permission: "read_only_command", command: typeof args.command === "string" ? args.command : "" }, params), summarize: (result) => result.approval_required ? "approval diperlukan" : result.executed ? "terminal selesai" : `error: ${String(result.error ?? "terminal gagal")}` },
    { declaration: declaration("tool_search", WORK_TOOL_METADATA.tool_search.description, { query: { type: "STRING", description: "Optional name or description filter." } }), execute: (args) => { const query = typeof args.query === "string" ? args.query.toLowerCase() : ""; return { tools: Object.entries(WORK_TOOL_METADATA).filter(([name, meta]) => !query || `${name} ${meta.description}`.toLowerCase().includes(query)).map(([name, meta]) => ({ name, ...meta })) }; }, summarize: () => "katalog tool ditelusuri" },
    { declaration: declaration("tool_describe", WORK_TOOL_METADATA.tool_describe.description, { name: { type: "STRING", description: "Tool name." } }, ["name"]), execute: (args) => { const name = typeof args.name === "string" ? args.name : ""; const meta = WORK_TOOL_METADATA[name]; return meta ? { name, ...meta } : errorResult("tool tidak ditemukan"); }, summarize: () => "deskripsi tool tersedia" },
    { declaration: declaration("mcp_catalog", WORK_TOOL_METADATA.mcp_catalog.description, {}), execute: () => {
      const servers = options.mcpCatalog?.() ?? [];
      return servers.length > 0 ? { servers, configured: true } : { servers: [], configured: false, message: "Belum ada extension server yang dikonfigurasi." };
    }, summarize: () => "katalog extension diperiksa" },
    delegateTool,
  ];
}

export function getCommandRoomToolMetadata(): Record<string, { description: string; available: boolean }> {
  return { ...WORK_TOOL_METADATA };
}
