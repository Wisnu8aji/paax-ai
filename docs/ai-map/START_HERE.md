# 🧭 PAAX — START HERE (baca ini DULU, jangan crawl repo)

> Tujuan file ini: orientasi cepat untuk AI mana pun (Saya / Gemini / Saya)
> tanpa membaca semua file. **Baca file spesifik HANYA sesuai task** (lihat Router).
> Ini bukan tempat menaruh detail — ini peta. Detail ada di file tujuan.

## 2 aturan yang TAK BOLEH dilanggar (detail: `SAYA.md` §1 & §9)
1. **ATURAN EMAS** — angka final (RAB/HSP/volume/durasi/tanggal/Kurva-S/skenario)
   SELALU dari engine Python (`services/core-engine`). AI & TypeScript **tidak
   pernah** menghitung; hanya menstruktur / menjelaskan / menampilkan. Termasuk
   lapisan AI-assist klasifikasi/binding gambar (`SAYA.md` §1.1) — LLM boleh
   mengusulkan kandidat dari teks+koordinat yang sudah diekstrak, tidak pernah
   auto-commit ke input engine tanpa validasi deterministik + review manusia.
2. **GERBANG REVIEW** — kerja di branch baru → PR → tunggu owner + Saya.
   **Tidak auto-merge, tidak push ke `main`.** "lanjut kerja" ≠ "izin merge".

## Daftar isi (peta dokumen)
| File | Isi |
|---|---|
| `SAYA.md` / `AGENTS.md` | Konstitusi/aturan (auto-load Saya/Saya) |
| `docs/ai-map/MAP.md` | DI MANA letak kode, endpoint, komponen, test |
| `docs/ai-map/STATE.md` | Status SEKARANG: versi, selesai, next, PR, peran |
| `docs/ai-map/GLOSSARY.md` | Istilah domain (AHSP, HSP, OH, BUK, Kurva S, CPM…) |
| `docs/MASTER_PLAN.md` | Blueprint besar (rujuk saat menyentuh roadmap) |
| `docs/pages/` | Aturan per-halaman web (1 file per halaman) |
| `docs/BRAIN_ALIGNMENT.md` | Gap-analysis spek "brain" v4.1 vs dokumen ini — apa sudah selaras, apa sedang diekspansi |
| `docs/specs/brain-v4.1/` | Spek rinci (92 rumus takeoff, TKG, 31 skill) — dirujuk, belum semua diimplementasi |

## Router — "Mau lakukan X → baca Y" (jangan baca selain ini)
| Kalau task-nya… | Baca |
|---|---|
| Tahu status & langkah berikutnya | `STATE.md` |
| Cari file / endpoint / komponen | `MAP.md` |
| Ubah rumus / engine (menyentuh ANGKA) | `SAYA.md` §1,§5 → `services/core-engine` (lihat MAP) |
| Kerja frontend UI | `MAP.md` (apps/web) + `docs/pages/<halaman>.md` |
| Kerja AI / chat / Gemini | `MAP.md` (lib/ai) + `SAYA.md` §1 |
| Tidak paham istilah | `GLOSSARY.md` |
| Keputusan arsitektur lama | `docs/adr/` |
| Butuh rumus takeoff lengkap / spek TKG / model entitas Evidence | `docs/BRAIN_ALIGNMENT.md` → `docs/specs/brain-v4.1/` |
| Kerja AI-assist klasifikasi/binding gambar (bukan vision-piksel) | `SAYA.md` §1.1 → `docs/plans/PAAX_ANALISA_RAB_DARI_GAMBAR_BIG_PLAN_2026-07-13.md` §X2 |

## Disiplin token (wajib)
- Urutan baca: **START_HERE → STATE → (1–2 file relevan dari Router)**. Berhenti di situ.
- **Jangan** `read` seluruh folder. **Jangan** grep buta — pakai `MAP.md` untuk lokasi.
- Setelah menyelesaikan satu fase: **update `STATE.md`** (cukup file itu) agar sesi
  berikutnya tetap to-the-point.
