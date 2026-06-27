/**
 * PAAX v0.8 — Otak ekstraktor RAB (mode fallback rule-based, TANPA AI eksternal).
 *
 * Tugas "AI" di sini: MEMAHAMI deskripsi elemen → memecah jadi data terstruktur
 * (tipe elemen, dimensi, kode AHSP, seksi WBS) + tingkat keyakinan. Ia TIDAK
 * menghitung angka apa pun — volume & biaya tetap dihitung engine.
 *
 * Pluggable: interface `RabExtractor` memungkinkan provider lain (mis. Gemini
 * Flash free tier) menggantikan implementasi rule-based ini tanpa mengubah UI.
 * Lihat app/api/ai/extract/route.ts.
 */

export interface ExtractedElement {
  id: string;
  label: string;
  element_type: string;            // tipe geometry engine (kolom, dinding, ...)
  dims: Record<string, number>;
  ahsp_code: string | null;        // AHSP terpilih (null = belum ada di DB)
  section: string;                 // kode WBS I..VII
  confidence: number;              // 0..1
  reason: string;
  needs_review: boolean;
}

export interface RabExtractor {
  name: string;
  extract(text: string): ExtractedElement[];
}

// Kata kunci → tipe elemen (urut: paling spesifik dulu).
const TYPE_KEYWORDS: Array<[RegExp, string]> = [
  [/ring\s*balok|ringbalk/, 'ring_balok'],
  [/sloof/, 'sloof'],
  [/pondasi\s*(telapak|tapak)|footplate|foot\s*plat/, 'pondasi_telapak'],
  [/pondasi|tapak|footing/, 'pondasi_menerus'],
  [/kolom|column/, 'kolom'],
  [/balok|beam/, 'balok'],
  [/plat|pelat|slab/, 'plat'],
  [/tangga|stair/, 'tangga'],
  [/galian|gali/, 'galian'],
  [/urugan|urug|timbun/, 'urugan'],
  [/plester|aci/, 'plesteran'],
  [/dinding|bata|pasangan|wall/, 'dinding'],
  [/keramik|lantai|granit|floor/, 'lantai'],
  [/plafon|plafond|langit/, 'plafon'],
  [/\bcat\b|pengecatan|paint/, 'cat'],
  [/atap|genteng|roof/, 'atap'],
  [/pagar|fence/, 'pagar'],
  [/drainase|saluran|got|drain/, 'drainase'],
];

// Dimensi inti per tipe (urut posisi angka). `jumlah` ditangani terpisah.
const TYPE_DIMS: Record<string, string[]> = {
  kolom: ['lebar', 'tebal', 'tinggi'],
  balok: ['lebar', 'tinggi', 'panjang'],
  sloof: ['lebar', 'tinggi', 'panjang'],
  ring_balok: ['lebar', 'tinggi', 'panjang'],
  plat: ['panjang', 'lebar', 'tebal'],
  tangga: ['panjang', 'lebar', 'tebal'],
  pondasi_telapak: ['panjang', 'lebar', 'tinggi'],
  pondasi_menerus: ['lebar', 'tinggi', 'panjang'],
  galian: ['panjang', 'lebar', 'kedalaman'],
  urugan: ['panjang', 'lebar', 'kedalaman'],
  dinding: ['panjang', 'tinggi'],
  cat: ['panjang', 'tinggi'],
  plesteran: ['panjang', 'tinggi'],
  lantai: ['panjang', 'lebar'],
  plafon: ['panjang', 'lebar'],
  atap: ['panjang', 'lebar'],
  pagar: ['panjang'],
  drainase: ['panjang'],
};

