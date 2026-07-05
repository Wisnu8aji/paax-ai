import { createAnalyzeDrawingTool } from "./analyze_drawing";
import { createLookupAhspTool } from "./lookup_ahsp";
import { queryMaterialsTool } from "./query_materials";
import { queryProgressTool } from "./query_progress";
import { queryRabTool } from "./query_rab";
import { queryScheduleTool } from "./query_schedule";
import { createRunScenarioTool } from "./run_scenario";
import type { ToolDefinition } from "./types";

export function createToolRegistry(params: {
  coreEngineUrl: string;
  documentIntelligenceUrl: string;
  fetchImpl?: typeof fetch;
}): ToolDefinition[] {
  return [
    createLookupAhspTool(params),
    createRunScenarioTool(params),
    createAnalyzeDrawingTool(params),
    queryRabTool,
    queryScheduleTool,
    queryProgressTool,
    queryMaterialsTool,
  ];
}
