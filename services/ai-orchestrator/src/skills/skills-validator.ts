import { parseSkillDocument, SkillFormatError } from "./format";
import type { ParsedSkillDocument, SkillParseLimits } from "./format";

export interface SkillValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly parsed?: ParsedSkillDocument;
}

export class SkillsValidator {
  constructor(private readonly limits: SkillParseLimits = {}) {}

  validate(content: string): SkillValidationResult {
    const errors: string[] = [];

    if (!content || typeof content !== "string" || !content.trim()) {
      return {
        valid: false,
        errors: ["Skill document content cannot be empty"],
      };
    }

    try {
      const parsed = parseSkillDocument(content, this.limits);

      // Validate name structure
      if (!/^[a-z0-9][a-z0-9._-]{0,64}$/u.test(parsed.metadata.name)) {
        errors.push(`Skill name "${parsed.metadata.name}" must be lowercase alphanumeric with hyphens, underscores, or dots`);
      }

      // Check description length
      if (parsed.metadata.description.length < 5) {
        errors.push("Skill description is too short (must be at least 5 characters)");
      }

      // Check body length
      if (parsed.body.trim().length === 0) {
        errors.push("Skill body cannot be empty");
      }

      return {
        valid: errors.length === 0,
        errors: Object.freeze(errors),
        parsed: errors.length === 0 ? parsed : undefined,
      };
    } catch (err) {
      const message = err instanceof SkillFormatError ? err.message : String(err);
      return {
        valid: false,
        errors: [message],
      };
    }
  }
}

export function validateSkillDocument(content: string, limits?: SkillParseLimits): SkillValidationResult {
  return new SkillsValidator(limits).validate(content);
}
