import { getToolPolicy } from "./tool-policy";
import type { ToolDefinition } from "./types";

export type ToolsetId = "command-room" | "domain" | "skills" | "mcp";

export interface ToolsetDescriptor {
  readonly id: ToolsetId;
  readonly capability: string;
  readonly toolNames: readonly string[];
  readonly defaultEnabled: boolean;
}

export interface ToolsetSelection {
  readonly include: readonly ToolsetId[];
  readonly allowedScopes: readonly string[];
  readonly maxTools: number;
}

export const DEFAULT_TOOLSETS: readonly ToolsetDescriptor[] = Object.freeze([
  {
    id: "command-room",
    capability: "Command Room workspace and planning tools",
    toolNames: ["todo", "workspace_list", "file_read", "file_search", "terminal_run", "tool_search", "tool_describe", "mcp_catalog", "delegate_task"],
    defaultEnabled: true,
  },
  {
    id: "domain",
    capability: "PAAX domain and engineering tools",
    toolNames: ["lookup_ahsp", "run_scenario", "analyze_drawing", "query_rab", "query_schedule", "query_progress", "query_materials", "query_project_graph", "project_diagnostics", "export_rab_xlsx"],
    defaultEnabled: true,
  },
  { id: "skills", capability: "Progressive skill discovery tools", toolNames: ["skills_list", "skill_view", "skill_manager"], defaultEnabled: false },
  { id: "mcp", capability: "Configured MCP capability adapters", toolNames: [], defaultEnabled: false },
]);

type ToolMetadata = ToolDefinition & {
  readonly toolset?: ToolsetId | readonly ToolsetId[];
  readonly scope?: string;
};

function inferToolset(tool: ToolMetadata): ToolsetId | undefined {
  const explicit = tool.toolset;
  if (typeof explicit === "string") return explicit as ToolsetId;
  if (Array.isArray(explicit)) return explicit[0] as ToolsetId | undefined;
  const name = tool.declaration.name;
  if (name.startsWith("mcp__")) return "mcp";
  if (name.startsWith("skill_") || name.startsWith("skills_")) return "skills";
  return DEFAULT_TOOLSETS.find((descriptor) => descriptor.toolNames.includes(name))?.id;
}

function isAllowedByToolset(tool: ToolMetadata, included: ReadonlySet<ToolsetId>): boolean {
  const explicit = tool.toolset;
  if (Array.isArray(explicit) && explicit.some((item) => included.has(item))) return true;
  const inferred = inferToolset(tool);
  return inferred !== undefined && included.has(inferred);
}

function hasDuplicateNames(tools: readonly ToolDefinition[]): boolean {
  const names = new Set<string>();
  for (const tool of tools) {
    const name = tool.declaration.name;
    if (names.has(name)) return true;
    names.add(name);
  }
  return false;
}

export function selectTools(tools: readonly ToolDefinition[], selection: ToolsetSelection): readonly ToolDefinition[] {
  if (!Number.isInteger(selection.maxTools) || selection.maxTools <= 0 || hasDuplicateNames(tools)) return [];
  const included = new Set(selection.include);
  if (included.size === 0) return [];
  const allowedScopes = new Set(selection.allowedScopes);
  const selected: ToolDefinition[] = [];
  for (const candidate of tools) {
    if (selected.length >= selection.maxTools) break;
    const tool = candidate as ToolMetadata;
    const policy = getToolPolicy(tool);
    if (!policy.available || !isAllowedByToolset(tool, included)) continue;
    const scope = tool.scope ?? policy.scope;
    if (allowedScopes.size > 0 && (!scope || !allowedScopes.has(scope))) continue;
    selected.push(candidate);
  }
  return Object.freeze(selected);
}
