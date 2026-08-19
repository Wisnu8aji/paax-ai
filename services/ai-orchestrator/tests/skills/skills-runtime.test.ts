import { describe, expect, it } from "vitest";
import { createSkillsRuntime } from "../../src/skills/skills-runtime";
import type { LoadedSkill, SkillLoader, SkillSummary } from "../../src/skills/types";

describe("PAAX Skills Runtime (paax-skills)", () => {
  const sampleSummary: SkillSummary = {
    name: "rab",
    version: "1.0.0",
    description: "RAB Estimator",
    scope: "system",
    trust: "trusted",
    trigger: "explicit",
    allowedTools: ["lookup_ahsp"],
    allowedScopes: [],
    pinned: true,
    provenance: { rootId: "root", relativePath: "rab/SKILL.md", sha256: "123", bytes: 50 },
  };

  const mockLoader: SkillLoader = {
    list: async () => [sampleSummary],
    view: async (input) => {
      const name = typeof input === "string" ? input : input.name;
      const loaded: LoadedSkill = {
        metadata: sampleSummary,
        body: `# Skill instructions for ${name}`,
        trusted: true,
        provenance: sampleSummary.provenance,
      };
      return loaded;
    },
  };

  it("generates compact skill index for progressive disclosure", async () => {
    const runtime = createSkillsRuntime(mockLoader);
    const prompts = await runtime.generateDisclosurePrompts();

    expect(prompts.skillIndexSnippet).toContain("**rab** (v1.0.0): RAB Estimator");
    expect(prompts.activeSkillInstructions).toBe("");
  });

  it("activates skill and injects full instructions", async () => {
    const runtime = createSkillsRuntime(mockLoader);
    await runtime.activateSkill("rab");

    const activeSkills = runtime.getActiveSkills();
    expect(activeSkills.length).toBe(1);
    expect(activeSkills[0].metadata.name).toBe("rab");

    const prompts = await runtime.generateDisclosurePrompts();
    expect(prompts.activeSkillInstructions).toContain("### Skill: rab (v1.0.0)");
    expect(prompts.activeSkillInstructions).toContain("# Skill instructions for rab");
  });
});
