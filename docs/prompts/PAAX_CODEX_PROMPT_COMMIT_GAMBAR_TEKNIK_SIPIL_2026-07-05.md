# PROMPT CODEX — COMMIT Rencana Besar Gambar Teknik Sipil (Fase 0-H, 2026-07-05)

> Ditulis Claude, 2026-07-05 malam. **Tugas ini HANYA commit + push — TIDAK
> ADA kode yang perlu ditulis ulang atau diperbaiki.** Semua implementasi
> (backend `services/document-intelligence`, frontend `apps/web`, dokumentasi)
> sudah dikerjakan LANGSUNG oleh Claude sesuai arahan owner ("jalankan fase
> satu-persatu tanpa menunggu persetujuan"), sudah diverifikasi lewat 412 test
> otomatis + 1 uji langsung di browser (drag-drop upload → job async → Review
> Gambar). **JANGAN mengubah logika apa pun** di file yang disebut di bawah —
> kalau ada godaan "memperbaiki" sesuatu, STOP dan laporkan ke owner.

---

## 0. Konteks singkat

Rencana besar: `docs/plans/PAAX_GAMBAR_TEKNIK_SIPIL_BIG_PLAN_2026-07-05.md`.
Ringkasan hasil per fase: `docs/ai-map/STATE.md` §"RENCANA BESAR GAMBAR KERJA
— FASE 0-H SELESAI". Working tree SEKARANG di branch `main` langsung (bukan
`feat/ui-premium-redesign` lagi — branch itu SUDAH di-merge Codex sebelum
sesi ini dimulai, lihat `git log` commit `97161a4`/`38ac2ef`).

**Fitur yang dibangun**: zone classifier per sheet, label→grid binding (§5,
alamat "A1"/offset "B-offset_sebelum_1"), konsolidasi lintas-halaman
(`ConsolidatedExtraction`), proses latar belakang (async job + polling),
PaddleOCR sungguhan (terpasang, ada catatan jujur soal inferensi), dan UI
"Review Gambar" ramah pengguna (drag-drop, animasi progres nyata, istilah
teknis disembunyikan dari tampilan utama).

---

## 1. Verifikasi WAJIB sebelum commit (jangan commit kalau ada yang merah)

```powershell
cd services/document-intelligence
python -m pytest -q
# harapan: 130 passed, 1 skipped (skip = butuh env PAAX_PLHUT_PDF, PDF asli
# di luar repo — normal). Kalau PAAX_PLHUT_PDF diisi: 131 passed.

cd ../core-engine
python -m pytest -q
# harapan: 238 passed (TIDAK BERUBAH — service ini tak disentuh sesi ini)

cd ../../apps/web
pnpm vitest run
pnpm tsc --noEmit
# harapan: 43 passed, tsc exit 0 (tanpa output)
```

Kalau salah satu merah: **JANGAN commit.** Laporkan pesan error lengkap ke
owner, jangan mencoba memperbaiki sendiri (di luar scope tugas commit).

---

## 2. File yang WAJIB masuk commit

### 2.1 Backend baru
```
services/document-intelligence/app/perception/zone_classifier.py
services/document-intelligence/app/perception/binding.py
services/document-intelligence/app/perception/consolidate.py
services/document-intelligence/app/perception/consolidated_models.py
```

### 2.2 Backend dimodifikasi
```
services/document-intelligence/app/api/drawing_routes.py
services/document-intelligence/app/perception/assemble.py
services/document-intelligence/app/perception/ocr/paddle_ocr_extractor.py
services/document-intelligence/app/perception/tkg/models.py
services/document-intelligence/app/perception/vector/grid_geometry.py
services/document-intelligence/pyproject.toml
services/core-engine/app/tkg/models.py
packages/schemas/src/index.ts
```
(3 mirror model `SheetMeta`/`ElementInstance` — field baru `zone`/`alamat_list`/
`alamat_needs_review` — HARUS tetap identik strukturnya di ketiganya, sudah
diverifikasi via `test_perception_tkg_contract.py`, jangan diubah manual.)

### 2.3 Test baru
```
services/document-intelligence/tests/test_perception_zone_classifier.py
services/document-intelligence/tests/test_perception_binding.py
services/document-intelligence/tests/test_perception_consolidate.py
```

### 2.4 Test dimodifikasi
```
services/document-intelligence/tests/test_perception_assemble.py
services/document-intelligence/tests/test_perception_grid_geometry.py
services/document-intelligence/tests/test_perception_paddle_ocr_extractor.py
services/document-intelligence/tests/test_drawing_routes_analyze.py
```

### 2.5 Frontend dimodifikasi
```
apps/web/src/lib/ai/document-intelligence-tkg.ts
apps/web/src/components/drawings/tkg-workspace.tsx
apps/web/src/components/drawings/tkg-workspace.test.tsx
```
**PENTING**: perubahan frontend adalah **fungsional/pengkabelan saja**
(drag-drop, async job, tampilan Review Gambar) — **TIDAK ADA restyle
visual/tema/warna**. Sesuai instruksi owner: redesign visual besar ditunda
untuk sesi terpisah dengan Opus 4.8; sesi ini HANYA mengubah cara
data ditampilkan (istilah, struktur info), bukan gaya visualnya.

