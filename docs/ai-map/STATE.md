# 📍 PAAX — STATE (status SEKARANG)

> Update terakhir: **2026-07-02**. File ini SATU-SATUNYA tempat status berjalan.
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
  D4+E+F+G ✅ **take-off arsitektur/tanah (2026-07-02)**: paket baru
  `app/takeoff/` (params §Z: TanahParams/DindingParams/ArsitekturParams;
  models; **§F tanah** F-F01/02/03/04/05/07 galian footplat+menerus, urugan
  kembali, urugan pasir/sirtu, buangan+ritase — disiplin bank/gembur/padat
  tak dicampur; **§E finishing** F-E01/02/03/05/07 pasangan+deduksi bukaan
  (all|threshold), plester s_sisi, acian, cat n_lapis, screed; **§G subset**
  F-G01/03/05 pondasi batu belah, penutup lantai+plin, atap miring A/cosθ).
  3 endpoint `/takeoff/tanah|dinding|arsitektur` + mirror Zod + requests.http —
  13 test anchor manual baru (**pytest 147**). Data kurang → needs_review
  (bukan tebakan); faktor tanah default tercatat sebagai assumption.
  Berikutnya: D5 §Z penuh (sisa param confidence/QA), F-F06 pemadatan +
  angkut per kelas jarak, F-G04/G06-G14 (keramik dinding/baja/atap detail/
  MEP), F-C07-C10; UI tabel BBS + form takeoff manual di TkgWorkspace.
  Detail: `docs/BRAIN_ALIGNMENT.md` §4.
- **DITUNDA (jangan dibangun)**: v1.0 Gambar→BoQ→RAB (CV) + Site Agent penuh.
  Brain v4.1 menguatkan ini via gerbang F0 (data grounding wajib sebelum
  F2/TKG) — bukan alasan untuk mulai lebih awal.

## 🎨 UI Overhaul (2026-07-02) — terverifikasi, menunggu commit Codex
Font workspace Hanken→**Inter** (body) + **Outfit** (display); tema default
**dark**; **SettingsDialog** terpusat 2 kolom (7 tab: Umum/Notifikasi/
Personalisasi/Aplikasi/Tagihan/Penyimpanan/Akun, 6 toggle notifikasi, prefs
lokal) menggantikan drawer notif/apps/billing/account; komponen `ui/switch.tsx`
baru; rail ikon tipis + gear. Verifikasi: tsc OK · vitest 25 · build sukses ·
uji visual browser. Murni presentasi — tidak ada angka dihitung di frontend.
Prompt commit: `docs/prompts/PAAX_CODEX_PROMPT_UI_OVERHAUL.md` (branch
`feat/ui-workspace-premium`, draft PR base `docs/brain-v4.1-alignment`).

## ✅ FASE 0 (0a penuh + 0b-parsial harga) SELESAI & TERVERIFIKASI (2026-07-03), prompt Codex siap
Milestone besar terverifikasi ujung-ke-ujung lewat engine ASLI (bukan replika),
**238 passed** (198 lama + 40 baru), tak ada regresi:
- **0a-1 HSP**: `compute_hsp()` reproduksi **32/32 HSP profesional** dari `ALFA.xlsx`
  sheet AHS via `(A+B+C)×(1+OP)`.
- **0a-2 RAB total**: `compute_rab()` reproduksi **grand_total Rp 1.860.078.607**
  deviasi **+0,0009%** (224 baris DKH; 79 ber-AHS dari koefisien, 145 direct).
- **0b-parsial (harga Surakarta NYATA)**: owner authorized (2026-07-03) pakai
  harga di ALFA.xlsx (HARGA BAHAN/DKH/HSP) sbg HSD Surakarta sistem. Dibangun
  `data/harga-satuan/surakarta.json` (112 resource, price book UMUM regional —
  sah per §0.1, bukan fixture). Engine + price book ini mereproduksi RAB PLHUT
  **Rp 1.885.558.837 vs Rp 1.860.078.608 = +1,37%** (dalam ±10%); deviasi
  seluruhnya dari **5 inkonsistensi harga internal ALFA sendiri** (tercatat di
  `alfa_price_conflicts`, auditable RULE-HRG-02). Coverage 100% resource PLHUT.
