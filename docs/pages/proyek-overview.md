# Halaman Ringkasan Proyek

Route: `/proyek/[projectId]`. Status: **[ada]** shell + navigasi tab.

> Baca [README.md](README.md) §1 (Aturan Emas) dulu.

## Tujuan
Pintu masuk satu proyek: ringkasan (total RAB, progress, status jadwal,
warning) + navigasi ke RAB, Schedule, Gambar Kerja, Chat, Site Agent.

## Data yang ditampilkan
KPI ringkas proyek (total RAB, bobot terpakai, % progress, jumlah warning).
Semua **tampilan** hasil agregasi engine/DB, bukan hitungan frontend.

## Sumber angka (ENGINE-ONLY)
Total RAB & bobot dari `/rab/build`; status jadwal dari `/schedule/s-curve`.
Frontend hanya menampilkan.

## Peran AI di halaman ini
- **EXPLAIN** — ringkasan naratif kondisi proyek ("struktur 60% biaya, jadwal
  mundur 3 hari") dari angka engine.
- **PROPOSE/READ** lebih lanjut dialihkan ke Engineering Chat.

## Akses Engineering Chat
Entry point chat per-proyek ada di sini; chat membaca semua tab proyek + data
lintas-proyek. Lihat [engineering-chat.md](engineering-chat.md).

## Fallback manual
Semua KPI tetap tampil tanpa AI (langsung dari engine/DB).

## Status
Shell + navigasi: ada. Ringkasan AI naratif: setelah Gemini wiring (v0.8).
