export type ActivityKind =
  | "inspect"
  | "context"
  | "search"
  | "graph"
  | "tool"
  | "reason"
  | "verify"
  | "compose"
  | "save"
  | "warning"
  | "complete";

export type ActivityState = "active" | "completed" | "warning" | "failed";

export interface ActivityStep {
  id: string;
  kind: ActivityKind;
  label: string;
  detail?: string;
  state: ActivityState;
  startedAt: string;
  completedAt?: string;
}

export interface ActivityEventPayload {
  action: "start" | "complete" | "update";
  step: {
    id: string;
    kind: ActivityKind;
    label: string;
    detail?: string;
    state?: ActivityState;
  };
  timestamp?: string;
}

const TOOL_ACTIVITY: Record<string, { kind: ActivityKind; label: string }> = {
  query_project_graph: { kind: "graph", label: "Menelusuri fakta dan evidence gambar kerja" },
  query_rab: { kind: "search", label: "Membaca snapshot RAB proyek" },
  query_schedule: { kind: "search", label: "Membaca jadwal proyek" },
  project_diagnostics: { kind: "verify", label: "Memeriksa konsistensi data proyek" },
  lookup_ahsp: { kind: "search", label: "Mencari kode dan uraian AHSP" },
  run_scenario: { kind: "tool", label: "Menjalankan simulasi deterministik" },
  export_rab_xlsx: { kind: "tool", label: "Menyiapkan file ekspor RAB" },
};

export function activityForTool(tool: string): { kind: ActivityKind; label: string } {
  return TOOL_ACTIVITY[tool] ?? { kind: "tool", label: `Menjalankan ${tool.replaceAll("_", " ")}` };
}

export function appendOrUpdateActivity(
  steps: ActivityStep[],
  event: ActivityEventPayload,
): ActivityStep[] {
  const at = event.timestamp ?? new Date().toISOString();
  const index = steps.findIndex((step) => step.id === event.step.id);
  const desiredState: ActivityState = event.step.state ?? (event.action === "complete" ? "completed" : "active");

  if (index < 0) {
    return [
      ...steps,
      {
        id: event.step.id,
        kind: event.step.kind,
        label: event.step.label,
        detail: event.step.detail,
        state: desiredState,
        startedAt: at,
        completedAt: event.action === "complete" ? at : undefined,
      },
    ];
  }

  const current = steps[index];
  const next = [...steps];
  next[index] = {
    ...current,
    kind: event.step.kind ?? current.kind,
    label: event.step.label || current.label,
    detail: event.step.detail ?? current.detail,
    state: desiredState,
    completedAt: event.action === "complete" || desiredState === "completed" ? at : current.completedAt,
  };
  return next;
}

export function completeActiveActivities(steps: ActivityStep[], at = new Date().toISOString()): ActivityStep[] {
  return steps.map((step) =>
    step.state === "active" ? { ...step, state: "completed", completedAt: at } : step,
  );
}

export function toolActivityId(tool: string): string {
  return `tool:${tool}`;
}

export function safeReasoningActivityId(): string {
  return "model:reasoning";
}
