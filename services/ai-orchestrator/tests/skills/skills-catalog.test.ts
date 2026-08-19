import { describe, expect, it } from "vitest";
import { createSkillsCatalog } from "../../src/skills/skills-catalog";
import type { LoadedSkill, SkillLoader, SkillSummary } from "../../src/skills/types";

describe("PAAX Skills Catalog (paax-skills)", () => {
  const mockSummaries: readonly SkillSummary[] = [
    {
      name: "rab",
      version: "1.0.0",
      description: "RAB construction cost estimation",
      scope: "system",
      trust: "trusted",
      trigger: "explicit",
      allowedTools: ["lookup_ahsp"],
      allowedScopes: ["construction:rab"],
      pinned: true,
      provenance: { rootId: "root1", relativePath: "rab/SKILL.md", sha256: "abc", bytes: 100 },
    },
    {
      name: "custom-tool",
      version: "0.1.0",
      description: "Custom project helper",
      scope: "project",
      trust: "untrusted",
      trigger: "manual",
      allowedTools: [],
      allowedScopes: [],
      pinned: false,
      provenance: { rootId: "root2", relativePath: "custom-tool/SKILL.md", sha256: "def", bytes: 50 },
    },
  ];

  const mockLoader: SkillLoader = {
    list: async () => mockSummaries,
    view: async (input) => {
      const name = typeof input === "string" ? input : input.name;
      const s = mockSummaries.find((item) => item.name === name);
      if (!s) throw new Error("Skill not found");
      const loaded: LoadedSkill = {
        metadata: s,
        body: `# Instructions for ${s.name}`,
        trusted: s.trust === "trusted" && s.pinned,
        provenance: s.provenance,
      };
      return loaded;
    },
  };

  it("lists skills with search query and scope filtering", async () => {
    const catalog = createSkillsCatalog(mockLoader);

    const all = await catalog.list();
    expect(all.length).toBe(2);

    const rabOnly = await catalog.list({ query: "cost estimation" });
    expect(rabOnly.length).toBe(1);
    expect(rabOnly[0].name).toBe("rab");

    const systemOnly = await catalog.list({ scope: "system" });
    expect(systemOnly.length).toBe(1);
    expect(systemOnly[0].name).toBe("rab");
  });

  it("retrieves full loaded skill by name", async () => {
    const catalog = createSkillsCatalog(mockLoader);
    const loaded = await catalog.get("rab");

    expect(loaded.metadata.name).toBe("rab");
    expect(loaded.body).toContain("# Instructions for rab");
    expect(loaded.trusted).toBe(true);
  });
});
