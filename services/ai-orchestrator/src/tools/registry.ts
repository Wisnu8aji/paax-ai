import { createAnalyzeDrawingTool } from "./analyze_drawing";
import { createExportRabXlsxTool } from "./export_rab_xlsx";
import { createLookupAhspTool } from "./lookup_ahsp";
import { projectDiagnosticsTool } from "./project_diagnostics";
import { queryMaterialsTool } from "./query_materials";
import { queryProgressTool } from "./query_progress";
import { createQueryProjectGraphTool } from "./query_project_graph";
import { queryRabTool } from "./query_rab";
import { queryScheduleTool } from "./query_schedule";
import { createRunScenarioTool } from "./run_scenario";
import { createSearchKnowledgeTool } from "./search_knowledge";
import { createCommandRoomTools } from "./command-room";
import { createDelegateTool, type DelegateToolOptions } from "./delegate-tool";
import { createSkillManagerTool } from "./skill-manager-tool";
import { createSkillsTools, type SkillsToolOptions } from "./skills-tool";
import { withToolPolicy } from "./tool-policy";
import type { ToolDefinition, ToolPolicyMetadata } from "./types";

export type ToolRegistryMode = "canonical" | "legacy";

const READ_POLICY: ToolPolicyMetadata = {
  available: true,
  riskTier: "low",
  sideEffect: "read",
  approval: "never",
  concurrency: "safe",
  timeoutMs: 30_000,
  executionMode: "concurrent",
};

const DOMAIN_POLICIES: Record<string, ToolPolicyMetadata> = {
  lookup_ahsp: READ_POLICY,
  run_scenario: { ...READ_POLICY, sideEffect: "external", concurrency: "sequential", executionMode: "sequential" },
  analyze_drawing: { ...READ_POLICY, sideEffect: "external", concurrency: "sequential", executionMode: "sequential" },
  query_rab: READ_POLICY,
  query_schedule: READ_POLICY,
  query_progress: READ_POLICY,
  query_materials: READ_POLICY,
  query_project_graph: READ_POLICY,
  project_diagnostics: READ_POLICY,
  export_rab_xlsx: { available: true, riskTier: "high", sideEffect: "write", approval: "always", concurrency: "sequential", timeoutMs: 30_000, executionMode: "sequential" },
};

const COMMAND_ROOM_POLICIES: Record<string, ToolPolicyMetadata> = {
  todo: { available: true, riskTier: "low", sideEffect: "none", approval: "never", concurrency: "sequential", timeoutMs: 30_000, executionMode: "sequential" },
  workspace_list: READ_POLICY,
  file_read: READ_POLICY,
  file_search: READ_POLICY,
  terminal_run: { available: true, riskTier: "high", sideEffect: "external", approval: "on-risk", concurrency: "sequential", timeoutMs: 15_000, executionMode: "sequential" },
  tool_search: READ_POLICY,
  tool_describe: READ_POLICY,
  mcp_catalog: READ_POLICY,
  delegate_task: { available: false, riskTier: "critical", sideEffect: "external", approval: "always", concurrency: "sequential", timeoutMs: 30_000, executionMode: "sequential" },
};

const SKILLS_POLICIES: Record<string, ToolPolicyMetadata> = {
  skills_list: { ...READ_POLICY, sideEffect: "none", scope: "skills:read" },
  skill_view: { ...READ_POLICY, sideEffect: "none", scope: "skills:read" },
  skill_manager: { available: true, riskTier: "high", sideEffect: "write", approval: "always", concurrency: "sequential", timeoutMs: 30_000, executionMode: "sequential", scope: "skills:manage", requiresApproval: true },
};

