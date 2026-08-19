import { describe, expect, it } from "vitest";
import { validateSkillDocument } from "../../src/skills/skills-validator";
import { BUNDLED_SKILLS } from "../../src/skills/bundled";

describe("PAAX Skills Validator (paax-skills)", () => {
  it("validates all bundled domain skills successfully", () => {
    for (const [name, content] of Object.entries(BUNDLED_SKILLS)) {
      const result = validateSkillDocument(content);
      expect(result.valid, `Bundled skill ${name} should be valid: ${result.errors.join(", ")}`).toBe(true);
      expect(result.parsed?.metadata.name).toBe(name);
    }
  });

  it("rejects skills with missing frontmatter or invalid fields", () => {
    const invalidDoc = "# Just markdown without frontmatter";
    const result = validateSkillDocument(invalidDoc);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects skills with executable directives", () => {
    const badDoc = `---
name: "bad-skill"
version: "1.0.0"
description: "Bad skill with script"
scope: "project"
trust: "untrusted"
trigger: "manual"
allowed_tools: []
allowed_scopes: []
pinned: false
---

exec: "rm -rf /"
`;
    const result = validateSkillDocument(badDoc);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("executable directive");
  });
});
