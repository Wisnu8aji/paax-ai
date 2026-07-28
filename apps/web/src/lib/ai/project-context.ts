'use client';

/**
 * PAAX — Context pack proyek untuk Engineering Chat.
 *
 * Inti visi: chat TIDAK mengekstrak ulang gambar/RAB — ia membaca "skrip"
 * yang sudah terstruktur: TKG (transkrip kanonik gambar, INV-TKG-01) +
 * draft RAB (input terstruktur + cache total hasil engine).
 *
 * P-OPS-02 (budget guard): pack dipotong pada anggaran karakter supaya biaya
 * token terkendali. P-SEC-01: pack = DATA, dibungkus delimiter di prompt.
 */
import { tkgRepository } from '@/lib/projects/tkg-repository';
import { rabRepository } from '@/lib/projects/rab-repository';

const MAX_PACK_CHARS = 6000;

export interface ProjectAuditContextPack {
  boe?: unknown;
  warnings?: unknown[];
  reviewTasks?: unknown[];
}

function jsonData(value: unknown): string {
  return JSON.stringify(value);
}

export function buildAuditContextSections(audit?: ProjectAuditContextPack | null): string[] {
  if (!audit) return [];
  const sections: string[] = [];
  if (audit.boe != null) {
    sections.push(`== BOE ==\n${jsonData(audit.boe)}`);
  }
  if (audit.warnings?.length) {
    sections.push(`== WARNINGS ==\n${jsonData(audit.warnings)}`);
  }
  if (audit.reviewTasks?.length) {
    sections.push(`== REVIEW TASKS ==\n${jsonData(audit.reviewTasks)}`);
  }
  return sections;
}

export function describeTkgSource(source: string): string {
  if (source === 'pipeline') return 'pipeline persepsi';
  if (source === 'ai_proposal') return 'usulan AI';
  return 'manual';
}

function potong(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "\n…(dipotong — budget konteks)";
}

export async function buildProjectContextPack(
  projectId: string,
  auditContext?: ProjectAuditContextPack | null,
): Promise<string | null> {
  const bagian: string[] = [];

  try {
    const tkgRec = await tkgRepository.get(projectId);
    if (tkgRec.tkg) {
      const status = `${describeTkgSource(tkgRec.source)}, ` +
        `${tkgRec.reviewed ? 'sudah' : 'BELUM'} direview`;
      if (tkgRec.lastRenderedText) {
        bagian.push(`== SKRIP GAMBAR (TKG, ${status}) ==\n` + potong(tkgRec.lastRenderedText, 4000));
      } else {
        // ringkas dari struktur bila skrip belum dirender
        const ringkas = (tkgRec.tkg as any).sheets.map((s: any) => {
          const el = s.elements.map((e: any) => `${e.kode} ${e.alamat} n=${e.n}`).join('; ');
          const rec = s.tables.flatMap((t: any) => t.records).map((r: any) =>
            `${r.kode}${r.lantai ? `(${r.lantai})` : ''} ` +
            Object.entries(r.dimensi).map(([k, v]) => `${k}=${v}`).join(',') +
            ` ${r.satuan_dimensi}` +
            (r.tulangan.length ? ` tul: ${r.tulangan.map((t: any) => t.raw).join('/')}` : ''),
          ).join('; ');
          return `[${s.sheet_id} ${s.jenis}] ${s.meta.judul}` +
            (el ? `\n  elemen: ${el}` : '') + (rec ? `\n  tipe: ${rec}` : '');
        }).join('\n');
        bagian.push(`== TKG (${status}) ==\n` + potong(ringkas, 3000));
      }
    }
  } catch { /* TKG belum ada — lewati */ }

  try {
    const draft = await rabRepository.get(projectId);
    const lines = draft.lines.filter((l) => l.ahsp_code || l.volume != null);
    if (lines.length) {
      const isi = lines.map((l, i) =>
        `${i + 1}. ${l.ahsp_code || '(AHSP belum dipilih)'} vol=${l.volume ?? '?'}` +
        (l.duration_days != null ? ` durasi=${l.duration_days}h` : ''),
      ).join('\n');
      const total = draft.lastTotal != null
        ? `Total terakhir (hasil engine, cache ${draft.lastCalculatedAt ?? '-'}): Rp ${draft.lastTotal.toLocaleString('id-ID')}`
        : 'Total belum dihitung engine.';
      bagian.push(`== DRAFT RAB (wilayah ${draft.regionCode}, PPN ${(draft.ppnRate * 100).toFixed(0)}%) ==\n${isi}\n${total}`);
    }
  } catch { /* draft RAB belum ada */ }

  bagian.push(...buildAuditContextSections(auditContext));

  if (!bagian.length) return null;
  return potong(bagian.join('\n\n'), MAX_PACK_CHARS);
}

/** RAB-only context; Drawing Intelligence must use DEM/PCKM retrieval instead. */
export async function buildRabContextPack(projectId: string): Promise<string | null> {
  try {
    const draft = await rabRepository.get(projectId);
    const lines = draft.lines.filter((line) => line.ahsp_code || line.volume != null);
    if (!lines.length) return null;
    const items = lines.map((line, index) =>
      `${index + 1}. ${line.ahsp_code || '(AHSP belum dipilih)'} vol=${line.volume ?? '?'}` +
      (line.duration_days != null ? ` durasi=${line.duration_days}h` : ''),
    ).join('\n');
    const total = draft.lastTotal != null
      ? `Total terakhir (hasil engine, cache ${draft.lastCalculatedAt ?? '-'}): Rp ${draft.lastTotal.toLocaleString('id-ID')}`
      : 'Total belum dihitung engine.';
    return potong(`== DRAFT RAB (wilayah ${draft.regionCode}, PPN ${(draft.ppnRate * 100).toFixed(0)}%) ==\n${items}\n${total}`, MAX_PACK_CHARS);
  } catch {
    return null;
  }
}