function policyFor(tool: ToolDefinition, mode: ToolRegistryMode, delegateConfigured = false): ToolPolicyMetadata {
  const name = tool.declaration.name;
  if (mode === "canonical" && tool.toolset === "plugin") return tool.policy ?? { available: false, riskTier: "critical", sideEffect: "external", approval: "always", concurrency: "sequential", requiresApproval: true };
  if (mode === "legacy" && name === "search_knowledge") return { ...READ_POLICY, executionMode: "sequential" };
  if (mode === "canonical" && (tool.toolset === "mcp" || name.startsWith("mcp__"))) return tool.policy ?? { available: false, riskTier: "critical", sideEffect: "external", approval: "always", concurrency: "sequential", requiresApproval: true };
  const policy = mode === "canonical" && name === "delegate_task" && delegateConfigured
    ? { ...COMMAND_ROOM_POLICIES.delegate_task, available: true }
    : mode === "canonical" ? DOMAIN_POLICIES[name] ?? COMMAND_ROOM_POLICIES[name] ?? SKILLS_POLICIES[name] : DOMAIN_POLICIES[name];
  return policy ?? { available: false, riskTier: "critical", sideEffect: "external", approval: "always", concurrency: "sequential", timeoutMs: 30_000, executionMode: "sequential", requiresApproval: true };
}

export function createToolRegistry(params: {
  coreEngineUrl: string;
  documentIntelligenceUrl: string;
  geminiApiKey?: string;
  fetchImpl?: typeof fetch;
  workspaceRoot?: string;
  mode?: ToolRegistryMode;
  includeCommandRoom?: boolean;
  includeSearchKnowledge?: boolean;
  skills?: SkillsToolOptions;
  mcpTools?: readonly ToolDefinition[];
  mcpCatalog?: () => readonly Record<string, unknown>[];
  pluginTools?: readonly ToolDefinition[];
  delegate?: DelegateToolOptions;
  delegateTool?: ToolDefinition;
}): ToolDefinition[] {
  const mode = params.mode ?? "legacy";
  const domainTools: ToolDefinition[] = [
    createLookupAhspTool(params),
    createRunScenarioTool(params),
    createAnalyzeDrawingTool(params),
    queryRabTool,
    queryScheduleTool,
    queryProgressTool,
    queryMaterialsTool,
    createQueryProjectGraphTool(params),
    projectDiagnosticsTool,
    createExportRabXlsxTool(params),
  ];
  const tools = [...domainTools];

  if (mode === "canonical" && params.includeCommandRoom !== false) {
    const delegateTool = params.delegateTool ?? (params.delegate ? createDelegateTool(params.delegate) : undefined);
    tools.push(...createCommandRoomTools({ workspaceRoot: params.workspaceRoot, delegateTool, mcpCatalog: params.mcpCatalog }));
  }

  if (mode === "canonical" && params.skills) {
    tools.push(...createSkillsTools(params.skills), createSkillManagerTool(params.skills));
  }

  if (mode === "canonical" && params.mcpTools) tools.push(...params.mcpTools);
  if (mode === "canonical" && params.pluginTools) tools.push(...params.pluginTools);

  // search_knowledge butuh Gemini text-embedding-004 untuk query embedding --
  // Command Room (Lucent/Arete/Noir) tidak memakai Gemini. Tool ini tetap ada
  // di registry hanya kalau caller (mis. ai-orchestrator/src/routes/*.ts, yang
  // memang berbasis Gemini) secara eksplisit mengirim geminiApiKey.
  const apiKey = params.geminiApiKey || process.env.GEMINI_API_KEY || "";
  if (mode === "legacy" && params.includeSearchKnowledge !== false && apiKey) {
    const dbApiUrl = process.env.DB_API_URL || "http://localhost:8001";
    tools.push(createSearchKnowledgeTool({ dbApiUrl, geminiApiKey: apiKey, fetchImpl: params.fetchImpl }));
  }

  const names = new Set<string>();
  for (const tool of tools) {
    const name = tool.declaration.name;
    if (names.has(name)) throw new Error(`duplicate canonical tool registration: ${name}`);
    names.add(name);
  }
  return tools.map((tool) => withToolPolicy(tool, policyFor(tool, mode, Boolean(params.delegateTool ?? params.delegate))));
}
