import { describe, expect, it } from "vitest";

import { queryScheduleTool } from "../../src/tools/query_schedule";

const schedule = {
  project_duration_days: 10,
  project_start_date: "2026-07-01",
  project_end_date: "2026-07-12",
  tasks: [
    {
      id: "T1",
      name: "Kolom",
      duration_days: 4,
      early_start: 0,
      early_finish: 4,
      late_start: 0,
      late_finish: 4,
      total_float: 0,
      is_critical: true,
      start_date: "2026-07-01",
      end_date: "2026-07-04",
    },
    {
      id: "T2",
      name: "Balok",
      duration_days: 6,
      early_start: 4,
      early_finish: 10,
      late_start: 4,
      late_finish: 10,
      total_float: 0,
      is_critical: true,
      start_date: "2026-07-06",
      end_date: "2026-07-12",
    },
  ],
  critical_path: ["T1", "T2"],
  s_curve: null,
};

describe("query_schedule", () => {
  it("returns filtered schedule task from chat context", async () => {
    const result = await queryScheduleTool.execute({ item_code: "T2" }, { context: { schedule } });

    expect(result).toEqual({
      available: true,
      project_duration_days: 10,
      project_start_date: "2026-07-01",
      project_end_date: "2026-07-12",
      tasks: [schedule.tasks[1]],
      total_tasks: 1,
      critical_path: ["T1", "T2"],
    });
  });

  it("returns unavailable when schedule context is missing", async () => {
    await expect(queryScheduleTool.execute({}, { context: {} })).resolves.toEqual({
      available: false,
      message: "Data jadwal tidak tersedia di konteks percakapan ini - user perlu membuka halaman jadwal proyek dulu.",
    });
  });

  it("returns available empty tasks when filter has no matches", async () => {
    const result = await queryScheduleTool.execute({ item_code: "T99" }, { context: { schedule } });

    expect(result).toEqual({
      available: true,
      project_duration_days: 10,
      project_start_date: "2026-07-01",
      project_end_date: "2026-07-12",
      tasks: [],
      total_tasks: 0,
      critical_path: ["T1", "T2"],
    });
  });
});
