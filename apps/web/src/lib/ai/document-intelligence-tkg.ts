/**
 * PAAX — Klien Document Intelligence (Lapis 2A) untuk upload gambar kerja
 * PDF nyata -> TKG draft, MENGGANTIKAN kebutuhan mengetik ulang teks deskripsi.
 *
 * ATURAN EMAS: modul ini TIDAK menghitung apa pun. Service membaca teks
 * vektor PDF (PyMuPDF, deterministik, INV-TKG-06/RULE-EXT-05 brain-00 —
 * bukan vision-LLM menebak angka), merangkai fragmen (merge-run), memparsing
 * grammar notasi struktur (brain-00 §2), dan merekonstruksi tabel via
 * `page.find_tables()` (Fase 2 P1-P4, lihat services/document-intelligence
 * app/perception/) menjadi TkgDocument usulan + metrik/gerbang NYATA (bukan
 * dihitung ulang di sini). Kuantitas tetap dihitung core-engine lewat
 * validateTkg/renderTkg/takeoffTkg (lib/engine.ts) spt jalur teks-manual.
 *
 * CATATAN JUJUR (cakupan Fase 2 iterasi ini — bukan brain-00 §3 penuh):
 * rekonstruksi GRID hanya dari notasi gabungan eksplisit "<as>-<as>=<nilai>",
 * BUKAN dari geometri bubble+garis-dimensi terpisah (butuh ekstraksi PATH
 * vektor di luar text-span, belum diimplementasikan). Tabel BERGARIS
 * terekstrak penuh; tabel tanpa garis belum. Lihat docstring
 * `services/document-intelligence/app/perception/assemble.py` untuk detail.
 */
import { TkgDocumentSchema, type TkgDocument } from '@paax/schemas';

export const DOCUMENT_INTELLIGENCE_URL =
  process.env.NEXT_PUBLIC_DOCUMENT_INTELLIGENCE_PROXY_URL || '/api/document-intelligence';

export class DocumentIntelligenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocumentIntelligenceError';
  }
}

export interface PerceptionMetrics {
  span_total: number;
  span_terklasifikasi: number;
  cakupan: number;
  grammar_pass_rate: number;
  n_unclassified: number;
  n_warning: number;
}

