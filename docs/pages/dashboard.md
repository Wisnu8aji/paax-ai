# Halaman Dashboard

Routes: `/(dashboard)` (home) & `/dashboard`. Status: **[ada]** shell;
monitoring portofolio penuh **[roadmap v2.0]**.

> Baca [README.md](README.md) §1 (Aturan Emas) dulu.

## Tujuan
Ikhtisar lintas-proyek user: daftar proyek, KPI agregat, notifikasi & warning,
pintasan aksi.

## Data yang ditampilkan
Total nilai portofolio, jumlah proyek, status jadwal, daftar notifikasi/warning.
Semua **tampilan** dari agregasi engine/DB.

## Sumber angka (ENGINE-ONLY)
Agregat nilai RAB dari `/rab/build` per proyek; status jadwal dari
`/schedule/s-curve`. ❌ Tidak ada penjumlahan biaya di frontend selain render.

## Peran AI di halaman ini
- **EXPLAIN** — ringkasan portofolio & sorotan ("2 proyek over-budget, 1
  jadwal kritis") dari angka engine.
- **READ** — sumber notifikasi/warning yang juga dibaca Engineering Chat.

## Akses Engineering Chat
Dashboard adalah salah satu sumber utama konteks lintas-proyek chat
(notifikasi, warning, daftar proyek). Lihat [engineering-chat.md](engineering-chat.md).

## Fallback manual
Semua KPI & daftar tampil tanpa AI.

## Status
Shell: ada. Monitoring multi-proyek & laporan pagi: v1.5–v2.0.
