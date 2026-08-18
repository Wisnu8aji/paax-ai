export * from "./types";
export * from "./format";
export * from "./loader";

import type { SkillActorContext, SkillLoader } from "./types";
import type { SkillSummary as PromptSkillSummary } from "../agent/prompt-builder";
import { guardSkillAccess } from "../tools/skills-guard";

export function createSkillSummaryProvider(loader: SkillLoader, actor?: SkillActorContext) {
  return {
    async getSummaries(input: { maxItems: number; session?: unknown }): Promise<readonly PromptSkillSummary[]> {
      const summaries = await loader.list();
      const maxItems = Math.max(0, Math.min(Math.floor(input.maxItems), 100));
      const visible = actor
        ? summaries.filter((skill) => guardSkillAccess({ skill, actor, requestedProjectId: actor.projectId }).ok)
        : summaries;
      return visible.slice(0, maxItems).map((skill): PromptSkillSummary => ({
        skillId: skill.name,
        id: skill.name,
        name: skill.name,
        summary: skill.description.slice(0, 512),
        trigger: skill.trigger,
        detailRef: `skill:${skill.name}`,
      }));
    },
  };
}
