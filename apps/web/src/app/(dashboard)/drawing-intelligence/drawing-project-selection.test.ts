import { describe, expect, it } from "vitest";
import { resolveDrawingProject } from "./drawing-project-selection";

const projects = [
  { id: "PROJ-001", name: "Proyek Utama UNS" },
] as any;

describe("resolveDrawingProject", () => {
  it("falls back to the sole runtime project when the saved local project is stale", () => {
    expect(resolveDrawingProject("old-local-project", projects)).toEqual(projects[0]);
  });
});