Fixture + 3 generator + README + 3 test dibuat Claude di `services/core-engine/
tests/{fixtures/plhut/, test_plhut_hsp_golden.py, test_plhut_rab_golden.py,
test_plhut_surakarta_pricebook.py}` + `data/harga-satuan/surakarta.json`.
**Temuan penting**: (a) kode resource ALFA TIDAK andal (M.504 = 2 material beda)
→ fixture PLHUT kunci resource lokal per-analisa; (b) ada file Surakarta SERUPA
di luar repo (`G:\paax-data`, 109 resource, sesi sebelumnya) dgn penomoran kode
BEDA — tak aktif bug (loader pilih satu via env `PAAX_DATA_DIR`) tapi belum
direkonsiliasi, dicatat di gap doc. Prinsip §0.1 dipatuhi penuh. Prompt commit:
`docs/prompts/PAAX_CODEX_PROMPT_FASE0A_HSP_GOLDEN.md` (branch
`feat/fase0-plhut-golden-anchor` dari main; Codex commit, belum di-commit).

## ⚠️ Sisa GERBANG-0b penuh: pemetaan ke katalog AHSP RESMI (2.542 item) — butuh owner
Harga BUKAN lagi penghalang untuk lingkup PLHUT/Surakarta. Sisa: mengikat 112
resource Surakarta + 224 item DKH ke KODE RESMI katalog (`G:\paax-data`, sudah
format engine). Cek nama-persis: baru 21/112 match (kategori upah masuk akal —
kode resmi memang generik per-profesi; kategori bahan perlu pencocokan semantik
SK-19). Brain RULE-AHSP-01 mewajibkan konfirmasi manusia utk kasus ambigu — TIDAK
diotomatisasi diam-diam. Detail + rekomendasi: `docs/plans/PAAX_FASE0B_GAP_HARGA_2026-07-03.md`.
Tidak memblokir Fase 1 (workspace) / Fase 2 (persepsi) — bisa paralel.

## 🗺️ Roadmap "Gambar → RAB benar" (2026-07-03) — analisis mendalam brain, keputusan owner: Fase 0 dulu
Owner minta rencana lengkap sampai gambar nyata → RAB benar sesuai brain.
Claude baca 4 berkas brain penuh + audit repo. Hasil: `docs/plans/PAAX_ROADMAP_GAMBAR_KE_RAB_2026-07-03.md`.
**Temuan inti**: 3 "setengah" sistem beda kematangan — Engine hitung ~70%
(jalan KALAU TKG benar), Data grounding ~40% (AHSP asli 2.542 item ada di
`G:\paax-data` tapi belum tersambung; harga ~4%), Persepsi baca gambar ~20%
(PyMuPDF jalan tapi grammar belum kenal notasi gambar nyata → PDF asli jadi
`unclassified`). Golden anchor `test_plhut_golden.py` = TKG PLHUT **transkrip
TANGAN** (manusia persepsi, engine hitung benar) — membuktikan separuh keras
sudah benar. **Urutan brain (data dulu, baru mata, TXT03 §7/AP-09)**:
FASE 0 tutup GERBANG-0 di PLHUT (data+engine, manusia transkrip → RAB penuh
berharga vs `ALFA.xlsx` manual owner) → FASE 2 tutup GERBANG-2 (persepsi
otomatis = golden transkrip-tangan) → FASE 3-4 tutup GERBANG-4 (gambar nyata →
RAB auditable). Owner PUNYA materi anchor lengkap: PLHUT PDF + RAB manual
`ALFA.xlsx`+`MC 00.xlsx`. **Butuh keputusan owner** (4 hal, lihat §5 dokumen):
setuju urutan Fase 0 dulu? ambang deviasi (usul ±10%)? bantu baca ALFA.xlsx?
konfirm PLHUT proyek golden? Baru lalu Claude pecah Fase 0 jadi prompt Codex 0A–0D.

## Pembagian peran (2026-06-29)
- **Claude** = planning + semua spek/prompt + **UI frontend** + review.
- **Codex** = penyambungan teknis (lib/engine, fetch, state, route AI, backend, engine).

## Git
- Branch utama: `main`. Open PR: **#20 (draft — sistem TKG, branch
  `docs/brain-v4.1-alignment`)**; menyusul PR UI overhaul (stacked di atas #20).
- PR terakhir merged: #19 (dashboard navigation performance).

## Rencana detail (di luar repo)
- Master plan + prompt Codex (A1, B1): file `PAAX_MASTER_PLAN_*` & `PAAX_CODEX_PROMPT_*`
  di folder Downloads owner.
- Konteks lintas-sesi: memory Claude (`MEMORY.md`).
