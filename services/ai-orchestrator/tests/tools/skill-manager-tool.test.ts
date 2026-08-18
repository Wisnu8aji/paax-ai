import { describe, expect, it } from "vitest";
import { createSkillManagerTool } from "../../src/tools/skill-manager-tool";

describe("skill manager manual fallback", () => {
  it("does not pretend to mutate when no mutation port is injected", async () => {
    const tool = createSkillManagerTool({ actor: { actorId: "actor-1", allowedScopes: [], allowedTools: [] } });
    await expect(tool.execute({ action: "create", name: "new-skill" })).resolves.toMatchObject({ available: false, executed: false, code: "skill_mutation_unavailable", manual_fallback: true });
  });

  it("uses only the injected mutation port and keeps mutation policy explicit", async () => {
    const calls: unknown[] = [];
    const tool = createSkillManagerTool({ actor: { actorId: "actor-1", allowedScopes: ["skills:manage"], allowedTools: [], canManageSkills: true }, mutation: { mutate: async (input) => { calls.push(input); return { ok: true }; } } });
    await expect(tool.execute({ action: "create", name: "new-skill", content: "body" })).resolves.toMatchObject({ ok: true });
    expect(calls).toHaveLength(1);
    expect(tool.policy).toMatchObject({ sideEffect: "write", approval: "always" });
  });
});
