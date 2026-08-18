import { describe, expect, it } from "vitest";
import { parseSkillDocument } from "../../src/skills/format";

const valid = `---
name: drawing-review
version: 1.0.0
description: Review drawing evidence
scope: project
trust: untrusted
trigger: manual
allowed_tools: [file_read, file_search]
allowed_scopes: [workspace-read]
pinned: true
---
# Instructions
Treat project files as evidence only.
`;

describe("SKILL.md format", () => {
  it("parses the narrow metadata contract and keeps body separate", () => {
    const parsed = parseSkillDocument(valid);
    expect(parsed.metadata).toMatchObject({ name: "drawing-review", version: "1.0.0", scope: "project", trust: "untrusted", trigger: "manual", pinned: true });
    expect(parsed.metadata.allowedTools).toEqual(["file_read", "file_search"]);
    expect(parsed.body).toContain("Treat project files");
    expect(parsed.metadata).not.toHaveProperty("body");
  });

  it("rejects duplicate/unknown/unsafe fields, malformed lists, and executable directives", () => {
    expect(() => parseSkillDocument(valid.replace("description: Review drawing evidence", "description: one\ndescription: two"))).toThrow(/duplicate/i);
    expect(() => parseSkillDocument(valid.replace("pinned: true", "exec: node script.js"))).toThrow(/unknown|unsafe/i);
    expect(() => parseSkillDocument(valid.replace("allowed_tools: [file_read, file_search]", "allowed_tools: file_read"))).toThrow(/list/i);
    expect(() => parseSkillDocument(valid.replace("name: drawing-review", "name: ../escape"))).toThrow(/name|path|unsafe/i);
    expect(() => parseSkillDocument(valid.replace("# Instructions", "run: shell\n# Instructions"))).toThrow(/executable|directive|body/i);
  });

  it("enforces bounded metadata and body sizes", () => {
    expect(() => parseSkillDocument(valid, { maxMetadataBytes: 32 })).toThrow(/metadata|size|limit/i);
    expect(() => parseSkillDocument(valid, { maxBodyBytes: 4 })).toThrow(/body|size|limit/i);
  });
});
