import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { promisify } from "node:util";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { ToolDefinition } from "@paax/ai-orchestrator/tools";
import type { WorkTask } from "@/lib/command-room/work-agent-types";

const execFileAsync = promisify(execFile);
const MAX_LIST_ENTRIES = 120;
const MAX_SEARCH_FILES = 300;
const MAX_SEARCH_MATCHES = 60;
const MAX_READ_CHARS = 48_000;
const SKIPPED_DIRECTORIES = new Set([".git", ".next", "node_modules", "graphify-out", ".local-runtime"]);

const WORK_TOOL_METADATA: Record<string, { description: string; available: boolean }> = {
  todo: { description: "Maintain the authoritative task ledger for this work session.", available: true },
  workspace_list: { description: "List files and directories under the configured workspace.", available: true },
  file_read: { description: "Read a bounded UTF-8 text file under the configured workspace.", available: true },
  file_search: { description: "Search text in bounded workspace files.", available: true },
  terminal_run: { description: "Run a read-only allowlisted terminal command.", available: true },
  tool_search: { description: "Search the registered work tools.", available: true },
  tool_describe: { description: "Describe a registered work tool.", available: true },
  mcp_catalog: { description: "Show configured extension servers and their health state.", available: true },
  delegate_task: { description: "Request a bounded child task when a worker adapter is configured.", available: false },
};

interface WorkToolOptions {
  workspaceRoot?: string;
  requestApproval?: (input: { action: string; reason: string; args: Record<string, unknown> }) => Promise<boolean>;
}

function rootPath(input?: string): string {
  return resolve(input?.trim() || process.env.PAAX_WORKSPACE_ROOT?.trim() || process.cwd());
}

function cleanRelativePath(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return ".";
  return value.trim();
}

function resolveInside(root: string, requested: unknown): { absolute: string; relativePath: string } | null {
  const raw = cleanRelativePath(requested);
  const candidate = resolve(root, raw);
  const relativePath = relative(root, candidate);
  if (isAbsolute(relativePath) || relativePath === ".." || relativePath.startsWith(`..${sep}`)) return null;
  return { absolute: candidate, relativePath: relativePath ? relativePath.split(sep).join("/") : "." };
}

function errorResult(message: string): Record<string, unknown> {
  return { error: message };
}

async function listWorkspace(root: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const target = resolveInside(root, args.path);
  if (!target) return errorResult("path berada di luar workspace yang diizinkan");
  try {
    const entries = await readdir(target.absolute, { withFileTypes: true });
    return {
      path: target.relativePath,
      entries: entries
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, MAX_LIST_ENTRIES)
        .map((entry) => ({ name: entry.name, kind: entry.isDirectory() ? "directory" : "file" })),
      truncated: entries.length > MAX_LIST_ENTRIES,
    };
  } catch (error) {
    return errorResult(error instanceof Error ? error.message : "workspace tidak dapat dibaca");
  }
}

async function readWorkspaceFile(root: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const target = resolveInside(root, args.path);
  if (!target || target.relativePath === ".") return errorResult("file harus berada di dalam workspace yang diizinkan");
  try {
    const info = await stat(target.absolute);
    if (!info.isFile()) return errorResult("path bukan file");
    const requestedLimit = typeof args.max_chars === "number" ? Math.floor(args.max_chars) : MAX_READ_CHARS;
    const limit = Math.max(1, Math.min(MAX_READ_CHARS, requestedLimit));
    const content = await readFile(target.absolute, "utf8");
    return { path: target.relativePath, content: content.slice(0, limit), truncated: content.length > limit };
  } catch (error) {
    return errorResult(error instanceof Error ? error.message : "file tidak dapat dibaca");
  }
}

async function collectFiles(root: string, directory: string, output: string[]): Promise<void> {
  if (output.length >= MAX_SEARCH_FILES) return;
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (output.length >= MAX_SEARCH_FILES) return;
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) await collectFiles(root, resolve(directory, entry.name), output);
    } else {
      output.push(resolve(directory, entry.name));
    }
  }
}

