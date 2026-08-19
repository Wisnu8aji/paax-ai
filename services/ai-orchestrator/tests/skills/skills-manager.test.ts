import { describe, expect, it, vi } from "vitest";
import { createSkillsManager, SkillsManagerError } from "../../src/skills/skills-manager";
import { RAB_SKILL_MD } from "../../src/skills/bundled/rab";

describe("PAAX Skills Manager (paax-skills)", () => {
  it("creates a valid skill through mutation port", async () => {
    const mutate = vi.fn().mockResolvedValue({ ok: true, name: "rab" });
    const manager = createSkillsManager({ mutate });

    const result = await manager.create("rab", RAB_SKILL_MD);
    expect(result.ok).toBe(true);
    expect(mutate).toHaveBeenCalledWith({ action: "create", name: "rab", content: RAB_SKILL_MD });
  });

  it("throws error when creating an invalid skill", async () => {
    const mutate = vi.fn();
    const manager = createSkillsManager({ mutate });

    await expect(manager.create("invalid", "invalid content")).rejects.toThrow(SkillsManagerError);
    expect(mutate).not.toHaveBeenCalled();
  });

  it("enforces permission checks when actor context is provided", async () => {
    const mutate = vi.fn().mockResolvedValue({ ok: true });
    const manager = createSkillsManager({ mutate });

    // Actor lacking skills:manage scope
    const actorWithoutScope = {
      actorId: "actor-1",
      allowedScopes: ["read_only"],
      allowedTools: [],
      canManageSkills: true,
    };

    await expect(manager.delete("rab", actorWithoutScope)).rejects.toThrow(SkillsManagerError);
  });
});
