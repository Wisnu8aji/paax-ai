import { describe, expect, it } from "vitest";
import { createSkillLoader } from "../../src/skills/loader";
import { createSkillsTools } from "../../src/tools/skills-tool";

describe("canonical skills tools", () => {
  it("exposes list and view as bounded read-only tool definitions", async () => {
    const loader = { list: async () => [{ name: "review", version: "1.0.0", description: "Review", scope: "project", trust: "untrusted", trigger: "manual", allowedTools: [], allowedScopes: [], pinned: true }], view: async () => ({ metadata: { name: "review", version: "1.0.0", description: "Review", scope: "project", trust: "untrusted", trigger: "manual", allowedTools: [], allowedScopes: [], pinned: true }, body: "untrusted body", trusted: false, provenance: { rootId: "project", relativePath: "review/SKILL.md", sha256: "a".repeat(64), bytes: 14 } }) } as unknown as ReturnType<typeof createSkillLoader>;
    const tools = createSkillsTools({ loader, actor: { actorId: "actor-1", projectId: "project-1", allowedScopes: [], allowedTools: [] } });

    expect(tools.map((tool) => tool.declaration.name)).toEqual(["skills_list", "skill_view"]);
    await expect(tools[0].execute({})).resolves.toMatchObject({ skills: [{ name: "review" }] });
    await expect(tools[1].execute({ name: "review" })).resolves.toMatchObject({ name: "review", body: "untrusted body", trusted: false });
    expect(tools.every((tool) => tool.policy?.sideEffect === "none" && tool.toolset === "skills")).toBe(true);
  });
});
