/**
 * PAAX — Klien Document Intelligence (Lapis 2A) untuk upload gambar kerja
 * PDF nyata -> TKG draft, MENGGANTIKAN kebutuhan mengetik ulang teks deskripsi.
 *
 * ATURAN EMAS: modul ini TIDAK menghitung apa pun. Service ini hanya membaca
 * teks vektor PDF (PyMuPDF, deterministik, INV-TKG-06/RULE-EXT-05 brain-00 —
 * bukan vision-LLM menebak angka) dan menyusunnya jadi TkgDocument usulan;
 * kuantitas tetap dihitung core-engine lewat validateTkg/renderTkg/takeoffTkg
 * (lib/engine.ts) seperti jalur teks-manual yang sudah ada.
 *
 * CATATAN JUJUR: grammar parsing saat ini (services/document-intelligence
 * app/tkg/builder.py) baru mengenali notasi terstruktur sederhana, BUKAN
 * grammar notasi gambar struktur Indonesia lengkap (brain-00 §2-§5). Pada PDF
 * gambar kerja nyata yang teksnya berupa fragmen tersebar (bukan kalimat
 * terstruktur), hasilnya akan didominasi blok "unclassified" — itu bukan bug
 * di jalur ini, tapi keterbatasan grammar yang memang belum dibangun.
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

export interface DrawingIntakeResult {
  tkg: TkgDocument;
  tkgText: string | null;
  classification: string;
  classificationConfidence: number | null;
  warnings: string[];
}

interface DrawingAnalyzeResponse {
  classification: string;
  classification_confidence: number | null;
  warnings: Array<{ message: string; level: string }>;
  tkg_document: unknown | null;
  tkg_text: string | null;
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
  };
}
