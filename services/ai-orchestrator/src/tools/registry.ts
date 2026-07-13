import { createAnalyzeDrawingTool } from "./analyze_drawing";
import { createExportRabXlsxTool } from "./export_rab_xlsx";
import { createLookupAhspTool } from "./lookup_ahsp";
import { projectDiagnosticsTool } from "./project_diagnostics";
import { queryMaterialsTool } from "./query_materials";
import { queryProgressTool } from "./query_progress";
import { queryRabTool } from "./query_rab";
import { queryScheduleTool } from "./query_schedule";
import { createRunScenarioTool } from "./run_scenario";
import { createSearchKnowledgeTool } from "./search_knowledge";
import type { ToolDefinition } from "./types";

export function createToolRegistry(params: {
  coreEngineUrl: string;
  documentIntelligenceUrl: string;
  geminiApiKey?: string;
  fetchImpl?: typeof fetch;
}): ToolDefinition[] {
  const tools: ToolDefinition[] = [
    createLookupAhspTool(params),
    createRunScenarioTool(params),
    createAnalyzeDrawingTool(params),
    queryRabTool,
    queryScheduleTool,
    queryProgressTool,
    queryMaterialsTool,
    projectDiagnosticsTool,
    createExportRabXlsxTool(params),
  ];

  // search_knowledge butuh Gemini text-embedding-004 untuk query embedding --
  // Command Room (Lucent/Arete/Noir) tidak memakai Gemini. Tool ini tetap ada
  // di registry hanya kalau caller (mis. ai-orchestrator/src/routes/*.ts, yang
  // memang berbasis Gemini) secara eksplisit mengirim geminiApiKey.
  const apiKey = params.geminiApiKey || process.env.GEMINI_API_KEY || "";
  if (apiKey) {
    const dbApiUrl = process.env.DB_API_URL || "http://localhost:8001";
    tools.push(createSearchKnowledgeTool({ dbApiUrl, geminiApiKey: apiKey, fetchImpl: params.fetchImpl }));
  }

  return tools;
}