async function searchWorkspace(root: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const query = typeof args.query === "string" ? args.query.trim() : "";
  if (!query) return errorResult("query wajib diisi");
  const target = resolveInside(root, args.path);
  if (!target) return errorResult("path berada di luar workspace yang diizinkan");
  const files: string[] = [];
  await collectFiles(root, target.absolute, files);
  const matches: Array<{ path: string; line: number; text: string }> = [];
  for (const file of files) {
    if (matches.length >= MAX_SEARCH_MATCHES) break;
    try {
      const content = await readFile(file, "utf8");
      const lines = content.split(/\r?\n/);
      lines.forEach((line, index) => {
        if (matches.length < MAX_SEARCH_MATCHES && line.toLocaleLowerCase().includes(query.toLocaleLowerCase())) {
          matches.push({ path: relative(root, file).split(sep).join("/"), line: index + 1, text: line.slice(0, 500) });
        }
      });
    } catch {
      // Binary/unreadable files are ignored by the read-only search tool.
    }
  }
  return { query, matches, truncated: matches.length >= MAX_SEARCH_MATCHES || files.length >= MAX_SEARCH_FILES };
}

function normalizeTasks(value: unknown): WorkTask[] {
  if (!Array.isArray(value)) return [];
  let activeSeen = false;
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    .map((item, index) => {
      const state = item.state === "completed" || item.state === "failed" || item.state === "cancelled" ? item.state : item.state === "in_progress" && !activeSeen ? "in_progress" : "pending";
      if (state === "in_progress") activeSeen = true;
      return {
        id: typeof item.id === "string" && item.id.trim() ? item.id : `task-${index + 1}`,
        title: typeof item.title === "string" && item.title.trim() ? item.title.slice(0, 240) : `Task ${index + 1}`,
        state,
        detail: typeof item.detail === "string" ? item.detail.slice(0, 500) : undefined,
      } satisfies WorkTask;
    });
}

