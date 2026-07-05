import type { ChatContext, ScheduleSnapshot, ScheduleTaskSnapshot, ToolDefinition } from "./types";

const MISSING_SCHEDULE_MESSAGE = "Data jadwal tidak tersedia di konteks percakapan ini - user perlu membuka halaman jadwal proyek dulu.";

function isScheduleSnapshot(value: unknown): value is ScheduleSnapshot {
  return Boolean(
    value
    && typeof value === "object"
    && Array.isArray((value as { tasks?: unknown }).tasks)
    && typeof (value as { project_duration_days?: unknown }).project_duration_days === "number",
  );
}

function executeQuerySchedule(args: Record<string, unknown>, context?: ChatContext): Record<string, unknown> {
  const schedule = context?.schedule;
  if (!isScheduleSnapshot(schedule)) {
    return { available: false, message: MISSING_SCHEDULE_MESSAGE };
  }
  const filter = typeof args.item_code === "string" ? args.item_code.toLowerCase() : "";
  const tasks = filter
    ? schedule.tasks.filter((task: ScheduleTaskSnapshot) => task.id.toLowerCase().includes(filter) || task.name.toLowerCase().includes(filter))
    : schedule.tasks;
  return {
    available: true,
    project_duration_days: schedule.project_duration_days,
    project_start_date: schedule.project_start_date,
    project_end_date: schedule.project_end_date,
    tasks,
    total_tasks: tasks.length,
    critical_path: schedule.critical_path,
  };
}

export const queryScheduleTool: ToolDefinition = {
  declaration: {
    name: "query_schedule",
    description: "Baca snapshot jadwal yang dikirim caller di context percakapan.",
    parameters: {
      type: "OBJECT",
      properties: {
        item_code: { type: "STRING", description: "Filter id atau nama task jadwal, opsional" },
      },
    },
  },
  execute: async (args, params) => executeQuerySchedule(args, params?.context),
  summarize: (result) => {
    if (result.available === false) return "data jadwal tidak tersedia";
    return `${String(result.total_tasks ?? 0)} task jadwal ditemukan`;
  },
};
