/**
 * Evidence Gate primitif — Fase 2, PLAN.md §9 Fase 2
 * (skill command-room-intelligence PLAN.md).
 *
 * Menegakkan Aturan Emas AGENTS.md §1: "Setiap angka di RAB, BoQ, jadwal, Kurva S,
 * dan skenario WAJIB berasal dari engine deterministik. LLM ... tidak pernah
 * MENGHITUNG atau MENGARANG." Blueprint asli (§6.6, §18 Fase 7) menaruh Evidence
 * Gate mendekati akhir roadmap -- PLAN.md §9 Fase 2 memajukannya karena begitu
 * tool-calling aktif di production (Fase 0), tidak ada penjamin numerik sampai
 * gate ini ada. Primitif dulu (deteksi + sinyal), disempurnakan belakangan --
 * bukan tool-calling jalan berbulan-bulan tanpa gate sama sekali.
 *
 * PENTING -- apa yang gate ini BUKAN:
 * - Bukan validator matematis (tidak menghitung ulang RAB/HSP -- itu tugas engine).
 * - Bukan blocker keras yang menahan response ke user (Fase 2 ini murni sinyal
 *   observability + status yang dikirim sebagai event SSE tambahan; enforcement
 *   yang lebih tegas -- mis. minta model merevisi jawaban -- adalah pekerjaan
 *   lanjutan setelah polanya terbukti tidak terlalu banyak false positive).
 */
import type { VerificationClaim, VerificationReport, VerificationStatus } from "./types";

export interface EvidenceGateInput {
  /** Teks jawaban akhir model (setelah semua tool call selesai). */
  responseText: string;
  /** Nama tool yang benar-benar dipanggil selama giliran ini (dari tool-loop). */
  toolsCalled: string[];
}

/**
 * Pola angka yang secara kontekstual terlihat seperti klaim proyek (RAB/BOQ/
 * HSP/durasi/volume/Kurva S) -- bukan sekadar angka apa pun (tanggal, nomor
 * pasal, dsb yang wajar muncul tanpa tool call). Sengaja sempit & literal
 * (Rp, m2/m3, hari, %, kode AHSP) daripada mendeteksi semua digit -- regex
 * yang terlalu lebar membuat gate ini terus-menerus salah tandai teks biasa.
 */
const PROJECT_NUMBER_PATTERNS: RegExp[] = [
  /\bRp\s?[\d.,]+/i,                          // nilai rupiah: "Rp 12.500.000"
  /\b\d[\d.,]*\s?(m2|m3|m'|ha)\b/i,            // volume/luas: "125 m3"
  /\b\d+([.,]\d+)?\s?(hari|minggu|bulan)\b/i,  // durasi: "45 hari"
  /\b[A-Z]\.\d+(\.\d+)*(-\d+)?\b/,             // kode AHSP: "A.2.2.1-1"
  /\b\d+([.,]\d+)?\s?%\b/,                     // bobot/progress: "23.5%"
];

function extractProjectNumberClaims(text: string): string[] {
  const claims = new Set<string>();
  for (const pattern of PROJECT_NUMBER_PATTERNS) {
    const matches = text.match(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g"));
    if (matches) for (const m of matches) claims.add(m.trim());
  }
  return Array.from(claims);
}

const TOOLS_THAT_PROVIDE_NUMBERS = new Set([
  "query_rab", "query_schedule", "lookup_ahsp", "run_scenario", "analyze_drawing",
]);

/**
 * Evaluasi satu giliran jawaban. Ini pengecekan HEURISTIK, bukan bukti matematis
 * -- tujuannya menangkap kasus paling jelas (model menyebut angka RAB/durasi
 * tanpa memanggil tool sama sekali), bukan memverifikasi setiap digit benar.
 */
export function evaluateEvidenceGate(input: EvidenceGateInput): VerificationReport {
  const numberClaims = extractProjectNumberClaims(input.responseText);
  const hadDataTool = input.toolsCalled.some((name) => TOOLS_THAT_PROVIDE_NUMBERS.has(name));

  if (numberClaims.length === 0) {
    // Tidak ada klaim angka proyek terdeteksi -- tidak ada yang perlu diverifikasi.
    return {
      status: "not_available",
      claims: [],
      sources: input.toolsCalled,
      conflicts: [],
      uncertainties: [],
      manual_review_required: false,
    };
  }

  const status: VerificationStatus = hadDataTool ? "verified" : "manual_review_required";
  const claims: VerificationClaim[] = numberClaims.map((claim) => ({
    claim,
    status,
    source_tool: hadDataTool ? input.toolsCalled.find((t) => TOOLS_THAT_PROVIDE_NUMBERS.has(t)) : undefined,
  }));

  return {
    status,
    claims,
    sources: input.toolsCalled,
    conflicts: [],
    uncertainties: hadDataTool ? [] : [
      `Jawaban menyebut ${numberClaims.length} angka yang terlihat seperti data proyek (RAB/durasi/AHSP), tapi tidak ada tool data (query_rab/query_schedule/lookup_ahsp/run_scenario/analyze_drawing) dipanggil pada giliran ini.`,
    ],
    manual_review_required: !hadDataTool,
  };
}
