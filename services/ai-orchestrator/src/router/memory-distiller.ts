/**
 * Memory Distiller (primitif) — Fase 4, PLAN.md §9 Fase 4
 * (skill command-room-intelligence PLAN.md).
 *
 * Blueprint §6.8 mengasumsikan Memory Distiller adalah langkah LLM terpisah
 * yang menghasilkan conversation_summary + durable_memories + decisions dst
 * dari seluruh percakapan. Versi primitif ini SENGAJA tidak memanggil LLM
 * tambahan (biaya/latensi ekstra yang belum disepakati owner) -- ia murni
 * mengubah bentuk data (giliran user+assistant terakhir -> MemoryCandidate[])
 * memakai heuristik yang sama semangatnya dengan Evidence Gate: menangkap pola
 * yang jelas (koreksi eksplisit, keputusan eksplisit), bukan memahami semantik
 * penuh. Dipanggil OPSIONAL oleh caller (Fase 4 ini tidak menyambungkannya ke
 * route.ts secara otomatis) -- penyimpanan ke durable_memories (services/db)
 * adalah keputusan terpisah yang butuh persetujuan write-policy lebih lanjut,
 * sesuai PLAN.md §6.8 "Write memory tidak diberikan bebas kepada model."
 */
import type { MemoryCandidate, MemoryScope } from "./types";

interface DistillInput {
  userMessage: string;
  assistantMessage: string;
  projectId?: string;
  conversationId?: string;
}

const CORRECTION_MARKERS = [
  "bukan", "koreksi", "seharusnya", "salah,", "revisi:", "sebenarnya",
];

const DECISION_MARKERS = [
  "putuskan", "pilih", "gunakan", "pakai yang", "oke, pakai", "setuju",
];

const PREFERENCE_MARKERS = [
  "saya lebih suka", "saya mau", "saya ingin selalu", "tolong selalu", "jangan pernah",
];

function classifyType(text: string): MemoryCandidate["type"] | null {
  const lower = text.toLowerCase();
  if (CORRECTION_MARKERS.some((m) => lower.includes(m))) return "correction";
  if (PREFERENCE_MARKERS.some((m) => lower.includes(m))) return "preference";
  if (DECISION_MARKERS.some((m) => lower.includes(m))) return "decision";
  return null;
}

/**
 * Distilasi satu giliran percakapan (user+assistant) jadi kandidat memory.
 * Mengembalikan array kosong kalau tidak ada pola yang jelas terdeteksi --
 * ini SENGAJA konservatif (precision di atas recall): lebih baik melewatkan
 * memory yang seharusnya disimpan daripada menyimpan noise (blueprint §6.8
 * "Yang tidak disimpan: sapaan, percakapan ringan, dugaan sementara").
 */
export function distillTurn(input: DistillInput): MemoryCandidate[] {
  const candidates: MemoryCandidate[] = [];
  const scope: MemoryScope = input.projectId ? "project" : "conversation";
  const type = classifyType(input.userMessage);

  if (type) {
    candidates.push({
      type,
      scope,
      content: input.userMessage.trim(),
      entities: [],
      importance: type === "correction" ? 0.9 : 0.6,
      confidence: 0.6, // heuristik kata kunci, bukan LLM -- confidence sedang, bukan 1.0
      source_ids: input.conversationId ? [input.conversationId] : [],
      supersedes: null,
    });
  }

  return candidates;
}
