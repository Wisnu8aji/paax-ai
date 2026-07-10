# PROMPT SAYA — COMMIT Fase 2 Persepsi Lengkap (P1–P6 + Grid Geometri §3.1.1)

> ## ⚠️ STATUS: HISTORIS / SUPERSEDED (2026-07-05)
> Isi prompt ini SUDAH DI-COMMIT & DI-MERGE ke `main` sebelum sesi 2026-07-05
> dimulai (lihat `git log`: commit `5c58463`/`d17a67d`/`97161a4`/`38ac2ef`).
> **JANGAN jalankan prompt ini lagi.** Pekerjaan baru (Fase B-H, lebih besar)
> ada di `docs/prompts/PAAX_SAYA_PROMPT_COMMIT_GAMBAR_TEKNIK_SIPIL_2026-07-05.md`.

> Ditulis Saya, 2026-07-04 malam. **Tugas ini HANYA commit + push — TIDAK
> ADA kode yang perlu ditulis ulang atau diperbaiki.** Semua implementasi
> (backend `services/document-intelligence`, koreksi frontend
> `apps/web`) sudah dikerjakan LANGSUNG oleh Saya sesuai arahan owner
> ("Saya hanya bagian commit saja"), sudah diverifikasi lewat 339 test
> otomatis + 1 uji langsung di browser. **JANGAN mengubah logika apa pun**
> di file yang disebut di bawah — kalau ada godaan "memperbaiki" sesuatu,
> STOP dan laporkan ke owner, jangan diam-diam diubah.

---

## 0. Konteks singkat

Sesi ini (2026-07-04 malam, lanjutan) Saya membangun **seluruh pipeline
persepsi baca-gambar** (Fase 2 paket P1–P6 + rekonstruksi grid dari
geometri §3.1.1) langsung sebagai kode — bukan sebagai prompt Saya seperti
biasanya. Semua sudah lolos test & terverifikasi. Working tree
`feat/ui-premium-redesign` juga sudah **4 commit di depan `origin`**
(`633ac68`, `c0fb447`, `a45b4c1`, `dec49f5` — lihat `git log --oneline -5`)
yang belum pernah di-push. Tugas Anda: verifikasi test hijau, commit
perubahan baru, lalu **push semuanya** (yang lama + yang baru) ke
`origin/feat/ui-premium-redesign`.

Laporan lengkap fungsi & hasil ada di
`report/REPORT_FASE2_PERSEPSI_LENGKAP_SAYA_2026-07-04.txt` — baca itu
untuk konteks, TIDAK perlu dibaca ulang di sini secara detail.

---

## 1. Verifikasi WAJIB sebelum commit (jangan commit kalau ada yang merah)

```powershell
cd services/document-intelligence
$env:PAAX_PLHUT_PDF = ""   # kosongkan dulu supaya smoke-test PLHUT di-skip kalau PDF tak ada di mesin Anda
python -m pytest -q
# harapan: 99 passed, 1 skipped (atau 100 passed kalau PAAX_PLHUT_PDF diisi path PDF asli)

cd ../core-engine
python -m pytest -q
# harapan: 198 passed (TIDAK BERUBAH — service ini tak disentuh sesi ini)

cd ../../apps/web
pnpm vitest run
pnpm tsc --noEmit
# harapan: 41 passed, tsc exit 0
```

Kalau salah satu merah: **JANGAN commit.** Laporkan pesan error lengkap ke
owner, jangan mencoba memperbaiki sendiri (ini di luar scope tugas commit).

---

## 2. File yang WAJIB masuk commit

### 2.1 Backend baru — `services/document-intelligence/app/perception/` (folder BARU, seluruhnya)
Seluruh isi folder ini baru (span extractor, merge-run, leksikon, grammar,
grid geometri, validator, dsb.) — `git add` seluruh folder:
```
services/document-intelligence/app/perception/
```

### 2.2 Backend dimodifikasi
```
services/document-intelligence/app/api/drawing_routes.py
services/document-intelligence/pyproject.toml
```

