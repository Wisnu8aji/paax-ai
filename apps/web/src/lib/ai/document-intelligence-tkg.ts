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
  process.env.NEXT_PUBLIC_DOCUMENT_INTELLIGENCE_URL || 'http://127.0.0.1:8083';

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

export interface DrawingIntakeResult {
  tkg: TkgDocument;
  tkgText: string | null;
  classification: string;
  classificationConfidence: number | null;
  warnings: string[];
  metrics: PerceptionMetrics | null;
  gerbang: PerceptionGerbang | null;
}

interface DrawingAnalyzeResponse {
  classification: string;
  classification_confidence: number | null;
  warnings: Array<{ message: string; level: string }>;
  tkg_document: unknown | null;
  tkg_text: string | null;
  metrics: PerceptionMetrics | null;
  gerbang: PerceptionGerbang | null;
}

/**
 * Upload file PDF gambar kerja lalu jalankan ekstraksi TKG (SK-01/02/07).
 * Melempar `DocumentIntelligenceError` dengan pesan siap-tampil bila service
 * tidak aktif, upload gagal, atau hasil tidak lolos skema TkgDocument
 * (dilaporkan, TIDAK dipaksakan dipakai — INV-TKG-03 no-silent-fix).
 */
export async function analyzeDrawingFile(file: File, projectId: string): Promise<DrawingIntakeResult> {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    throw new DocumentIntelligenceError(
      'Saat ini hanya file PDF gambar kerja yang didukung jalur upload langsung. Untuk foto/scan, pakai jalur teks deskripsi di bawah.',
    );
  }

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

  const data = (await analyzeRes.json()) as DrawingAnalyzeResponse;
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
  };
}
