import { describe, expect, it } from "vitest";
import {
  activityForTool,
  appendOrUpdateActivity,
  completeActiveActivities,
  type ActivityStep,
} from "./activity-timeline";

describe("Command Room activity timeline", () => {
  it("adds real process steps vertically without replacing earlier steps", () => {
    let steps: ActivityStep[] = [];
    steps = appendOrUpdateActivity(steps, {
      action: "complete",
      step: { id: "request", kind: "inspect", label: "Memeriksa permintaan" },
      timestamp: "2026-07-21T00:00:00.000Z",
    });
    steps = appendOrUpdateActivity(steps, {
      action: "start",
      step: { id: "tool:query_project_graph", kind: "graph", label: "Menelusuri evidence gambar kerja" },
      timestamp: "2026-07-21T00:00:01.000Z",
    });
    steps = appendOrUpdateActivity(steps, {
      action: "complete",
      step: { id: "tool:query_project_graph", kind: "graph", label: "Menelusuri evidence gambar kerja", detail: "hasil ditemukan" },
      timestamp: "2026-07-21T00:00:02.000Z",
    });

    expect(steps.map((step) => step.label)).toEqual([
      "Memeriksa permintaan",
      "Menelusuri evidence gambar kerja",
    ]);
    expect(steps[1]).toMatchObject({ state: "completed", detail: "hasil ditemukan" });
  });

  it("maps tools to contextual labels and icons instead of one generic template", () => {
    expect(activityForTool("query_project_graph")).toEqual({
      kind: "graph",
      label: "Menelusuri fakta dan evidence gambar kerja",
    });
    expect(activityForTool("lookup_ahsp").label).toContain("AHSP");
    expect(activityForTool("custom_check")).toEqual({
      kind: "tool",
      label: "Menjalankan custom check",
    });
  });

  it("completes active steps when the response finishes", () => {
    const result = completeActiveActivities([
      {
        id: "reason",
        kind: "reason",
        label: "Menganalisis evidence",
        state: "active",
        startedAt: "2026-07-21T00:00:00.000Z",
      },
    ], "2026-07-21T00:00:03.000Z");
    expect(result[0]).toMatchObject({ state: "completed", completedAt: "2026-07-21T00:00:03.000Z" });
  });
});
