import { describe, expect, it } from "vitest";

import { buildAuditContextSections } from "./project-context";

describe("project audit context sections", () => {
  it("serializes BOE, warnings, and review tasks as read-only data sections", () => {
    const sections = buildAuditContextSections({
      boe: { assumptions: ["tinggi lantai dari user"], missing: ["HSD besi"] },
      warnings: [{ kode: "W1", pesan: "coverage rendah" }],
      reviewTasks: [{ id: "R1", target_ref: "K1", priority: 0.45 }],
    });

    const text = sections.join("\n\n");
    expect(text).toContain("== BOE ==");
    expect(text).toContain("tinggi lantai dari user");
    expect(text).toContain("== WARNINGS ==");
    expect(text).toContain("coverage rendah");
    expect(text).toContain("== REVIEW TASKS ==");
    expect(text).toContain("\"priority\":0.45");
  });
});
