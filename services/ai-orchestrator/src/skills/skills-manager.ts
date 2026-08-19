import type {
  SkillActorContext,
  SkillMutationInput,
  SkillMutationPort,
} from "./types";
import { validateSkillDocument, type SkillValidationResult } from "./skills-validator";

export class SkillsManagerError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "SkillsManagerError";
  }
}

export class SkillsManager {
  constructor(private readonly mutationPort?: SkillMutationPort) {}

  validate(content: string): SkillValidationResult {
    return validateSkillDocument(content);
  }

  async create(name: string, content: string, actorContext?: SkillActorContext): Promise<Record<string, unknown>> {
    this.assertPermission(actorContext, "create");
    const validation = this.validate(content);
    if (!validation.valid) {
      throw new SkillsManagerError("validation_failed", `Skill validation failed: ${validation.errors.join("; ")}`);
    }

    if (!this.mutationPort) {
      throw new SkillsManagerError("port_unavailable", "Skill mutation port is not configured");
    }

    const input: SkillMutationInput = { action: "create", name, content };
    return this.mutationPort.mutate(input);
  }

  async update(name: string, content: string, actorContext?: SkillActorContext): Promise<Record<string, unknown>> {
    this.assertPermission(actorContext, "update");
    const validation = this.validate(content);
    if (!validation.valid) {
      throw new SkillsManagerError("validation_failed", `Skill validation failed: ${validation.errors.join("; ")}`);
    }

    if (!this.mutationPort) {
      throw new SkillsManagerError("port_unavailable", "Skill mutation port is not configured");
    }

    const input: SkillMutationInput = { action: "update", name, content };
    return this.mutationPort.mutate(input);
  }

  async delete(name: string, actorContext?: SkillActorContext): Promise<Record<string, unknown>> {
    this.assertPermission(actorContext, "delete");

    if (!this.mutationPort) {
      throw new SkillsManagerError("port_unavailable", "Skill mutation port is not configured");
    }

    const input: SkillMutationInput = { action: "delete", name };
    return this.mutationPort.mutate(input);
  }

  private assertPermission(actorContext: SkillActorContext | undefined, action: string): void {
    if (!actorContext) return; // Unrestricted local mode
    if (actorContext.canManageSkills === false) {
      throw new SkillsManagerError("permission_denied", `Actor ${actorContext.actorId} cannot manage skills`);
    }
    if (!actorContext.allowedScopes.includes("skills:manage") && !actorContext.allowedScopes.includes("*")) {
      throw new SkillsManagerError("permission_denied", `Scope skills:manage is required to ${action} skills`);
    }
  }
}

export function createSkillsManager(mutationPort?: SkillMutationPort): SkillsManager {
  return new SkillsManager(mutationPort);
}
