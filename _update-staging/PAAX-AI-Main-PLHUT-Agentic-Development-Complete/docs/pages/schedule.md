# Halaman Schedule / Kurva S

Route: `/proyek/[projectId]/schedule`. Status: **[ada]** Kurva S + simulator
skenario; Gantt/jalur kritis **[roadmap]** (v0.9).

> Baca [README.md](README.md) §1 (Aturan Emas) dulu.

## Tujuan
Jadwal pekerjaan & Kurva S rencana dari RAB + durasi per item; simulasi what-if
waktu–biaya.

## Data yang ditampilkan
Kurva S (bobot kumulatif per periode), durasi, total hari, mode
(sequential/parallel), frontier skenario. Semua tampilan dari engine.

## Sumber angka (ENGINE-ONLY)
- `POST /schedule/s-curve` (Kurva S dari RAB + `duration_days`).
- `POST /scenario/simulate` (frontier waktu–biaya deterministik).
- Bobot Kurva S berasal dari bobot RAB engine — ❌ tidak dihitung di frontend.

## Peran AI di halaman ini
- **PROPOSE** — usul urutan kerja / durasi / paralelisasi, lalu **panggil
  ulang** `/schedule/s-curve` atau `/scenario/simulate` untuk angka baru.
- **EXPLAIN** — narasikan Kurva S, deviasi rencana, trade-off skenario.
- **NEVER** — AI tidak mengarang durasi/tanggal; selalu lewat engine.

## Akses Engineering Chat
READ jadwal lintas-proyek + warning. Kasus "hujan, jaga schedule": AI menalar
mitigasi → engine hitung ulang Kurva S/durasi (lihat
[engineering-chat.md](engineering-chat.md) §5.2). Angka tetap dari engine.

## Fallback manual
User isi durasi per item manual; engine bangun Kurva S. Tanpa AI tetap jalan.

## Status
Kurva S + simulator: ada. Gantt + jalur kritis + narasi AI: v0.9.