### 2.6 Dokumentasi
```
docs/ai-map/STATE.md
docs/BRAIN_ALIGNMENT.md
docs/pages/gambar-kerja.md
docs/plans/PAAX_GAMBAR_TEKNIK_SIPIL_BIG_PLAN_2026-07-05.md   (BARU)
docs/prompts/PAAX_CODEX_PROMPT_COMMIT_FASE2_LENGKAP_2026-07-04.md
docs/prompts/PAAX_CODEX_PROMPT_COMMIT_GAMBAR_TEKNIK_SIPIL_2026-07-05.md   (BARU, file ini)
```

### 2.7 File pra-eksisting TIDAK terkait sesi ini (jangan bingung, tapi tetap commit kalau memang belum ter-commit)
```
docs_summary.txt
report/PAAX_AUDIT_REPORT_PROMPT_2026-07-04.txt
```
File-file ini sudah ada di working tree SEBELUM sesi 2026-07-05 dimulai
(bukan dibuat Claude sesi ini) — commit sebagai housekeeping terpisah kalau
memang belum pernah masuk commit, atau tanyakan owner kalau ragu isinya
relevan/tidak. JANGAN dihapus tanpa konfirmasi.

---

## 3. Commit — SARAN 2 commit terpisah (conventional commits)

**Commit 1 — kode + test (backend & frontend):**
```
git add services/document-intelligence/app/perception/zone_classifier.py \
        services/document-intelligence/app/perception/binding.py \
        services/document-intelligence/app/perception/consolidate.py \
        services/document-intelligence/app/perception/consolidated_models.py \
        services/document-intelligence/app/api/drawing_routes.py \
        services/document-intelligence/app/perception/assemble.py \
        services/document-intelligence/app/perception/ocr/paddle_ocr_extractor.py \
        services/document-intelligence/app/perception/tkg/models.py \
        services/document-intelligence/app/perception/vector/grid_geometry.py \
        services/document-intelligence/pyproject.toml \
        services/document-intelligence/tests/ \
        services/core-engine/app/tkg/models.py \
        packages/schemas/src/index.ts \
        apps/web/src/lib/ai/document-intelligence-tkg.ts \
        apps/web/src/components/drawings/tkg-workspace.tsx \
        apps/web/src/components/drawings/tkg-workspace.test.tsx

git commit -m "feat(document-intelligence): zone classifier, label-grid binding, konsolidasi lintas-halaman, async job, PaddleOCR nyata (rencana besar 2026-07-05)

- Zone classifier: judul+skala+zona paket-pekerjaan per sheet dari teks nyata (bukan placeholder)
- Label->grid binding (SS5): alamat elemen nyata (A1) atau notasi offset (B-offset_sebelum_1)
- Konsolidasi lintas-halaman: ConsolidatedExtraction (grid kanonik, element registry, assumption ledger, dimensi bangunan)
- Proses latar belakang: POST /drawings/analyze/start + GET /drawings/analyze/status/{job_id}
- PaddleOCR sungguhan terpasang (paddleocr 3.7.0 + paddlepaddle 3.3.1); adapter degradasi anggun saat inferensi native gagal
- Frontend: drag-drop upload, animasi progres nyata, Review Gambar ramah pengguna menggantikan panel teknis mentah, tombol Generate RAB placeholder

document-intelligence 92->131 test hijau, core-engine tetap 238, web 43.
Cakupan real PDF PLHUT: 33,75%->36,11%. Diverifikasi end-to-end di browser nyata.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

**Commit 2 — dokumentasi:**
```
git add docs/

git commit -m "docs: update status rencana besar gambar teknik sipil (Fase 0-H, 2026-07-05)

- STATE.md & plan besar: hasil nyata tiap fase, angka test final, cakupan PLHUT
- BRAIN_ALIGNMENT.md & pages/gambar-kerja.md diselaraskan dgn pipeline vektor nyata
- prompt Codex Fase2 lama ditandai historis/superseded (sudah merge duluan)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

Kalau Anda (Codex) lebih nyaman 1 commit gabungan, itu juga boleh — yang
penting SEMUA file di §2 masuk, pesan commit jelas, dan **jangan diam-diam
mengubah isi file**.

---

## 4. Push

```
git push origin main
```

**PENTING**: working tree sekarang di `main` LANGSUNG (bukan branch fitur).
Sebelum push, jalankan `git log --oneline -5` dan `git status` untuk
memastikan tidak ada commit orang lain yang perlu di-pull dulu (fast-forward
check) — kalau ada divergensi, **JANGAN force-push**, laporkan ke owner.

---

## 5. Yang TIDAK boleh dilakukan (tegas)

- **JANGAN** mengubah logika apa pun di file yang disebut §2 — kalau test
  merah, laporkan, jangan "perbaiki" sendiri.
- **JANGAN** menambah styling/redesign visual di `tkg-workspace.tsx` — sesi
  ini murni fungsional, redesign visual besar ditunda ke sesi Opus 4.8 lain.
- **JANGAN** mengaktifkan/menyambungkan tombol "Generate RAB" — itu SENGAJA
  placeholder disabled, wiring-nya tugas terpisah setelah owner konfirmasi
  ekstraksi sudah benar.
- **JANGAN** menjalankan Fase D (deteksi simbol grafis) — itu SENGAJA ditunda
  jujur, jangan dipaksakan jadi selesai tanpa riset lebih dalam.
- **JANGAN** push ke branch selain `main` kecuali diminta eksplisit.

---

## 6. Setelah push — laporkan

Balas ke owner dengan: (1) SHA commit baru, (2) konfirmasi push berhasil
(`git log origin/main -1`), (3) hasil `git status` (harus bersih).
