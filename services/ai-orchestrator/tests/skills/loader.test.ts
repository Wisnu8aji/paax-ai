import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSkillLoader } from "../../src/skills/loader";

const document = (name: string, body: string) => `---
name: ${name}
version: 1.0.0
description: ${name} skill
scope: project
trust: untrusted
trigger: manual
allowed_tools: [file_read]
allowed_scopes: [workspace-read]
pinned: true
---
${body}
`;

async function withRoot(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "paax-skills-"));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}

describe("skill loader progressive disclosure", () => {
  it("lists bounded metadata without loading the full body, then views body by safe name", async () => {
    await withRoot(async (root) => {
      await mkdir(join(root, "drawing-review"));
      await writeFile(join(root, "drawing-review", "SKILL.md"), document("drawing-review", "BODY-SECRET-MARKER"), "utf8");
      const loader = createSkillLoader({ roots: [{ id: "project", root }] });

      const summaries = await loader.list();
      expect(summaries).toHaveLength(1);
      expect(summaries[0]).toMatchObject({ name: "drawing-review", description: "drawing-review skill" });
      expect(JSON.stringify(summaries)).not.toContain("BODY-SECRET-MARKER");

      const viewed = await loader.view({ name: "drawing-review" });
      expect(viewed.body).toContain("BODY-SECRET-MARKER");
      expect(viewed.provenance).toMatchObject({ rootId: "project", relativePath: "drawing-review/SKILL.md" });
      expect(viewed.trusted).toBe(false);
    });
  });

  it("rejects traversal, missing roots, duplicate names, and oversized bodies", async () => {
    await withRoot(async (root) => {
      await mkdir(join(root, "one"));
      await mkdir(join(root, "two"));
      await writeFile(join(root, "one", "SKILL.md"), document("same", "one"), "utf8");
      await writeFile(join(root, "two", "SKILL.md"), document("same", "two"), "utf8");
      const duplicateLoader = createSkillLoader({ roots: [{ id: "project", root }] });
      await expect(duplicateLoader.list()).rejects.toThrow(/duplicate/i);
      await expect(duplicateLoader.view({ name: "../one" })).rejects.toThrow(/path|name|unsafe/i);

      const oversizedRoot = await mkdtemp(join(tmpdir(), "paax-skill-large-"));
      try {
        await mkdir(join(oversizedRoot, "large"));
        await writeFile(join(oversizedRoot, "large", "SKILL.md"), document("large", "123456789"), "utf8");
        const loader = createSkillLoader({ roots: [{ id: "large", root: oversizedRoot }], maxBodyBytes: 4 });
        await expect(loader.view({ name: "large" })).rejects.toThrow(/body|size|limit/i);
      } finally {
        await rm(oversizedRoot, { recursive: true, force: true });
      }
    });
  });
});