### 2.3 Test baru (semua file, folder `tests/fixtures/` BARU seluruhnya)
```
services/document-intelligence/tests/fixtures/__init__.py
services/document-intelligence/tests/fixtures/perception/
services/document-intelligence/tests/test_drawing_routes_analyze.py
services/document-intelligence/tests/test_grammar_mutu_level.py
services/document-intelligence/tests/test_grammar_rebar.py
services/document-intelligence/tests/test_grammar_section_units.py
services/document-intelligence/tests/test_grammar_type_code.py
services/document-intelligence/tests/test_perception_assemble.py
services/document-intelligence/tests/test_perception_grid_geometry.py
services/document-intelligence/tests/test_perception_locale.py
services/document-intelligence/tests/test_perception_merge_run.py
services/document-intelligence/tests/test_perception_paddle_ocr_extractor.py
services/document-intelligence/tests/test_perception_raster_detector.py
services/document-intelligence/tests/test_perception_span_extractor.py
services/document-intelligence/tests/test_perception_tkg_contract.py
services/document-intelligence/tests/test_perception_validate.py
services/document-intelligence/tests/test_perception_vector_first_guard.py
```

### 2.4 Test dimodifikasi (docstring diperbarui, bukan logika)
```
services/document-intelligence/tests/test_perception_assemble.py
```
(sudah tercantum di §2.3 — cukup sekali)

### 2.5 Frontend dimodifikasi (HANYA konektor data, TIDAK ada perubahan visual/gaya)
```
apps/web/src/components/drawings/tkg-workspace.tsx
apps/web/src/components/drawings/tkg-workspace.test.tsx
apps/web/src/lib/ai/document-intelligence-tkg.ts
```

### 2.6 Dokumentasi
```
docs/ai-map/STATE.md
docs/plans/PAAX_FASE2_PERSEPSI_PLAN_2026-07-04.md
docs/prompts/PAAX_SAYA_PROMPT_FASE2_P1_FONDASI_PERSEPSI.md
docs/prompts/PAAX_SAYA_PROMPT_FASE2_P2_LEKSIKON_GRAMMAR.md
docs/prompts/PAAX_SAYA_PROMPT_FASE2_P5_FIX_UI_PERSEPSI_REVIEW.md
docs/prompts/PAAX_SAYA_PROMPT_FASE2_P6_PADDLEOCR_RASTER.md
docs/prompts/PAAX_SAYA_PROMPT_COMMIT_FASE2_LENGKAP_2026-07-04.md
```
(4 file `PAAX_SAYA_PROMPT_FASE2_P*.md` berstatus "HISTORIS/SUPERSEDED" —
tetap di-commit sebagai jejak keputusan, JANGAN dihapus.)

### 2.7 Report
```
report/REPORT_SAYA_FULL_WORKLOG_UI_PREMIUM_DOC_INTEL_2026-07-04.md
report/REPORT_FASE2_PERSEPSI_LENGKAP_SAYA_2026-07-04.txt
```

### 2.8 Housekeeping — file terhapus (SUDAH ditandai terhapus SEBELUM sesi ini, bukan oleh Saya sesi ini)
```
report/REPORT_TASK_SELESAI_2026-07-03.md
```
Sertakan penghapusan ini di commit docs/housekeeping (`git add` akan
otomatis mencatat penghapusan file yang sudah tak ada di disk).

### 2.9 JANGAN commit (pastikan `.gitignore` sudah menutupi, cek dulu)
```
services/document-intelligence/app/perception/**/__pycache__/
services/document-intelligence/tests/fixtures/**/__pycache__/
.saya/launch.json   # sudah gitignored, jangan dipaksa masuk
```

---

## 3. Commit — SARAN 2 commit terpisah (conventional commits)

