import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  activityForTool,
  appendOrUpdateActivity,
  completeActiveActivities,
  safeReasoningActivityId,
} from "./activity-timeline";

function at(second: number): string {
  return `2026-07-21T10:00:${String(second).padStart(2, "0")}.000Z`;
}

describe("Arete observable activity contract", () => {
  it("builds a stacked, contextual trace without exposing raw reasoning", () => {
    let steps = [] as ReturnType<typeof completeActiveActivities>;
    steps = appendOrUpdateActivity(steps, {
      action: "complete",
      step: { id: "request:inspect", kind: "inspect", label: "Memeriksa permintaan, konteks, dan batasan" },
      timestamp: at(0),
    });
    steps = appendOrUpdateActivity(steps, {
      action: "complete",
      step: { id: "context:load", kind: "context", label: "Memuat konteks proyek dan sumber data aktif" },
      timestamp: at(1),
    });
    const graph = activityForTool("query_project_graph");
    steps = appendOrUpdateActivity(steps, {
      action: "start",
      step: { id: "tool:call-1", ...graph },
      timestamp: at(2),
    });
    steps = appendOrUpdateActivity(steps, {
      action: "complete",
      step: { id: "tool:call-1", ...graph, detail: "K2 ditemukan pada Lantai 2" },
      timestamp: at(3),
    });
    steps = appendOrUpdateActivity(steps, {
      action: "start",
      step: {
        id: safeReasoningActivityId(),
        kind: "reason",
        label: "Menganalisis konteks, evidence, dan kemungkinan jawaban",
        detail: "Menilai hubungan fakta, ketidakpastian, dan batas authority jawaban.",
      },
      timestamp: at(4),
    });
    steps = appendOrUpdateActivity(steps, {
      action: "complete",
      step: { id: safeReasoningActivityId(), kind: "reason", label: "Menganalisis konteks, evidence, dan kemungkinan jawaban" },
      timestamp: at(5),
    });
    steps = appendOrUpdateActivity(steps, {
      action: "complete",
      step: { id: "answer:verify", kind: "verify", label: "Memeriksa angka, authority, dan sumber evidence" },
      timestamp: at(6),
    });

    expect(steps.map((step) => step.label)).toEqual([
      "Memeriksa permintaan, konteks, dan batasan",
      "Memuat konteks proyek dan sumber data aktif",
      "Menelusuri fakta dan evidence gambar kerja",
      "Menganalisis konteks, evidence, dan kemungkinan jawaban",
      "Memeriksa angka, authority, dan sumber evidence",
    ]);
    expect(steps.every((step) => step.state === "completed")).toBe(true);
    expect(JSON.stringify(steps)).not.toContain("chain-of-thought");
    expect(JSON.stringify(steps)).not.toContain("raw reasoning token");
  });

  it("keeps repeated calls as separate rows when tool call ids differ", () => {
    const graph = activityForTool("query_project_graph");
    let steps = appendOrUpdateActivity([], {
      action: "complete", step: { id: "tool:call-1", ...graph }, timestamp: at(1),
    });
    steps = appendOrUpdateActivity(steps, {
      action: "complete", step: { id: "tool:call-2", ...graph }, timestamp: at(2),
    });
    expect(steps).toHaveLength(2);
  });

  it("renders the process timeline above the live answer and removes the cheap status summarizer", () => {
    const page = readFileSync(resolve(__dirname, "../../app/(dashboard)/command-room/page.tsx"), "utf8");
    const statusIndex = page.indexOf("<RunStatus run={run}");
    const answerIndex = page.indexOf("{run.answerBuffer &&", statusIndex);
    expect(statusIndex).toBeGreaterThan(0);
    expect(answerIndex).toBeGreaterThan(statusIndex);

    const route = readFileSync(resolve(__dirname, "../../app/api/command-room/chat/route.ts"), "utf8");
    expect(route).not.toContain("pendingStatusSummaries");
    expect(route).not.toContain("status-summarizer");
  });

});
