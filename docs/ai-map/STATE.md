# 📍 PAAX — STATE (status SEKARANG)

> Update terakhir: **2026-06-29**. File ini SATU-SATUNYA tempat status berjalan.
> Selesai satu fase → perbarui di sini (jangan sebar ke banyak file).

## Versi
**v0.9 (Schedule & Scenario "hidup")** — engine SELESAI, frontend belum dibangun.

## Selesai & ada di `main`
- v0.6–v0.8: engine RAB/HSP/Kurva-S deterministik, smart import, export Excel rumus,
  orchestrator Gemini (free tier) + fallback rule-based.
- v0.9 **engine**: CPM (`/schedule/cpm`), schedule plan (`/schedule/plan` = CPM→tanggal
  kalender + Kurva S sadar-dependency), scenario knob crew/shift/efisiensi/target
  (`/scenario/simulate` → `.custom`).
- Engineering Chat tersambung Gemini (PR #17) — masih **tipis**: belum membaca data
  RAB/jadwal proyek (baru kirim projectId + status engine).
- Test hijau: engine **99** · web **16** · schema **11**.

## ⚠️ GAP DATA — reality check (2026-07-01)
RUMUS engine benar & terverifikasi, TAPI datanya masih demo:
- Koef AHSP di repo = **DEMO** (`data/ahsp/cipta-karya.sample.json`, 4 item, ditandai "DATA ILUSTRATIF"). Data asli 2.542 item ada di luar repo (`G:\paax-data`, via env `PAAX_DATA_DIR`).
- Harga **±99% kosong** (`semarang.json` = 23 dari 2.456 resource) → HSP/RAB item nyata belum bisa dihitung benar.
- Volume/quantity **100% manual**; drawing→BoQ→RAB (v1.0) **0% dibangun**.
**Rekomendasi urutan:** ground data dulu (AHSP asli masuk sistem + isi harga 1 wilayah/1 tipe rumah sampai 1 RAB utuh + anchor test ke RAB nyata) → SEBELUM bangun baca-gambar. Detail: `Downloads/api.txt` Bagian 15.

## 🧠 Brain v4.1 (2026-07-01) — spek baru, disalin & dianalisis (2026-07-02)
Pemilik repo punya spesifikasi jauh lebih rinci di `G:\brain` (92 rumus takeoff,
model entitas Evidence/Assumption beraudit, spek TKG baca-gambar, 31 skill,
roadmap bergerbang F0–F5). Sudah disalin verbatim ke `docs/specs/brain-v4.1/`
+ dianalisis di `docs/BRAIN_ALIGNMENT.md`. **Kesimpulan kunci: brain
MENGUATKAN urutan yang sudah dikunci di sini** (ground data dulu, v1.0/CV
DITUNDA) — bukan membatalkannya. Yang berubah: ada target ekspansi baru untuk
rumus `services/core-engine/app/geometry/` (lihat EPIC D di bawah), yang aman
dikerjakan sekarang karena murni deterministik & tidak menyentuh CV/vision.

## Berikutnya (ringkas; rencana detail: lihat di bawah)
- **EPIC A — selesaikan v0.9 frontend**: A1 wiring client (Codex) → A2 Gantt UI +
  A3 panel knob (Claude) → wiring (Codex) → A4 narasi AI skenario.
- **EPIC B — Engineering Chat lintas-halaman**: B1 context pack (Codex) → B2 grounding
  → B3 UI chat global (Claude) → B4 tool-calling.
- **EPIC C — fixes**: C1 poles pembulatan 9B (`custom.subtotal`/`labor_cost` → `_r2`), dst.
- **EPIC D — ekspansi rumus takeoff (baru, dari brain v4.1)**:
  D1 ✅ volume beton F-B01–B11 (`geometry/volume.py`, 5 tipe baru) + Evidence
  schema diperkaya. D2 ✅ **sistem TKG hidup (2026-07-02)**: engine `app/tkg/`
  (models+validator V-02/04/05/08+renderer `.tkg.txt`+takeoff beton/bekisting/
  besi F-B/F-C01-C06/F-D01-D05, endpoint `/tkg/*`, 17 test anchor manual) ·
  Zod mirror TKG · route `POST /api/ai/tkg` (AI menyalin→TkgDocument, P-SEC-01)
  · UI `TkgWorkspace` di gambar-kerja (sumber→transkrip→skrip→takeoff→kirim
  volume ke draft RAB) · chat ter-grounding context pack (skrip TKG+draft RAB).
  D3 ✅ **kait + lewatan + pinggang + BBS (2026-07-02)**: F-D02 penuh (kait
  `k_hook_utama x d` per ujung; lewatan `n_lap = ceil(L_bat/l_stock)-1`,
  `lap = n_ld x d`; lewatan dibutuhkan tanpa `n_ld` -> needs_review), F-D04
  pinggang, F-D06 `waste_mode` param|bbs dgn guard AP-16 (dilarang dobel),
  F-D08 BBS (marks + kebutuhan stok + waste nyata per diameter; batang > stok
  dipecah; elemen review tidak menyumbang potongan) + mirror Zod
  (`BbsResultSchema`, param baru) — 8 test anchor manual baru (pytest 134).
  Berikutnya: D4 parameter registry §Z penuh → D5 tanah F-F; UI tabel BBS di
  TkgWorkspace menyusul. Detail: `docs/BRAIN_ALIGNMENT.md` §4.
- **DITUNDA (jangan dibangun)**: v1.0 Gambar→BoQ→RAB (CV) + Site Agent penuh.
  Brain v4.1 menguatkan ini via gerbang F0 (data grounding wajib sebelum
  F2/TKG) — bukan alasan untuk mulai lebih awal.

## Pembagian peran (2026-06-29)
- **Claude** = planning + semua spek/prompt + **UI frontend** + review.
- **Codex** = penyambungan teknis (lib/engine, fetch, state, route AI, backend, engine).

## Git
- Branch utama: `main`. Open PR: **(tidak ada)** per update ini.
- PR terakhir merged: #17 (engineering chat → Gemini).

## Rencana detail (di luar repo)
- Master plan + prompt Codex (A1, B1): file `PAAX_MASTER_PLAN_*` & `PAAX_CODEX_PROMPT_*`
  di folder Downloads owner.
- Konteks lintas-sesi: memory Claude (`MEMORY.md`).
