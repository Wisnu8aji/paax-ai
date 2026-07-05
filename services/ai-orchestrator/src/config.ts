export const GEMINI_MODEL = "gemini-2.5-flash";

export interface AppConfig {
  port: number;
  geminiApiKey: string;
  coreEngineUrl: string;
  maxToolTurns: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: Number(env.PORT || 8082),
    geminiApiKey: env.GEMINI_API_KEY?.trim() ?? "",
    coreEngineUrl: (env.CORE_ENGINE_URL || "http://localhost:8081").replace(/\/+$/, ""),
    maxToolTurns: Number(env.AI_ORCH_MAX_TOOL_TURNS || 3),
  };
}
