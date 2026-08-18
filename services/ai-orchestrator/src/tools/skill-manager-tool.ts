import type { SkillActorContext, SkillMutationPort } from "../skills/types";
import type { ToolDefinition } from "./types";

export interface SkillManagerToolOptions {
  readonly actor: SkillActorContext;
  readonly mutation?: SkillMutationPort;
  readonly maxContentBytes?: number;
}

const MANAGER_POLICY = Object.freeze({
  available: true,
  riskTier: "high" as const,
  sideEffect: "write" as const,
  approval: "always" as const,
  concurrency: "sequential" as const,
  timeoutMs: 30_000,
  executionMode: "sequential" as const,
  scope: "skills:manage",
  requiresApproval: true,
});

function declaration() {
  return {
    name: "skill_manager",
    description: "Request a bounded skill create, update, or delete operation through an injected mutation port.",
    parameters: {
      type: "OBJECT" as const,
      properties: {
        action: { type: "STRING", description: "create, update, or delete" },
        name: { type: "STRING", description: "Safe skill name" },
        content: { type: "STRING", description: "Skill content for create or update" },
      },
      required: ["action", "name"],
    },
  };
}

function fallback(code: string, message: string): Record<string, unknown> {
  return { available: false, executed: false, code, message, manual_fallback: true };
}

export function createSkillManagerTool(options: SkillManagerToolOptions): ToolDefinition {
  return {
    declaration: declaration(),
    execute: async (args) => {
      if (!options.mutation) return fallback("skill_mutation_unavailable", "skill mutation is not configured; edit the skill through the manual administrative path");
      if (options.actor.canManageSkills !== true || !options.actor.allowedScopes.includes("skills:manage")) return fallback("skill_management_denied", "skill management requires an approved skills:manage actor scope");

      const action = args.action === "create" || args.action === "update" || args.action === "delete" ? args.action : undefined;
      const name = typeof args.name === "string" ? args.name.trim() : "";
      if (!action || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,64}$/u.test(name) || name.includes("..")) return fallback("skill_mutation_invalid", "skill action or name is invalid");
      const content = args.content === undefined ? undefined : typeof args.content === "string" ? args.content : "";
      const maxContentBytes = Number.isInteger(options.maxContentBytes) && (options.maxContentBytes as number) > 0 ? Math.min(options.maxContentBytes as number, 128_000) : 128_000;
      if (content !== undefined && Buffer.byteLength(content, "utf8") > maxContentBytes) return fallback("skill_content_too_large", "skill content exceeds the bounded mutation limit");
      if (content !== undefined && /^\s*(?:run|exec|shell|command|script|hook|install)\s*:/imu.test(content)) return fallback("skill_content_rejected", "executable skill directives are not accepted");
      try {
        return await options.mutation.mutate({ action, name, ...(content !== undefined ? { content } : {}) });
      } catch {
        return fallback("skill_mutation_failed", "skill mutation failed; complete the operation manually");
      }
    },
    policy: MANAGER_POLICY,
    toolset: "skills",
    scope: "skills:manage",
    summarize: (result) => result.executed === false ? "skill mutation unavailable" : "skill mutation requested",
  };
}
