# Halaman Laporan

Route: `/laporan`. Status: **[roadmap]** (laporan pagi v1.5).

> Baca [README.md](README.md) §1 (Aturan Emas) dulu.

## Tujuan
Laporan proyek/portofolio: RAB, progres, deviasi, laporan pagi, export PDF/Excel.

## Data yang ditampilkan
Ringkasan & tabel dari engine; narasi pendukung.

## Sumber angka (ENGINE-ONLY)
Semua angka laporan dari engine (`/rab/build`, `/schedule/s-curve`,
`/scenario/simulate`). Export Excel via `/rab/export/excel` (rumus hidup).
❌ Tidak ada agregasi/penjumlahan baru di frontend.

## Peran AI di halaman ini
- **EXPLAIN** — narasi laporan (sorotan, risiko, rekomendasi) di atas angka
  engine. Laporan pagi = ringkasan otomatis kondisi proyek.
- **NEVER** — AI tidak menulis angka laporan; hanya menarasikan angka engine.

## Akses Engineering Chat
Chat bisa menghasilkan/menjelaskan isi laporan on-demand dengan tool engine.

## Fallback manual
Laporan tabel/export tetap jalan tanpa narasi AI.

## Status
Roadmap. Laporan pagi & narasi: v1.5 (metered, lihat companion strategi).
