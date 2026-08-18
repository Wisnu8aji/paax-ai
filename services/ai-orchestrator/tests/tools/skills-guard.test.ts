import { describe, expect, it } from "vitest";
import { guardSkillAccess } from "../../src/tools/skills-guard";
import type { SkillMetadata } from "../../src/skills/types";

const skill: SkillMetadata = { name: "review", version: "1.0.0", description: "Review", scope: "project", trust: "untrusted", trigger: "manual", allowedTools: ["file_read"], allowedScopes: ["workspace-read"], pinned: true };

describe("skill trust and capability guard", () => {
  it("requires project/actor scope intersection and returns bounded capability intersection", () => {
    expect(guardSkillAccess({ skill, actor: { actorId: "actor-1", projectId: "project-1", allowedScopes: ["workspace-read"], allowedTools: ["file_read", "file_search"] }, requestedProjectId: "project-1" })).toMatchObject({ ok: true, effectiveTools: ["file_read"], effectiveScopes: ["workspace-read"], trusted: false });
    expect(guardSkillAccess({ skill, actor: { actorId: "actor-1", projectId: "project-2", allowedScopes: ["workspace-read"], allowedTools: ["file_read"] }, requestedProjectId: "project-1" })).toMatchObject({ ok: false, errorCode: "project_mismatch" });
    expect(guardSkillAccess({ skill, actor: { actorId: "actor-1", projectId: "project-1", allowedScopes: ["other"], allowedTools: ["file_read"] }, requestedProjectId: "project-1" })).toMatchObject({ ok: false, errorCode: "scope_denied" });
  });
});
