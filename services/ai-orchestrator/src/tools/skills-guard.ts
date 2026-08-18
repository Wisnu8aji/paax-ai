import type { SkillActorContext, SkillMetadata } from "../skills/types";

export interface SkillGuardInput {
  readonly skill: SkillMetadata;
  readonly actor: SkillActorContext;
  readonly requestedProjectId?: string;
}

export type SkillGuardResult =
  | {
      readonly ok: true;
      readonly effectiveTools: readonly string[];
      readonly effectiveScopes: readonly string[];
      readonly trusted: boolean;
    }
  | {
      readonly ok: false;
      readonly errorCode: "actor_invalid" | "project_mismatch" | "scope_denied" | "tool_denied" | "skill_quarantined";
      readonly message: string;
    };

function intersection(requested: readonly string[], allowed: readonly string[]): string[] {
  if (requested.length === 0) return [...allowed];
  const allowedSet = new Set(allowed);
  return requested.filter((item) => allowedSet.has(item));
}

/**
 * Applies the actor boundary to a skill's declared capabilities. This function
 * only returns an intersection; it never grants a capability absent from the
 * actor context and never executes skill content.
 */
export function guardSkillAccess(input: SkillGuardInput): SkillGuardResult {
  const { skill, actor, requestedProjectId } = input;
  if (!actor.actorId.trim()) return { ok: false, errorCode: "actor_invalid", message: "skill actor is invalid" };

  if (skill.scope === "project") {
    if (!actor.projectId || (requestedProjectId !== undefined && requestedProjectId !== actor.projectId)) {
      return { ok: false, errorCode: "project_mismatch", message: "skill project scope does not match the actor project" };
    }
  }

  if (skill.trust === "quarantined") return { ok: false, errorCode: "skill_quarantined", message: "quarantined skill content is unavailable" };

  const effectiveTools = intersection(skill.allowedTools, actor.allowedTools);
  const effectiveScopes = intersection(skill.allowedScopes, actor.allowedScopes);
  if (skill.allowedTools.length > 0 && effectiveTools.length === 0) {
    return { ok: false, errorCode: "tool_denied", message: "skill tool capabilities are outside the actor allowance" };
  }
  if (skill.allowedScopes.length > 0 && effectiveScopes.length === 0) {
    return { ok: false, errorCode: "scope_denied", message: "skill scopes are outside the actor allowance" };
  }

  return {
    ok: true,
    effectiveTools: Object.freeze(effectiveTools),
    effectiveScopes: Object.freeze(effectiveScopes),
    trusted: skill.trust === "trusted" && skill.pinned,
  };
}
