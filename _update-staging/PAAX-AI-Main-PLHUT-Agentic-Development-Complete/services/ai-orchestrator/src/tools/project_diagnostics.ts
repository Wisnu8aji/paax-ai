import type { ChatContext, RabLineSnapshot, ScheduleTaskSnapshot, ToolDefinition } from "./types";

const MISSING_MESSAGE = "Data RAB dan/atau jadwal tidak tersedia di konteks percakapan ini - user perlu membuka halaman RAB dan jadwal proyek dulu.";

/**
 * paax-project-diagnostics (blueprint §7.6) -- root-cause analysis lintas
 * RAB/jadwal DALAM SATU snapshot. core-engine TIDAK punya versioning RAB
 * (RabDraft = satu record per project_id, bukan riwayat revisi), jadi tool ini
 * TIDAK bisa "kenapa RAB revisi ini naik" (butuh data historis yang tidak ada)
 * -- itu di luar cakupan realistis tanpa membangun sistem versioning baru.
 * Yang benar-benar bisa dikerjakan dengan data yang ada: cross-check
 * konsistensi RAB vs jadwal pada satu snapshot (item RAB tanpa AHSP/volume,
 * task kritis tanpa float, dst). Ini bukan tool baru yang memanggil core-engine
 * -- murni analisis di atas hasil query_rab + query_schedule yang sudah ada.
 */
async function fetchRabLines(context?: ChatContext): Promise<RabLineSnapshot[] | null> {
  let lines = context?.rab_lines;
  const dbUrl = process.env.DB_API_URL;
  const projectId = context?.project_id;
  if (dbUrl && projectId) {
    try {
      const res = await fetch(`${dbUrl}/projects/${projectId}/rab`);
      if (res.ok) {
        const data = await res.json();
        if (data.payload && Array.isArray(data.payload.lines)) lines = data.payload.lines;
      }
    } catch { /* fallback ke context */ }
  }
  return lines && lines.length > 0 ? lines : null;
}

async function fetchScheduleTasks(context?: ChatContext): Promise<ScheduleTaskSnapshot[] | null> {
  let schedule = context?.schedule;
  const dbUrl = process.env.DB_API_URL;
  const projectId = context?.project_id;
  if (dbUrl && projectId) {
    try {
      const res = await fetch(`${dbUrl}/projects/${projectId}/tkg`);
      if (res.ok) {
        const data = await res.json();
        const payload = data.payload;
        if (payload?.lastTakeoff?.schedule) schedule = payload.lastTakeoff.schedule;
        else if (payload?.schedule) schedule = payload.schedule;
      }
    } catch { /* fallback ke context */ }
  }
  const tasks = (schedule as { tasks?: unknown } | undefined)?.tasks;
  return Array.isArray(tasks) && tasks.length > 0 ? (tasks as ScheduleTaskSnapshot[]) : null;
}

interface DiagnosticFinding {
  severity: "info" | "warning";
  category: string;
  message: string;
}

function diagnoseRabConsistency(lines: RabLineSnapshot[]): DiagnosticFinding[] {
  const findings: DiagnosticFinding[] = [];
  const missingAhsp = lines.filter((l) => !l.ahsp_code || l.ahsp_code.trim() === "");
  if (missingAhsp.length > 0) {
    findings.push({
      severity: "warning", category: "rab_incomplete",
      message: `${missingAhsp.length} baris RAB belum punya kode AHSP -- estimasi biaya untuk baris ini belum bisa dihitung engine.`,
    });
  }
  const missingVolume = lines.filter((l) => l.volume === null || l.volume === undefined);
  if (missingVolume.length > 0) {
    findings.push({
      severity: "warning", category: "rab_incomplete",
      message: `${missingVolume.length} baris RAB belum punya volume -- item ini belum bisa masuk simulasi run_scenario.`,
    });
  }
  const suggestedNotConfirmed = lines.filter((l) => l.ahsp_suggested === true);
  if (suggestedNotConfirmed.length > 0) {
    findings.push({
      severity: "info", category: "rab_review",
      message: `${suggestedNotConfirmed.length} baris RAB memakai kode AHSP usulan AI (belum dikonfirmasi manual) -- disarankan direview sebelum RAB difinalkan.`,
    });
  }
  return findings;
}

