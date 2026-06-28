# Aturan Per-Halaman PAAX AI

> Dokumen ini mendefinisikan **aturan & batas tanggung jawab tiap halaman** di
> `apps/web`, plus peran AI di tiap halaman. Sumber kebenaran utama tetap
> `CLAUDE.md` (Aturan Emas) & `docs/MASTER_PLAN.md`. Kalau ada konflik,
> CLAUDE.md menang.

Dibuat: 2026-06-28. Status tiap fitur ditandai **[ada]** (sudah jalan),
**[sebagian]** (kerangka ada), atau **[roadmap]** (belum dibangun).

---

## 1. KONTRAK BERSAMA (berlaku di SEMUA halaman)

### 1.1 Aturan Emas (tidak bisa ditawar)
**AI tidak pernah menghitung angka final.** Setiap angka (RAB, HSP, volume,
bobot, durasi, Kurva S, biaya skenario) WAJIB datang dari engine deterministik
(`services/core-engine`). Frontend hanya **menampilkan**; AI hanya
**menstruktur** & **menjelaskan**.

### 1.2 Empat peran AI (dipakai konsisten di seluruh dokumen ini)
- **READ** — AI boleh membaca data halaman (untuk grounding chat/usulan).
- **PROPOSE** — AI boleh mengusulkan perubahan **input terstruktur** (item,
  volume, kode AHSP, urutan, durasi, seksi) lalu **memanggil ulang engine**.
- **EXPLAIN** — AI boleh menarasikan/menjelaskan angka yang sudah dihitung engine.
- **ENGINE-ONLY** — semua angka final; AI tidak boleh menulisnya.
- **NEVER** — AI tidak menghitung, tidak mengarang angka, tidak menulis angka
  final ke RAB/Excel/jadwal.

### 1.3 Fallback manual wajib
Tiap fitur AI harus punya jalur manual: kalau AI gagal/ragu/tanpa API key,
user tetap bisa menyelesaikan pekerjaan (mis. pilih AHSP manual, edit volume,
susun jadwal manual). Item ber-confidence rendah ditandai `needs_review`.

### 1.4 Data governance (untuk Engineering Chat & lintas-proyek)
- Chat & AI hanya boleh membaca **data milik user yang sedang login**
  (RBAC per peran: estimator / PM / lapangan / owner). Lihat
  `docs/security/data-governance.md`.
- Tidak ada rahasia/API key di repo atau di payload browser. Panggilan model
  selalu server-side (lihat `apps/web/src/app/api/ai/*`).

### 1.5 Sumber angka per domain (endpoint engine)
| Domain | Endpoint engine |
|---|---|
| HSP satu item | `POST /rab/hsp` |
| RAB lengkap | `POST /rab/calculate` |
| RAB tersektor WBS | `POST /rab/build` |
| Health check RAB | `POST /rab/validate` |
| Volume dari dimensi | `POST /geometry/volume` |
| Kurva S | `POST /schedule/s-curve` |
| Simulasi skenario | `POST /scenario/simulate` |
| Export Excel (rumus hidup) | `POST /rab/export/excel` |

---

## 2. INDEKS HALAMAN

| Halaman | Route | Dokumen |
|---|---|---|
| Engineering Chat (lintas-halaman) | `/proyek/[id]/chat` | [engineering-chat.md](engineering-chat.md) |
| Dashboard | `/(dashboard)` , `/dashboard` | [dashboard.md](dashboard.md) |
| Daftar Proyek | `/proyek` | [proyek-list.md](proyek-list.md) |
| Ringkasan Proyek | `/proyek/[id]` | [proyek-overview.md](proyek-overview.md) |
| RAB | `/proyek/[id]/rab` | [rab.md](rab.md) |
| Schedule / Kurva S | `/proyek/[id]/schedule` | [schedule.md](schedule.md) |
| Gambar Kerja (+ AI) | `/proyek/[id]/gambar-kerja`, `/gambar-kerja-ai` | [gambar-kerja.md](gambar-kerja.md) |
| Site Agent | `/proyek/[id]/site-agent` | [site-agent.md](site-agent.md) |
| Database AHSP & Harga | `/database-ahsp` | [database-ahsp.md](database-ahsp.md) |
| Files | `/files` | [files.md](files.md) |
| Laporan | `/laporan` | [laporan.md](laporan.md) |
| Kolaborasi | `/kolaborasi` | [kolaborasi.md](kolaborasi.md) |
| Pengaturan | `/pengaturan` | [pengaturan.md](pengaturan.md) |
| RAB Tester (dev) | `/rab-tester` | [rab-tester.md](rab-tester.md) |

---

## 3. MATRIKS KAPABILITAS AI (ringkas)

| Halaman | AI READ | AI PROPOSE | AI EXPLAIN | Catatan |
|---|---|---|---|---|
| Chat | ✅ semua data user | ✅ usul perubahan + recompute | ✅ | jantung asisten |
| RAB | ✅ | ✅ Smart RAB Builder | ✅ | angka dari engine |
| Schedule | ✅ | ✅ usul urutan/durasi | ✅ narasi Kurva S | angka dari engine |
| Gambar Kerja | ✅ | ✅ usul item dari gambar | ✅ | OCR/CV [roadmap] |
| Site Agent | ✅ | ⛔ (lapor saja) | ✅ analisa foto/deviasi | verifikasi manusia |
| Dashboard/Proyek | ✅ | ⛔ | ✅ ringkasan | tampilan saja |
| Database AHSP | ✅ | ⛔ | ✅ | referensi koefisien |
| Laporan | ✅ | ⛔ | ✅ narasi | angka dari engine |

Detail tiap baris ada di dokumen halaman masing-masing.
