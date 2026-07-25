/**
 * Capability Router + Intent Architect + Task Planner (primitif) — Fase 3,
 * PLAN.md §9 Fase 3 (skill command-room-intelligence PLAN.md).
 *
 * CATATAN PENTING: owner belum memfinalisasi konsep penuh untuk lapisan ini
 * (Capability Router "cerdas" yang benar-benar memilih skill dari manifest,
 * dst -- blueprint §6.1). Modul ini SENGAJA primitif/heuristik: klasifikasi
 * plan_depth berbasis kata kunci sederhana, bukan LLM-based routing atau skill
 * manifest yang kompleks. Tujuannya menaikkan kualitas observability (user
 * lihat "Pendekatan" singkat untuk pertanyaan kompleks, sesuai blueprint §5)
 * tanpa membuat keputusan arsitektur besar yang belum disepakati. Perluasan ke
 * router yang lebih pintar adalah pekerjaan lanjutan setelah konsep matang --
 * bukan diam-diam diputuskan di sini.
 */
import type { ExecutionPlan, ExecutionStep, IntentFrame, PlanDepth } from "./types";

const CONTROLLED_KEYWORDS = [
  "publish", "hapus", "delete", "final", "kirim ke", "approve", "setujui",
];

const STRUCTURED_KEYWORDS = [
  "analisis", "analisa", "percepatan", "audit", "bandingkan", "kenapa", "mengapa",
  "root cause", "rencana", "strategi", "laporan", "evaluasi", "rekomendasi",
];

const COMPACT_KEYWORDS = [
  "rab", "boq", "jadwal", "schedule", "ahsp", "volume", "durasi", "progres",
  "proyek ini", "proyek saya", "gambar", "drawing",
];

function classifyPlanDepth(message: string): PlanDepth {
  const lower = message.toLowerCase();
  if (CONTROLLED_KEYWORDS.some((kw) => lower.includes(kw))) return "controlled";
  if (STRUCTURED_KEYWORDS.some((kw) => lower.includes(kw))) return "structured";
  if (COMPACT_KEYWORDS.some((kw) => lower.includes(kw))) return "compact";
  return "direct";
}

/**
 * Bungkus pesan user jadi IntentFrame primitif. TIDAK memanggil LLM tambahan
 * untuk ini (blueprint mengasumsikan Intent Architect adalah langkah LLM
 * terpisah -- primitif ini murni heuristik supaya tidak menambah biaya/latensi
 * ekstra sebelum konsep penuhnya matang).
 */
export function buildIntentFrame(userMessage: string): IntentFrame {
  const planDepth = classifyPlanDepth(userMessage);
  return {
    literal_request: userMessage,
    objective: userMessage,
    deliverable: "jawaban chat",
    scope: "conversation",
    constraints: [],
    context_required: planDepth === "direct" ? [] : ["project_context"],
    assumptions: [],
    ambiguity: "low",
    risk: planDepth === "controlled" ? "high" : "low",
    plan_depth: planDepth,
  };
}

/**
 * Pesan "Pendekatan" singkat untuk plan_depth structured/controlled, sesuai
 * blueprint §5 Level 2 ("Plan dapat ditampilkan secara ringkas ... PAAX
 * langsung mengerjakannya"). Level 0/1 tidak menampilkan apa pun -- plan
 * ditampilkan hanya kalau kompleksitasnya membenarkan (bukan default selalu).
 */
export function planDepthStatusMessage(frame: IntentFrame): string | null {
  if (frame.plan_depth === "structured") {
    return "Pendekatan: memeriksa data proyek relevan (RAB/jadwal/gambar) sebelum menjawab.";
  }
  if (frame.plan_depth === "controlled") {
    return "Permintaan ini menyentuh tindakan yang perlu perhatian ekstra -- akan dijawab dengan hati-hati, tindakan final tetap perlu konfirmasi Anda.";
  }
  return null;
}

const TOOL_KEYWORD_MAP: Array<{ tool: string; keywords: string[] }> = [
  { tool: "query_rab", keywords: ["rab", "boq", "biaya", "harga"] },
  { tool: "query_schedule", keywords: ["jadwal", "schedule", "durasi", "waktu"] },
  { tool: "lookup_ahsp", keywords: ["ahsp", "kode ahsp", "satuan pekerjaan"] },
  { tool: "run_scenario", keywords: ["skenario", "simulasi", "percepatan", "lembur", "crew"] },
  { tool: "analyze_drawing", keywords: ["gambar", "drawing", "denah"] },
  { tool: "project_diagnostics", keywords: ["kenapa", "mengapa", "masalah", "tidak sesuai", "root cause"] },
];

function guessRelevantTools(userMessage: string): string[] {
  const lower = userMessage.toLowerCase();
  const matched = TOOL_KEYWORD_MAP.filter(({ keywords }) => keywords.some((kw) => lower.includes(kw))).map((m) => m.tool);
  return Array.from(new Set(matched));
}

/**
 * Plan Executor (primitif) -- PLAN.md §9 Fase 6, memperluas primitif Fase 3.
 * Mengonversi IntentFrame jadi ExecutionPlan DESKRIPTIF (bukan preskriptif):
 * dikirim ke UI sebagai transparansi "tool apa yang kemungkinan dipakai",
 * TAPI tidak memaksa/membatasi tool_choice model -- tool-loop tetap
 * "auto", model tetap yang memutuskan tool spesifik apa & urutan panggilannya.
 * Ini murni observability tambahan untuk plan_depth structured/controlled,
 * konsisten dengan batas primitif Fase 3 (bukan LLM-based planning penuh yang
 * belum disepakati konsepnya).
 */
export function buildExecutionPlan(frame: IntentFrame): ExecutionPlan | null {
  if (frame.plan_depth === "direct" || frame.plan_depth === "compact") return null;

  const relevantTools = guessRelevantTools(frame.literal_request);
  const steps: ExecutionStep[] = relevantTools.map((tool, idx) => ({
    id: `S${idx + 1}`,
    action: `Ambil/hitung data via tool ${tool}`,
    tool,
    output: `${tool}_result`,
  }));
  steps.push({
    id: `S${steps.length + 1}`,
    action: "Susun jawaban akhir berdasarkan hasil tool di atas, sertakan semua angka konkret",
    depends_on: steps.map((s) => s.id),
    output: "final_answer",
  });

  return {
    goal: frame.objective,
    steps,
    dependencies: steps.filter((s) => s.depends_on).map((s) => s.id),
    tools: relevantTools,
    approval_points: frame.plan_depth === "controlled" ? ["final_answer"] : [],
    verification_rules: ["Setiap angka proyek di jawaban akhir wajib punya sumber tool (Evidence Gate)"],
    completion_criteria: ["Semua tool relevan sudah dipanggil atau dinyatakan tidak tersedia", "Jawaban akhir memuat angka konkret, bukan rujukan ke 'hasil di atas'"],
  };
}
