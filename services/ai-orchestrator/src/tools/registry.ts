import { createAnalyzeDrawingTool } from "./analyze_drawing";
import { createLookupAhspTool } from "./lookup_ahsp";
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
  const dbApiUrl = process.env.DB_API_URL || "http://localhost:8001";
  const apiKey = params.geminiApiKey || process.env.GEMINI_API_KEY || "";
  return [
    createLookupAhspTool(params),
    createRunScenarioTool(params),
    createAnalyzeDrawingTool(params),
    queryRabTool,
    queryScheduleTool,
    queryProgressTool,
    queryMaterialsTool,
    createSearchKnowledgeTool({
      dbApiUrl,
      geminiApiKey: apiKey,
      fetchImpl: params.fetchImpl
    }),
  ];
}
