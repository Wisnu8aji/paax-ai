import type { SkillActorContext, SkillLoader } from "../skills/types";
import type { ToolDefinition, ToolExecutionParams } from "./types";
import { guardSkillAccess } from "./skills-guard";

export interface SkillsToolOptions {
  readonly loader: SkillLoader;
  readonly actor: SkillActorContext;
  readonly requestedProjectId?: string;
  readonly maxItems?: number;
  readonly maxBodyBytes?: number;
}

const READ_POLICY = Object.freeze({
  available: true,
  riskTier: "low" as const,
  sideEffect: "none" as const,
  approval: "never" as const,
  concurrency: "safe" as const,
  timeoutMs: 30_000,
  executionMode: "concurrent" as const,
  scope: "skills:read",
});

function declaration(name: string, description: string, properties: Record<string, unknown>, required?: string[]) {
  return { name, description, parameters: { type: "OBJECT" as const, properties, ...(required ? { required } : {}) } };
}

function boundedItems(value: number | undefined): number {
  return Number.isInteger(value) && (value as number) > 0 ? Math.min(value as number, 100) : 50;
}

function fallback(code: string, message: string): Record<string, unknown> {
  return { available: false, executed: false, code, message, manual_fallback: true };
}

function failureCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") return error.code.slice(0, 80);
  return "skill_unavailable";
}

export function createSkillsTools(options: SkillsToolOptions): ToolDefinition[] {
  const listTool: ToolDefinition = {
    declaration: declaration("skills_list", "List bounded metadata for available skills; skill bodies are not loaded.", { max_items: { type: "INTEGER", description: "Maximum metadata entries to return." } }),
    execute: async (args) => {
      try {
        const summaries = await options.loader.list();
        const maxItems = boundedItems(typeof args.max_items === "number" ? args.max_items : options.maxItems);
        const skills = summaries
          .filter((skill) => guardSkillAccess({ skill, actor: options.actor, requestedProjectId: options.requestedProjectId }).ok)
          .slice(0, maxItems)
          .map((skill) => ({ ...skill }));
        return { skills, truncated: summaries.length > skills.length };
      } catch (error) {
        return fallback(failureCode(error), "skill metadata is unavailable; inspect the configured skill directory manually");
      }
    },
    policy: READ_POLICY,
    toolset: "skills",
    scope: "skills:read",
    summarize: (result) => `${Array.isArray(result.skills) ? result.skills.length : 0} skill metadata entries`,
  };

  const viewTool: ToolDefinition = {
    declaration: declaration("skill_view", "View one bounded skill body after actor, project, and trust checks.", { name: { type: "STRING", description: "Safe skill name." }, max_body_bytes: { type: "INTEGER", description: "Maximum body bytes." } }, ["name"]),
    execute: async (args, params?: ToolExecutionParams) => {
      const name = typeof args.name === "string" ? args.name.trim() : "";
      if (!name) return fallback("skill_name_invalid", "a safe skill name is required");
      try {
        const skill = await options.loader.view({ name, maxBodyBytes: typeof args.max_body_bytes === "number" ? Math.min(Math.max(1, Math.floor(args.max_body_bytes)), options.maxBodyBytes ?? 128_000) : options.maxBodyBytes, signal: params?.signal });
        const access = guardSkillAccess({ skill: skill.metadata, actor: options.actor, requestedProjectId: options.requestedProjectId });
        if (!access.ok) return fallback(access.errorCode, access.message);
        return { name: skill.metadata.name, metadata: skill.metadata, body: skill.body, trusted: skill.trusted && access.trusted, provenance: skill.provenance };
      } catch (error) {
        return fallback(failureCode(error), "skill body is unavailable; use the manual skill inspection path");
      }
    },
    policy: READ_POLICY,
    toolset: "skills",
    scope: "skills:read",
    summarize: (result) => typeof result.body === "string" ? "skill body viewed" : "skill body unavailable",
  };

  return [listTool, viewTool];
}
