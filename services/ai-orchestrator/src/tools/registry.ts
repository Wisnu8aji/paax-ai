import { createLookupAhspTool } from "./lookup_ahsp";
import { createRunScenarioTool } from "./run_scenario";
import type { ToolDefinition } from "./types";

export function createToolRegistry(params: {
  coreEngineUrl: string;
  fetchImpl?: typeof fetch;
}): ToolDefinition[] {
  return [
    createLookupAhspTool(params),
    createRunScenarioTool(params),
  ];
}
