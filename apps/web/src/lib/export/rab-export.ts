'use client';

/**
 * PAAX v0.7 — Export RAB/BoQ ke Excel (CSV) & PDF (print).
 *
 * ATURAN EMAS: modul ini TIDAK menghitung apa pun. Ia hanya men-serialisasi &
 * memformat angka yang SUDAH dihitung engine (RABResult dari services/core-engine).
 * Tanpa dependency eksternal: CSV via Blob, PDF via jendela print bawaan browser.
 */
import type { RABResult } from '@paax/schemas';
import { formatRupiah, formatNumber, formatPercent } from '@/lib/format';

function safeName(name: string): string {
  return (name || 'proyek').replace(/[^\p{L}\p{N}\-_ ]/gu, '').trim() || 'proyek';
}

function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadBlob(content: string, mime: string, filename: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Export RAB ke CSV (dibuka Excel). Angka mentah dari engine agar bisa diolah. */
export function exportRabCsv(rab: RABResult, projectName: string): void {
  const today = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  const rows: Array<Array<string | number>> = [
    ['Rencana Anggaran Biaya (RAB)'],
    ['Proyek', projectName],
    ['Wilayah', rab.region],
    ['Tanggal', today],
    ['Sumber', 'Engine deterministik PAAX (auditable)'],
    [],
    ['No', 'Uraian Pekerjaan', 'Kode AHSP', 'Volume', 'Satuan', 'HSP (Rp)', 'Jumlah (Rp)', 'Bobot (%)'],
    ...rab.lines.map((ln, i) => [i + 1, ln.name, ln.ahsp_code, ln.volume, ln.unit, ln.hsp, ln.amount, ln.weight_pct]),
    [],
    ['', '', '', '', '', 'Subtotal', rab.subtotal, ''],
    ['', '', '', '', '', `PPN ${rab.ppn_rate * 100}%`, rab.ppn, ''],
    ['', '', '', '', '', 'RAB Total', rab.total, ''],
  ];
  const csv = rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  // BOM agar Excel membaca UTF-8 dengan benar.
  downloadBlob('﻿' + csv, 'text/csv;charset=utf-8', `RAB - ${safeName(projectName)}.csv`);
}

/** Export RAB ke PDF via jendela print (user pilih "Simpan sebagai PDF"). */
export function exportRabPdf(rab: RABResult, projectName: string): void {
  const today = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  const esc = (s: string) =>
    s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));

  const bodyRows = rab.lines
    .map(
      (ln, i) => `<tr>
        <td class="num">${i + 1}</td>
        <td>${esc(ln.name)}<div class="sub">${esc(ln.ahsp_code)}</div></td>
        <td class="num">${formatNumber(ln.volume)}</td>
        <td>${esc(ln.unit)}</td>
        <td class="num">${formatRupiah(ln.hsp)}</td>
        <td class="num">${formatRupiah(ln.amount)}</td>
        <td class="num">${formatPercent(ln.weight_pct)}</td>
      </tr>`,
    )
    .join('');

  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8">
    <title>RAB - ${esc(projectName)}</title>
    <style>
      * { font-family: 'Segoe UI', Arial, sans-serif; }
      body { margin: 28px; color: #16181d; }
      h1 { font-size: 18px; margin: 0 0 2px; }
      .meta { font-size: 12px; color: #555; margin-bottom: 16px; }
      .badge { display:inline-block; font-size:10px; font-weight:700; color:#0a7d32; border:1px solid #0a7d32; border-radius:6px; padding:2px 7px; margin-bottom:10px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { padding: 7px 9px; border-bottom: 1px solid #e2e4e9; text-align: left; }
      th { background:#f4f5f7; font-size:10px; text-transform:uppercase; letter-spacing:.04em; }
      td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
      .sub { font-size: 10px; color: #8a8f99; }
      tfoot td { font-weight: 700; border-top: 2px solid #16181d; }
      .total td { font-size: 14px; color:#0a7d32; }
      @media print { body { margin: 0; } }
    </style></head><body>
    <div class="badge">ENGINE DETERMINISTIK · AUDITABLE</div>
    <h1>Rencana Anggaran Biaya</h1>
    <div class="meta">${esc(projectName)} · ${esc(rab.region)} · ${today}</div>
    <table>
      <thead><tr>
        <th class="num">No</th><th>Uraian Pekerjaan</th><th class="num">Volume</th>
        <th>Satuan</th><th class="num">HSP (Rp)</th><th class="num">Jumlah (Rp)</th><th class="num">Bobot</th>
      </tr></thead>
      <tbody>${bodyRows}</tbody>
      <tfoot>
        <tr><td colspan="5" class="num">Subtotal</td><td class="num">${formatRupiah(rab.subtotal)}</td><td></td></tr>
        <tr><td colspan="5" class="num">PPN ${formatPercent(rab.ppn_rate * 100)}</td><td class="num">${formatRupiah(rab.ppn)}</td><td></td></tr>
        <tr class="total"><td colspan="5" class="num">RAB Total</td><td class="num">${formatRupiah(rab.total)}</td><td></td></tr>
      </tfoot>
    </table>
    <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 250); };</script>
    </body></html>`;

  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) {
    throw new Error('Popup diblokir. Izinkan popup untuk export PDF, atau gunakan export Excel.');
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}
