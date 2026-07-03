# 📍 PAAX — STATE (status SEKARANG)

> Update terakhir: **2026-07-03**. File ini SATU-SATUNYA tempat status berjalan.
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

## 🎨 UI Premium Redesign — Medium Grey Glass (2026-07-03) — terverifikasi, menunggu commit Codex
Rombak besar sesuai spek owner (`G:\Design\prompt\PAAX_PLAN_SESI_DESAIN_PREMIUM_2026-07-03.txt`):
- **Tema default Medium Grey** (#A6A6AA) + token **gold/bronze** & palet
  `--chart-1..5` dari brand sheet; light/dark tetap ada, ganti via
  Pengaturan → Personalisasi (swatch "Medium Grey").
- **Glassmorphism** (`.pax-glass` + border gradasi `.pax-glass-edge`):
  nav panel, topbar, modal, drawer, settings dialog, KPI card, dropdown chat.
- **Logo/wordmark PAAX SVG** (`components/brand/paax-logo.tsx`) — rail & panel.
- **Konsolidasi nav (nol menu ganda)**: rail hitam = File/AHSP/Laporan/
  Kolaborasi + gear + akun; panel kaca = Workspace + Modul Proyek + credits.
  `sidebar.tsx` legacy (dead code) DIHAPUS; **Uji RAB dihapus** (halaman +
  menu); `/pengaturan` → redirect + buka dialog terpusat.
- **Dashboard bisnis**: 4 KPI glass + donut status + bar progres + kolom nilai
  RAB + ring health + warning (`components/charts/dashboard-charts.tsx`,
  display-only, komentar Aturan Emas). `formatRupiahCompact` di lib/format.
- **Engineering Chat premium**: riwayat + "Project Percakapan"
  (`lib/chat/chat-history.ts`, localStorage), tombol **+** (GDrive/Gmail
  "segera" + Tambah file/foto), chip lampiran (belum dikirim ke AI — jujur),
  Thinking…/Thinking more…/Thinking almost done… berkedip (`.pax-thinking`).
- Tipografi: tabular-nums untuk semua angka; kurva S recolor token bronze.
- **Restyle drawing-intelligence-workspace.tsx**: 43 titik kelas legacy
  (glass-card/btn-*/badge-*/text-paax-*/input-field/tabel) di-port ke
  Card/Button/StatusPill + token gold; halaman /gambar-kerja-ai &
  /proyek/:id/gambar-kerja diverifikasi nol kelas legacy.
Verifikasi: tsc OK · vitest **30** · build sukses (route /rab-tester hilang) ·
uji interaktif browser (tema, dialog, chat kirim+riwayat, menu +, redirect,
halaman gambar-kerja render TKG workspace + tabel kandidat).
Prompt commit: `docs/prompts/PAAX_CODEX_PROMPT_UI_PREMIUM_REDESIGN.md`
(branch `feat/ui-premium-redesign` dari `main`, draft PR base `main`).

## 🐞 Perbaikan pasca-redesign (2026-07-03) — prompt siap, MENUNGGU Codex
Owner uji PR #26 di browser, catat 14 temuan di `Downloads/perbaikan.txt`.
Claude investigasi root cause tiap poin (bukan tebakan) + tanya-jawab
keputusan arsitektural, hasilnya 2 prompt siap jalan:
- `docs/prompts/PAAX_CODEX_PROMPT_PERBAIKAN_UI_BATCH_2026-07-03.md` — **siap
  dijalankan sekarang** di branch `feat/ui-premium-redesign` (PR #26, masih
  draft): (1) fix hydration mismatch dashboard — root cause: `ProjectsProvider`
  baca `localStorage` sinkron di `useState` initializer
  (`lib/projects/projects-context.tsx:23`); (2) hapus navigasi ganda —
  tab horizontal `proyek/[projectId]/layout.tsx:92-119` duplikat sidebar kiri;
  (3) chat: label "Lainnya"→"Chat" + filter Pinned/Archived (belum ada,
  field baru di `chat-history.ts`) + diagnosis riwayat "hilang" (hipotesis:
  port dev server geser, localStorage per-origin — BUKAN bug kode
  terkonfirmasi); (4) Gambar Kerja AI: gabung 2 halaman jadi 1, TkgWorkspace
  disederhanakan (transkrip/skrip/takeoff mentah **dihapus dari UI** sesuai
  keputusan owner — user hanya lihat status ringkas + Triage + kirim ke RAB),
  upload file dibuat nyata (metadata tersimpan, BELUM dibaca AI).
- `docs/prompts/PAAX_CODEX_PROMPT_AI_MULTIMODAL_LAMPIRAN_2026-07-03.md` —
  **JANGAN jalankan dulu**, menunggu owner isi kotak persetujuan di dalam
  file. Bagian A (lampiran Engineering Chat beneran dibaca Gemini vision —
  aman, tak menyentuh gerbang F0) + Bagian B (opsional: vision MVP utk
  upload Gambar Kerja AI langsung jadi draft TKG — **menyentuh gerbang F0**,
  `BRAIN_ALIGNMENT.md` sudah menggerbang "TKG builder sungguhan" sbg DITUNDA
  menunggu data-grounding + Wizard-of-Oz; owner sudah dikonfirmasi paham
  tensi ini, prompt berisi kotak checklist eksplisit sebelum Codex boleh
  kerjakan Bagian B).

## 🔧 Gambar Kerja AI — upload PDF nyata ke TKG (2026-07-03, sesi lanjutan) — dikerjakan Claude, BELUM di-commit
Owner minta perbaikan langsung (bukan sekadar prompt) untuk "upload gambar kerja
langsung, AI yang membaca" (lihat `Downloads/perbaikan.txt` poin 1-2). Investigasi
menemukan `services/document-intelligence` (commit `ed6f511`, 2026-07-03 pagi,
**tidak tercatat di STATE.md/BRAIN_ALIGNMENT.md sebelumnya** — dokumen itu stale)
SUDAH punya pipeline PyMuPDF nyata (baca teks vektor PDF asli, bukan vision-LLM,
selaras brain-00 RULE-EXT-05 vektor-dulu) tapi **2 bug menghalangi**: (1) endpoint
upload tidak menyimpan file sama sekali, (2) `build_tkg_from_text` menghasilkan
JSON yang TIDAK selaras `TkgDocumentSchema` (Zod) — field `jenis`/`meta` hilang,
`grid` tidak dipecah `bentang_x`/`bentang_y`, dll. Diperbaiki:
- `upload_routes.py` beneran simpan file (dir lintas-platform via `tempfile.gettempdir()`).
- `tkg/builder.py` ditulis ulang selaras skema Zod persis (+ dukungan "GRID Y:",
  + pemetaan klasifikasi→`jenis`) — 4 test baru (pytest **9** total di service ini).
- `drawing_routes.py`: `UPLOAD_DIR` lintas-platform, kirim `classification_confidence` asli.
- Web: `lib/ai/document-intelligence-tkg.ts` (klien baru, validasi Zod sebelum dipakai)
  + `TkgWorkspace` dapat opsi "Unggah PDF gambar kerja" (alternatif, bukan pengganti,
  jalur teks tetap ada) → hasil TKG masuk pipeline validate/render/takeoff yang SAMA
  (tidak ada logika baru di core-engine).
- Bug lain ketemu & diperbaiki sekalian (di file yang sama): key React bentrok di
  daftar Triage saat >1 elemen berbagi kode+work_type+rule_id (mis. beberapa kolom
  K1) — ditambah `alamat`+index ke key.
**Diverifikasi ujung-ke-ujung** (bukan cuma tsc/vitest hijau): PDF sintetis dari
golden fixture → upload nyata → `/drawings/analyze` → `TkgDocumentSchema.safeParse`
sukses → `/tkg/validate` (gate_passed) → `/tkg/takeoff` (6 item, semua needs_review
dgn alasan jujur "tinggi kolom tidak ada") → UI browser menampilkan status+Triage
benar, 0 error konsol setelah fix key.
**JUJUR — batas nyata**: diuji juga dengan PDF gambar kerja ASLI milik owner
(`GAMBAR KERJA PLHUT SURAKARTA.pdf`) — teks hasil PyMuPDF berupa fragmen tersebar
("DENAH FOOTPLAT", "5000", "A", "PC1"...), TIDAK cocok grammar SK-07 (MVP) yang ada
sekarang (baru kenal notasi terstruktur sederhana, bukan grammar brain-00 §2-§5
penuh: leksikon prefiks, merge-run, rekonstruksi grid/tabel dari geometri). Jadi:
pipeline SEKARANG genuinely bekerja & teruji, tapi PDF proyek nyata masih akan
menghasilkan TKG hampir kosong (semua masuk `unclassified`) sampai grammar penuh
dibangun (pekerjaan terpisah, besar — bukan sesi ini).
**Belum di-commit** — sesuai instruksi owner, Claude tidak commit; Codex yang akan
commit (branch `feat/ui-premium-redesign`, sama seperti batch perbaikan sebelumnya).
File berubah: `apps/web/.env.example`, `apps/web/src/components/drawings/tkg-workspace.tsx`,
`apps/web/src/lib/ai/document-intelligence-tkg.ts` (baru),
`services/document-intelligence/app/api/{drawing_routes,upload_routes}.py`,
`services/document-intelligence/app/tkg/builder.py`,
`services/document-intelligence/tests/{test_tkg_builder.py,fixtures/golden_tkg_text_sheet.txt}`.
**Catatan untuk `PAAX_CODEX_PROMPT_AI_MULTIMODAL_LAMPIRAN_2026-07-03.md` Bagian B**:
sebagian premisnya sudah berubah — untuk PDF vektor, jalur deterministik (non
vision-LLM) di atas sudah jalan & TIDAK menyentuh gerbang F0 sama sekali (murni
baca teks PDF, bukan tebakan model). Vision-LLM (Bagian B asli) sekarang relevan
HANYA untuk sheet raster murni (foto/scan tanpa teks vektor) — kasus yang lebih
sempit dari yang dikira sebelumnya.

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
