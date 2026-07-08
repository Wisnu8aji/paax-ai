import type { GeminiFunctionDeclaration } from "../gemini/types";

export interface RabLineSnapshot {
  id: string;
  ahsp_code: string;
  volume: number | null;
  duration_days: number | null;
  ahsp_suggested?: boolean;
}

export interface ScheduleTaskSnapshot {
  id: string;
  name: string;
  duration_days: number;
  early_start: number;
  early_finish: number;
  late_start: number;
  late_finish: number;
  total_float: number;
  is_critical: boolean;
  start_date: string;
  end_date: string;
}

export interface ScheduleSnapshot {
  project_duration_days: number;
  project_start_date: string;
  project_end_date: string;
  tasks: ScheduleTaskSnapshot[];
  critical_path: string[];
  s_curve: Record<string, unknown> | null;
}

export interface ChatContext {
  project_id?: string;
  conversation_id?: string;
  rab_lines?: RabLineSnapshot[];
  schedule?: ScheduleSnapshot | Record<string, unknown>;
}

export interface ToolExecutionParams {
  context?: ChatContext;
}

export interface ToolDefinition {
  declaration: GeminiFunctionDeclaration;
  execute: (args: Record<string, unknown>, params?: ToolExecutionParams) => Promise<Record<string, unknown>> | Record<string, unknown>;
  summarize?: (result: Record<string, unknown>) => string;
}

export function summarizeResult(result: Record<string, unknown>): string {
  if (typeof result.error === "string") return `error: ${result.error}`;
  if (Array.isArray(result.candidates)) return `${result.candidates.length} kandidat ditemukan`;
  if (typeof result.available === "boolean") return result.available ? "data tersedia" : "data tidak tersedia";
  return "hasil tool diterima";
}