function diagnoseScheduleConsistency(tasks: ScheduleTaskSnapshot[], criticalPath: string[]): DiagnosticFinding[] {
  const findings: DiagnosticFinding[] = [];
  const criticalWithoutFloat = tasks.filter((t) => criticalPath.includes(t.id) && t.total_float > 0);
  if (criticalWithoutFloat.length > 0) {
    findings.push({
      severity: "warning", category: "schedule_inconsistent",
      message: `${criticalWithoutFloat.length} task ditandai jalur kritis tapi punya total_float > 0 -- kemungkinan data jadwal tidak konsisten, perlu recompute CPM.`,
    });
  }
  const zeroDuration = tasks.filter((t) => t.duration_days <= 0);
  if (zeroDuration.length > 0) {
    findings.push({
      severity: "warning", category: "schedule_incomplete",
      message: `${zeroDuration.length} task punya durasi 0 hari atau kurang -- kemungkinan durasi belum diisi.`,
    });
  }
  return findings;
}

function crossCheckRabSchedule(lines: RabLineSnapshot[], tasks: ScheduleTaskSnapshot[]): DiagnosticFinding[] {
  const findings: DiagnosticFinding[] = [];
  const scheduledCodes = new Set(tasks.map((t) => t.id.toLowerCase()));
  const rabWithoutSchedule = lines.filter((l) => l.ahsp_code && !scheduledCodes.has(l.ahsp_code.toLowerCase()));
  if (rabWithoutSchedule.length > 0 && tasks.length > 0) {
    findings.push({
      severity: "info", category: "rab_schedule_mismatch",
      message: `${rabWithoutSchedule.length} item RAB tidak punya task jadwal dengan kode AHSP yang sama -- periksa apakah item ini sudah masuk perencanaan waktu.`,
    });
  }
  return findings;
}

async function executeProjectDiagnostics(_args: Record<string, unknown>, context?: ChatContext): Promise<Record<string, unknown>> {
  const [lines, tasks] = await Promise.all([fetchRabLines(context), fetchScheduleTasks(context)]);
  if (!lines && !tasks) return { available: false, message: MISSING_MESSAGE };

  const findings: DiagnosticFinding[] = [];
  if (lines) findings.push(...diagnoseRabConsistency(lines));
  if (tasks) {
    const criticalPath = (context?.schedule as { critical_path?: string[] } | undefined)?.critical_path ?? [];
    findings.push(...diagnoseScheduleConsistency(tasks, criticalPath));
  }
  if (lines && tasks) findings.push(...crossCheckRabSchedule(lines, tasks));

  return {
    available: true,
    rab_checked: Boolean(lines),
    schedule_checked: Boolean(tasks),
    finding_count: findings.length,
    findings,
  };
}

export const projectDiagnosticsTool: ToolDefinition = {
  declaration: {
    name: "project_diagnostics",
    description: "Analisis root-cause konsistensi data proyek: cek RAB (kode AHSP/volume lengkap, item usulan AI belum dikonfirmasi) dan jadwal (task kritis konsisten, durasi terisi), lalu cross-check keduanya. Gunakan ini kalau user bertanya kenapa ada masalah/ketidaksesuaian data di proyeknya, BUKAN untuk membandingkan revisi RAB dari waktu ke waktu (data historis revisi tidak tersedia).",
    parameters: { type: "OBJECT", properties: {} },
  },
  execute: (args, params) => executeProjectDiagnostics(args, params?.context),
  summarize: (result) => {
    if (result.available === false) return "data tidak tersedia untuk diagnostics";
    const count = Number(result.finding_count ?? 0);
    return count === 0 ? "tidak ditemukan masalah konsistensi" : `${count} temuan konsistensi ditemukan`;
  },
};