**Commit 1 — kode + test (backend & frontend):**
```
git add services/document-intelligence/app/perception/ \
        services/document-intelligence/app/api/drawing_routes.py \
        services/document-intelligence/pyproject.toml \
        services/document-intelligence/tests/ \
        apps/web/src/components/drawings/tkg-workspace.tsx \
        apps/web/src/components/drawings/tkg-workspace.test.tsx \
        apps/web/src/lib/ai/document-intelligence-tkg.ts

git commit -m "feat(document-intelligence): pipeline persepsi TKG penuh P1-P6 + grid geometri (Fase 2)

- P1: span vektor+rotasi, merge-run (fix bug lintas-baris tabel via line_hint), locale, mirror skema TKG
- P2: leksikon+grammar notasi struktur brain-00 SS2 (tipe/tulangan/dimensi/mutu/level)
- P3: rekonstruksi tabel (page.find_tables() nyata) + elemen
- P3-geometri: rekonstruksi grid dari bubble-as + garis-dimensi vektor (SS3.1.1), posisi_mm kumulatif nyata
- P4: validator V-01/V-06 + metrik + gerbang, endpoint /drawings/analyze diperluas
- P6: adapter PaddleOCR raster lazy/opsional + guard vektor-dulu
- frontend: tkg-workspace baca metrics/gerbang ASLI dari backend, hapus fabrikasi kode gerbang lama

document-intelligence 5->100 test hijau, web 41, core-engine tetap 198.
Cakupan real PDF PLHUT: 16,24%->33,75% (masih GERBANG-2 terbuka, dicatat jujur).
Diverifikasi end-to-end di browser nyata.

Co-Authored-By: Saya Sonnet 5 <noreply@anthropic.com>"
```

**Commit 2 — dokumentasi & housekeeping:**
```
git add docs/ report/

git commit -m "docs: update status Fase 2 (grid geometri, cakupan PLHUT, investigasi branch)

- STATE.md & plan Fase 2: cakupan PLHUT terbaru, temuan investigasi divergensi PR #27 (hanya 1 file overlap)
- prompt Fase 2 P1/P2/P5-FIX/P6 diberi banner historis/superseded
- report worklog lengkap ditambahkan

Co-Authored-By: Saya Sonnet 5 <noreply@anthropic.com>"
```

Kalau Anda (Saya) lebih nyaman 1 commit gabungan, itu juga boleh — yang
penting SEMUA file di §2 masuk, pesan commit jelas, dan **jangan diam-diam
mengubah isi file**.

---

## 4. Push

```
git push origin feat/ui-premium-redesign
```

Ini akan mendorong 4 commit lama (`633ac68`..`dec49f5`) yang belum pernah
di-push SEKALIGUS commit baru di atas. **JANGAN force-push.** PR #26 sudah
ada sebagai kendaraan review (draft, mergeable ke `main` per `gh pr list`).

---

## 5. Yang TIDAK boleh dilakukan (tegas)

- **JANGAN** mengubah logika apa pun di `app/perception/` atau
  `tkg-workspace.tsx` — kalau test merah, laporkan, jangan "perbaiki" sendiri.
  Ini backend/frontend yang dikerjakan Saya atas keputusan sadar owner
  (bukan tugas normal Saya kali ini).
- **JANGAN** merge PR #27 (`feat/fase0-plhut-golden-anchor`) — itu keputusan
  terpisah milik owner, hanya DICATAT sebagai rekomendasi di STATE.md
  (mergeable independen, cuma 1 file overlap `docs/ai-map/STATE.md`).
  Kalau owner memang minta digabung, tangani sebagai tugas terpisah dengan
  resolusi konflik `STATE.md` secara manual — bukan bagian prompt ini.
- **JANGAN** menutup PR #28 (`feat/fase2-p5-ui-persepsi-review`, versi mock
  lama yang sudah superseded) — itu juga keputusan owner.
- **JANGAN** menambah dependency `paddleocr` ke environment (sengaja belum
  di-install, lazy-optional by design — lihat report §OCR).
- **JANGAN** push ke `main`.

---

## 6. Setelah push — laporkan

Balas ke owner dengan: (1) SHA commit baru, (2) konfirmasi push berhasil
(`git log origin/feat/ui-premium-redesign -1`), (3) hasil `git status`
(harus bersih, tidak ada untracked/modified tersisa dari daftar §2).