function safeTerminalCommand(command: string): boolean {
  if (/[;&|`$<>]/.test(command) || /(^|\s)(\.\.|[A-Za-z]:\\)/.test(command)) return false;
  return /^(pwd|Get-Location|Get-ChildItem(?:\s+[\w./\\-]+)*|Get-Content\s+[\w./\\-]+|rg\s+[\w*?.:/\\-]+(?:\s+[\w./\\-]+)*|git\s+(?:status|branch|log)(?:\s+[\w./\\-]+)*|node\s+--version|pnpm\s+--version|npm\s+--version)$/i.test(command.trim());
}

async function runTerminal(
  root: string,
  args: Record<string, unknown>,
  requestApproval?: WorkToolOptions["requestApproval"],
): Promise<Record<string, unknown>> {
  const command = typeof args.command === "string" ? args.command.trim() : "";
  if (!command) return errorResult("command wajib diisi");
  if (!safeTerminalCommand(command)) {
    if (!requestApproval) return { approval_required: true, executed: false, reason: "Perintah ini tidak termasuk allowlist baca-saja." };
    const approved = await requestApproval({
      action: "terminal_run",
      reason: "Perintah ini tidak termasuk allowlist baca-saja.",
      args: { command },
    });
    if (!approved) return { approval_required: true, approved: false, executed: false, reason: "Approval tidak diberikan." };
  }
  try {
    const executable = process.platform === "win32" ? "pwsh" : "sh";
    const commandArgs = process.platform === "win32" ? ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command] : ["-lc", command];
    const result = await execFileAsync(executable, commandArgs, { cwd: root, timeout: 15_000, maxBuffer: 80_000, windowsHide: true });
    return { command, executed: true, stdout: String(result.stdout).slice(0, 60_000), stderr: String(result.stderr).slice(0, 20_000) };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    return { command, executed: false, error: err.message || "terminal gagal", stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
  }
}

export function createWorkToolRegistry(options: WorkToolOptions = {}): ToolDefinition[] {
  const root = rootPath(options.workspaceRoot);
  let tasks: WorkTask[] = [];
  let registry: ToolDefinition[] = [];
  const declaration = (name: string, description: string, properties: Record<string, unknown>, required?: string[]) => ({
    name,
    description,
    parameters: { type: "OBJECT" as const, properties, required },
  });

  registry = [
    {
      declaration: declaration("todo", WORK_TOOL_METADATA.todo.description, { tasks: { type: "array", description: "Full authoritative task list." } }, ["tasks"]),
      execute: (args) => {
        tasks = normalizeTasks(args.tasks);
        return { tasks };
      },
      summarize: (result) => `${Array.isArray(result.tasks) ? result.tasks.length : 0} task tercatat`,
    },
    {
      declaration: declaration("workspace_list", WORK_TOOL_METADATA.workspace_list.description, { path: { type: "string", description: "Relative path, default ." } }),
      execute: (args) => listWorkspace(root, args),
      summarize: (result) => `${Array.isArray(result.entries) ? result.entries.length : 0} entry ditemukan`,
    },
    {
      declaration: declaration("file_read", WORK_TOOL_METADATA.file_read.description, { path: { type: "string", description: "Relative file path." }, max_chars: { type: "integer", description: "Maximum characters." } }, ["path"]),
      execute: (args) => readWorkspaceFile(root, args),
      summarize: (result) => typeof result.error === "string" ? `error: ${result.error}` : "file dibaca",
    },
    {
      declaration: declaration("file_search", WORK_TOOL_METADATA.file_search.description, { query: { type: "string", description: "Text to find." }, path: { type: "string", description: "Relative directory, default ." } }, ["query"]),
      execute: (args) => searchWorkspace(root, args),
      summarize: (result) => `${Array.isArray(result.matches) ? result.matches.length : 0} match ditemukan`,
    },
    {
      declaration: declaration("terminal_run", WORK_TOOL_METADATA.terminal_run.description, { command: { type: "string", description: "Read-only allowlisted command." } }, ["command"]),
      execute: (args) => runTerminal(root, args, options.requestApproval),
      summarize: (result) => result.approval_required ? "approval diperlukan" : result.executed ? "terminal selesai" : `error: ${String(result.error ?? "terminal gagal")}`,
    },
    {
      declaration: declaration("tool_search", WORK_TOOL_METADATA.tool_search.description, { query: { type: "string", description: "Optional name or description filter." } }),
      execute: (args) => {
        const query = typeof args.query === "string" ? args.query.toLowerCase() : "";
        return { tools: Object.entries(WORK_TOOL_METADATA).filter(([name, meta]) => !query || `${name} ${meta.description}`.toLowerCase().includes(query)).map(([name, meta]) => ({ name, ...meta })) };
      },
      summarize: () => "katalog tool ditelusuri",
    },
    {
      declaration: declaration("tool_describe", WORK_TOOL_METADATA.tool_describe.description, { name: { type: "string", description: "Tool name." } }, ["name"]),
      execute: (args) => {
        const name = typeof args.name === "string" ? args.name : "";
        const meta = WORK_TOOL_METADATA[name];
        return meta ? { name, ...meta } : errorResult("tool tidak ditemukan");
      },
      summarize: () => "deskripsi tool tersedia",
    },
    {
      declaration: declaration("mcp_catalog", WORK_TOOL_METADATA.mcp_catalog.description, {}),
      execute: () => ({ servers: [], configured: false, message: "Belum ada extension server yang dikonfigurasi." }),
      summarize: () => "katalog extension diperiksa",
    },
    {
      declaration: declaration("delegate_task", WORK_TOOL_METADATA.delegate_task.description, { task: { type: "string", description: "Child task description." } }, ["task"]),
      execute: () => ({ available: false, executed: false, reason: "Worker adapter belum dikonfigurasi." }),
      summarize: () => "worker adapter belum tersedia",
    },
  ];

  return registry;
}

export function getWorkToolNames(): string[] {
  return Object.keys(WORK_TOOL_METADATA);
}

export function getWorkToolMetadata(): Record<string, { description: string; available: boolean }> {
  return { ...WORK_TOOL_METADATA };
}