export interface PerceptionGerbangCheck {
  code: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface PerceptionGerbang {
  status: 'draft' | 'lolos';
  checks: PerceptionGerbangCheck[];
}

// Fase E (rencana besar 2026-07-05): pandangan bangunan terkonsolidasi
// lintas-halaman — mirror `app/perception/consolidated_models.py` (Python
// tetap sumber kebenaran bentuk; ini plain TS interface, pola sama dengan
// PerceptionMetrics/PerceptionGerbang di atas, BUKAN Zod — field ini murni
// presentasi, bukan domain inti spt TkgDocument).
export interface ConsolidatedSheetSummary {
  page: number;
  sheet_id: string;
  zone: string | null;
  judul: string;
  skala: string | null;
}

export interface ConsolidatedElementInstanceRef {
  sheet_page: number;
  alamat: string;
  catatan: string | null;
}

export interface ConsolidatedElementDefinisi {
  dimensi: Record<string, number>;
  satuan_dimensi: string;
  tulangan: Array<{ posisi: string; raw: string; jumlah: number | null; diameter_mm: number | null; jarak_mm: number | null; jenis: string }>;
  mutu_beton: string | null;
  sumber_halaman: number | null;
}

export interface ConsolidatedElementRegistryEntry {
  kode: string;
  kategori: string | null;
  instances: ConsolidatedElementInstanceRef[];
  definisi: ConsolidatedElementDefinisi | null;
  status: 'terbaca' | 'perlu_review';
}

export interface ConsolidatedAssumption {
  pernyataan: string;
  alasan: string;
  sheet_page: number | null;
  dampak: 'rendah' | 'sedang' | 'tinggi';
}

export interface ConsolidatedBuildingDimensions {
  total_x_mm: number | null;
  total_y_mm: number | null;
  sumber: 'grid' | 'bounding_box_elemen' | 'tidak_tersedia';
}

export interface ConsolidatedExtraction {
  sheets: ConsolidatedSheetSummary[];
  grid: unknown | null;
  element_registry: ConsolidatedElementRegistryEntry[];
  assumptions: ConsolidatedAssumption[];
  building_dimensions: ConsolidatedBuildingDimensions;
}

export interface DrawingIntakeResult {
  tkg: TkgDocument;
  tkgText: string | null;
  classification: string;
  classificationConfidence: number | null;
  warnings: string[];
  metrics: PerceptionMetrics | null;
  gerbang: PerceptionGerbang | null;
  consolidated: ConsolidatedExtraction | null;
  aiReport: DrawingAiReport | null;
}

export interface DrawingAiReport {
  project_summary: {
    project_id: string;
    file_name: string;
    project_kind: string;
    total_pages: number;
    confidence: number | null;
  };
  sheets: Array<{
    page: number;
    sheet_id: string;
    interpreted_title: string;
    role: string;
    zone: string | null;
    scale: string | null;
    summary: string;
  }>;
  technical_summary: string;
  detected_work_items: Array<{
    category: string;
    item_pekerjaan: string;
    source_pages: number[];
    dasar_pembacaan: string;
    unit: string | null;
    volume: number | null;
    formula: string | null;
    ahsp_candidate: string | null;
    confidence: number;
    status: string;
    verification_note: string | null;
  }>;
  verification_notes: Array<{
    level: string;
    note: string;
    source_pages: number[];
  }>;
  model_stack?: Array<{
    stage: string;
    provider: string;
    model: string;
    purpose: string;
    active: boolean;
  }>;
  next_action_label: string;
  provider: string;
  model: string | null;
}

interface DrawingAnalyzeResponse {
  classification: string;
  classification_confidence: number | null;
  warnings: Array<{ message: string; level: string }>;
  tkg_document: unknown | null;
  tkg_text: string | null;
  metrics: PerceptionMetrics | null;
  gerbang: PerceptionGerbang | null;
  consolidated: ConsolidatedExtraction | null;
  ai_report: DrawingAiReport | null;
}

interface AnalyzeJobStatusResponse {
  job_id: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progress_message: string | null;
  result: DrawingAnalyzeResponse | null;
  error: string | null;
}

function assertPdf(file: File): void {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    throw new DocumentIntelligenceError(
      'Saat ini hanya file PDF gambar kerja yang didukung jalur upload langsung. Untuk foto/scan, pakai jalur teks deskripsi di bawah.',
    );
  }
}

async function uploadDrawingFile(file: File): Promise<void> {
  const form = new FormData();
  form.append('file', file, file.name);
  let uploadRes: Response;
  try {
    uploadRes = await fetch(`${DOCUMENT_INTELLIGENCE_URL}/upload`, { method: 'POST', body: form });
  } catch {
    throw new DocumentIntelligenceError(
      `Tidak dapat terhubung ke Document Intelligence service di ${DOCUMENT_INTELLIGENCE_URL}. ` +
        'Pastikan service berjalan (services/document-intelligence, port 8083) — atau pakai jalur teks deskripsi di bawah.',
    );
  }
  if (!uploadRes.ok) {
    const detail = await uploadRes.json().catch(() => null) as { detail?: string } | null;
    throw new DocumentIntelligenceError(detail?.detail ?? `Upload gagal (${uploadRes.status}).`);
  }
}

function toIntakeResult(data: DrawingAnalyzeResponse): DrawingIntakeResult {
  if (!data.tkg_document) {
    throw new DocumentIntelligenceError(
      'Service tidak mengembalikan TKG (kemungkinan file bukan PDF vektor, atau gagal dibaca di server).',
    );
  }

  const parsed = TkgDocumentSchema.safeParse(data.tkg_document);
  if (!parsed.success) {
    throw new DocumentIntelligenceError(
      `Hasil ekstraksi tidak lolos skema TkgDocument (${parsed.error.issues[0]?.path.join('.')}: ${parsed.error.issues[0]?.message}). ` +
        'Tidak dipaksakan dipakai — laporkan ke pengembang.',
    );
  }

  return {
    tkg: parsed.data,
    tkgText: data.tkg_text,
    classification: data.classification,
    classificationConfidence: data.classification_confidence,
    warnings: data.warnings.map((w) => w.message),
    metrics: data.metrics ?? null,
    gerbang: data.gerbang ?? null,
    consolidated: data.consolidated ?? null,
    aiReport: data.ai_report ?? null,
  };
}

