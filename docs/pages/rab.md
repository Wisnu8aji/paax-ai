# Halaman RAB

Route: `/proyek/[projectId]/rab`. Status: **[ada]** editor + Smart RAB Builder
(rule-based) + export Excel backend.

> Baca [README.md](README.md) §1 (Aturan Emas) dulu.

## Tujuan
Menyusun & mengedit RAB proyek: daftar item (kode AHSP + volume + seksi WBS),
HSP per item, subtotal, PPN, total, bobot — lalu export Excel.

## Data yang ditampilkan
Baris RAB tersektor (WBS I–VII), HSP, amount, pajak/total per baris, bobot %,
subtotal/PPN/total. Semua **tampilan**, bukan hitungan frontend.

## Sumber angka (ENGINE-ONLY)
- `POST /rab/build` (RAB tersektor) · `POST /rab/calculate` · `POST /rab/hsp`.
- Parameter: `overhead_override`, `rounding_mode` (`exact`/`rounddown_int`),
  `ppn_rate` (lihat Fase B).
- Export: `POST /rab/export/excel` → 4 sheet (HARGA BAHAN→AHS→HSP→DKH) dengan
  **rumus hidup** (VLOOKUP/ROUNDDOWN/SUMPRODUCT) meniru template KEJAKSAAN.
- ❌ Tidak ada perhitungan RAB/HSP/bobot di TypeScript. Frontend hanya render.

## Peran AI di halaman ini
- **PROPOSE** — "Susun dengan AI" (Smart RAB Builder): teks/tabel elemen →
  usul item (tipe, kode AHSP, dimensi, seksi, confidence) → engine hitung
  volume (`/geometry/volume`) & RAB. Sekarang rule-based; **Gemini = v0.8**.
- **EXPLAIN** — jelaskan kenapa suatu item mahal, bobot terbesar, dll (angka
  dari engine).
- **NEVER** — AI tidak menulis HSP/total. Hanya usul input; user setujui;
  engine hitung.

## Akses Engineering Chat
READ penuh RAB proyek ini & lintas-proyek; PROPOSE perubahan + recompute
(skenario "lebih murah") via konfirmasi user. Lihat [engineering-chat.md](engineering-chat.md).

## Fallback manual
Tanpa AI/Gemini: user pilih kode AHSP dari Database AHSP, isi volume manual,
engine tetap menghitung. Item `needs_review` ditandai untuk dicek.

## Status
Editor + Smart RAB (rule-based) + export backend: ada. Gemini & tombol export
end-to-end di UI: v0.8.
