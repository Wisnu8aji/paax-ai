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

function potong(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "\n…(dipotong — budget konteks)";
}

export async function buildProjectContextPack(projectId: string): Promise<string | null> {
  const bagian: string[] = [];

  try {
    const tkgRec = await tkgRepository.get(projectId);
    if (tkgRec.tkg) {
      const status = `${tkgRec.source === 'ai_proposal' ? 'usulan AI' : 'manual'}, ` +
        `${tkgRec.reviewed ? 'sudah' : 'BELUM'} direview`;
      if (tkgRec.lastRenderedText) {
        bagian.push(`== SKRIP GAMBAR (TKG, ${status}) ==\n` + potong(tkgRec.lastRenderedText, 4000));
      } else {
        // ringkas dari struktur bila skrip belum dirender
        const ringkas = tkgRec.tkg.sheets.map((s) => {
          const el = s.elements.map((e) => `${e.kode} ${e.alamat} n=${e.n}`).join('; ');
          const rec = s.tables.flatMap((t) => t.records).map((r) =>
            `${r.kode}${r.lantai ? `(${r.lantai})` : ''} ` +
            Object.entries(r.dimensi).map(([k, v]) => `${k}=${v}`).join(',') +
            ` ${r.satuan_dimensi}` +
            (r.tulangan.length ? ` tul: ${r.tulangan.map((t) => t.raw).join('/')}` : ''),
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

  if (!bagian.length) return null;
  return potong(bagian.join('\n\n'), MAX_PACK_CHARS);
}