/**
 * Upload file PDF gambar kerja lalu jalankan ekstraksi TKG (SK-01/02/07),
 * SINKRON (blocking sampai selesai). Untuk PDF banyak halaman lebih baik
 * pakai `analyzeDrawingFileInBackground` (Fase F) supaya UI tidak macet.
 * Melempar `DocumentIntelligenceError` dengan pesan siap-tampil bila service
 * tidak aktif, upload gagal, atau hasil tidak lolos skema TkgDocument
 * (dilaporkan, TIDAK dipaksakan dipakai — INV-TKG-03 no-silent-fix).
 */
export async function analyzeDrawingFile(file: File, projectId: string): Promise<DrawingIntakeResult> {
  assertPdf(file);
  await uploadDrawingFile(file);

  let analyzeRes: Response;
  try {
    analyzeRes = await fetch(`${DOCUMENT_INTELLIGENCE_URL}/drawings/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_metadata: { file_name: file.name, file_type: 'DRAWING_PDF', project_id: projectId },
      }),
    });
  } catch {
    throw new DocumentIntelligenceError('File terunggah, tapi analisis gagal terhubung ke service.');
  }
  if (!analyzeRes.ok) {
    const detail = await analyzeRes.json().catch(() => null) as { detail?: string } | null;
    throw new DocumentIntelligenceError(detail?.detail ?? `Analisis gagal (${analyzeRes.status}).`);
  }

  return toIntakeResult((await analyzeRes.json()) as DrawingAnalyzeResponse);
}

const JOB_POLL_INTERVAL_MS = 700;

/**
 * Fase F (rencana besar 2026-07-05): upload + jalankan analisis di LATAR
 * BELAKANG (job async) — cocok untuk PDF banyak halaman supaya UI tidak
 * blocking. `onProgress` dipanggil tiap poll dengan pesan progres NYATA dari
 * backend (bukan animasi buta) — mis. "Membaca gambar... (halaman 3/15)".
 */
export async function analyzeDrawingFileInBackground(
  file: File,
  projectId: string,
  onProgress?: (message: string) => void,
): Promise<DrawingIntakeResult> {
  assertPdf(file);
  await uploadDrawingFile(file);

  let startRes: Response;
  try {
    startRes = await fetch(`${DOCUMENT_INTELLIGENCE_URL}/drawings/analyze/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_metadata: { file_name: file.name, file_type: 'DRAWING_PDF', project_id: projectId },
      }),
    });
  } catch {
    throw new DocumentIntelligenceError('File terunggah, tapi analisis gagal terhubung ke service.');
  }
  if (!startRes.ok) {
    const detail = await startRes.json().catch(() => null) as { detail?: string } | null;
    throw new DocumentIntelligenceError(detail?.detail ?? `Analisis gagal dimulai (${startRes.status}).`);
  }
  const { job_id: jobId } = (await startRes.json()) as { job_id: string };

  while (true) {
    await new Promise((resolve) => setTimeout(resolve, JOB_POLL_INTERVAL_MS));

    let statusRes: Response;
    try {
      statusRes = await fetch(`${DOCUMENT_INTELLIGENCE_URL}/drawings/analyze/status/${jobId}`);
    } catch {
      throw new DocumentIntelligenceError('Koneksi ke service terputus saat memantau progres analisis.');
    }
    if (!statusRes.ok) {
      throw new DocumentIntelligenceError(`Gagal memantau progres analisis (${statusRes.status}).`);
    }
    const job = (await statusRes.json()) as AnalyzeJobStatusResponse;

    if (job.progress_message) {
      onProgress?.(job.progress_message);
    }
    if (job.status === 'FAILED') {
      throw new DocumentIntelligenceError(job.error ?? 'Analisis gagal diproses di server.');
    }
    if (job.status === 'COMPLETED' && job.result) {
      return toIntakeResult(job.result);
    }
  }
}