// Tipe → kode AHSP di DB seed (hanya 4 item Cipta Karya tersedia).
const TYPE_AHSP: Record<string, string | null> = {
  kolom: 'AHSP.CK.003', balok: 'AHSP.CK.003', sloof: 'AHSP.CK.003',
  ring_balok: 'AHSP.CK.003', plat: 'AHSP.CK.003', tangga: 'AHSP.CK.003',
  pondasi_telapak: 'AHSP.CK.003', pondasi_menerus: 'AHSP.CK.003',
  dinding: 'AHSP.CK.001', plesteran: 'AHSP.CK.002', lantai: 'AHSP.CK.004',
  galian: null, urugan: null, plafon: null, cat: null, atap: null,
  pagar: null, drainase: null,
};

// Tipe → seksi WBS (I..VII).
const TYPE_SECTION: Record<string, string> = {
  galian: 'II', urugan: 'II',
  kolom: 'III', balok: 'III', sloof: 'III', ring_balok: 'III',
  plat: 'III', tangga: 'III', pondasi_telapak: 'III', pondasi_menerus: 'III',
  dinding: 'IV', plesteran: 'IV', lantai: 'IV', plafon: 'IV', cat: 'IV', atap: 'IV',
  pagar: 'VI', drainase: 'VI',
};

function uid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `el-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseNumbers(line: string): number[] {
  const matches = line.match(/\d+(?:[.,]\d+)?/g) ?? [];
  return matches.map((m) => parseFloat(m.replace(',', '.'))).filter((n) => !Number.isNaN(n));
}

function detectType(line: string): string | null {
  for (const [re, type] of TYPE_KEYWORDS) {
    if (re.test(line)) return type;
  }
  return null;
}

function extractLine(raw: string): ExtractedElement | null {
  const label = raw.trim();
  if (!label) return null;
  const lower = label.toLowerCase();
  const type = detectType(lower);

  if (!type) {
    return {
      id: uid(), label, element_type: '', dims: {}, ahsp_code: null,
      section: 'LAINNYA', confidence: 0.2,
      reason: 'Tipe elemen tak dikenali dari teks — mohon pilih manual.',
      needs_review: true,
    };
  }

  const core = TYPE_DIMS[type];
  const nums = parseNumbers(lower);
  const dims: Record<string, number> = {};

  // Cue eksplisit "jumlah N".
  let jumlah: number | null = null;
  const jm = lower.match(/jumlah\s*[:=]?\s*(\d+)/) || lower.match(/(\d+)\s*(?:bh|buah|unit|titik)\b/);
  if (jm) jumlah = parseInt(jm[1], 10);

  // Angka inti diisi posisional; sisa satu angka dianggap jumlah bila belum ada cue.
  const coreNums = nums.slice(0, core.length);
  core.forEach((d, i) => {
    if (coreNums[i] !== undefined) dims[d] = coreNums[i];
  });
  if (jumlah === null && nums.length > core.length) {
    jumlah = Math.trunc(nums[core.length]);
  }
  dims.jumlah = jumlah && jumlah > 0 ? jumlah : 1;

  const ahsp = TYPE_AHSP[type] ?? null;
  const section = TYPE_SECTION[type] ?? 'LAINNYA';
  const dimsComplete = core.every((d) => typeof dims[d] === 'number');

  let confidence = 0.9;
  if (!ahsp) confidence = 0.5;
  else if (!dimsComplete) confidence = 0.6;

  const reason = ahsp
    ? `Cocok '${type}' → ${ahsp}, seksi ${section}.` + (dimsComplete ? '' : ' Dimensi belum lengkap.')
    : `Cocok '${type}', tapi AHSP belum ada di DB — pilih/ tambah manual.`;

  return {
    id: uid(), label, element_type: type, dims, ahsp_code: ahsp, section,
    confidence, reason, needs_review: confidence < 0.75 || !ahsp || !dimsComplete,
  };
}

export const ruleBasedExtractor: RabExtractor = {
  name: 'rule-based',
  extract(text: string): ExtractedElement[] {
    return text
      .split(/\r?\n/)
      .map((line) => extractLine(line))
      .filter((el): el is ExtractedElement => el !== null);
  },
};
