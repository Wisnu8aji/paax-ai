# REPORT FASE V/W SAYA - Normalisasi Kode + Work Item Grouping

Eksekusi lokal: 2026-07-05  
Prompt yang dijalankan: `docs/prompts/PAAX_SAYA_PROMPT_FASE_V_W_NORMALISASI_KODE_WORK_ITEMS_2026-07-14.md`  
Folder laporan: `report-remote/` sesuai instruksi owner untuk membedakan pekerjaan remote dari report desktop biasa.

## Ringkasan

Saya menjalankan prompt Fase V/W dengan urutan yang diminta: Step 0 commit backlog Fase S/T/U/U-2 terlebih dahulu, lalu membuat branch baru untuk Fase V/W. Fase V menormalkan kode elemen lintas-halaman secara deterministik, sedangkan Fase W menambahkan lapisan work item grouping yang hanya mengelompokkan hasil persepsi + takeoff engine tanpa menghitung angka baru.

Tidak ada merge ke `main`. Semua pekerjaan masuk branch dan PR draft sesuai gerbang review.

## Step 0 - Commit Backlog

Baseline verifikasi sebelum commit backlog cocok dengan klaim STATE:

- `services/core-engine`: 279 passed, 1 warning.
- `services/document-intelligence`: 136 passed, 5 skipped, 2 warnings.
- `apps/web`: Vitest 47 passed.
- `apps/web`: `pnpm tsc --noEmit` exit 0.

Commit backlog pada branch `fix/semarang-candidate-ranking-saya-direct`:

1. `f7cf974` - `fix(pricing): perbaikan ranking kandidat harga Semarang/Kejaksaan`
2. `56c5d53` - `feat(core-engine): AHSP auto-suggest untuk takeoff (Fase T)`
3. `d0e5421` - `fix(document-intelligence): grid-conflict relatif dan filter noise administratif`

PR backlog:

- https://github.com/Wisnu8aji/paax-ai/pull/35
- Status: draft.

## Fase V - Normalisasi Kode Lintas-Halaman

File utama:

- `services/document-intelligence/app/perception/consolidate.py`
- `services/document-intelligence/app/perception/consolidated_models.py`
- `services/document-intelligence/tests/test_perception_consolidate.py`

Pendekatan:

- Registry elemen sekarang memakai kode kanonik dari `_normalize_kode(raw)`.
- Regex inti:
  - normalisasi uppercase + trim spasi;
  - hapus tanda baca non-teknis;
  - buang kata generik tipe elemen di depan kode;
  - gabungkan pola prefix-huruf + spasi/hyphen + angka: `^([A-Z]+)[\s-]+(\d+[A-Z]*)$ -> \1\2`.
- Contoh yang sekarang menjadi satu entry: `K1`, `K-1`, `K 1`, `KOLOM K1` -> `K1`.
- Test negatif memastikan `K1`, `K11`, dan `K1A` tetap tidak tergabung.

Sumber kata generik:

- Tidak dibuat sebagai daftar WBS/taksonomi baru.
- Diambil dari `_PREFIKS` pada `services/core-engine/app/tkg/takeoff.py` via parser AST kecil, lalu kategori seperti `kolom`, `ring_balok`, `pondasi_telapak` diubah menjadi token generik untuk stripping awal.

Audit raw code:

- `ElementInstanceRef` mendapat field `kode_raw`.
- `ElementRegistryEntry` mendapat field `kode_asli`.
- Jadi data mentah dari gambar tetap tersedia walaupun key registry sudah kanonik.

Smoke PLHUT:

- File: `C:\Users\Nothing\Downloads\GAMBAR KERJA PLHUT SURAKARTA.pdf`
- Jumlah sheet: 15.
- Raw unique code sebelum normalisasi: 32.
- Registry entry sesudah normalisasi: 32.
- Kesimpulan: tidak ada collapse tak diinginkan pada fixture PLHUT yang kodenya sudah konsisten.
- Test env: `PAAX_PLHUT_PDF=... python -m pytest -q tests/test_perception_consolidate.py::test_smoke_real_plhut_consolidation_sane` -> 1 passed.

## Fase W - Work Item Grouping

File utama:

- `services/document-intelligence/app/perception/work_items.py`
- `services/document-intelligence/app/api/tkg_routes.py`
- `services/document-intelligence/tests/test_perception_work_items.py`
- `packages/schemas/src/index.ts`
- `packages/schemas/src/__tests__/schemas.test.ts`

Endpoint baru:

- `POST /drawings/tkg/work-items`

Input:

- `consolidated`: `ConsolidatedExtraction`.
- `takeoff_items`: list item takeoff dari core-engine.

Output:

- `DrawingWorkItemsResult`
- Field utama tiap item: `work_id`, `kode`, `kode_asli`, `kategori`, `work_type`, `uraian`, `wbs_section`, `wbs_title`, `formula_status`, `unit`, `volume`, `formula`, `rule_id`, `source_pages`, `element_refs`, `needs_review`, `review_reason`.

Aturan formula_status:

- `dihitung`: ada `TakeoffItem`, `quantity` terisi, dan `needs_review=false`; volume disalin apa adanya dari engine.
- `perlu_review`: kategori punya rumus, tetapi input/takeoff belum lengkap atau `needs_review=true`.
- `belum_didukung`: kategori belum punya rumus deterministik; volume dan unit tetap `null`.

Mapping WBS:

- Reuse `WBS_SECTIONS` dan `normalize_section()` dari `services/core-engine/app/rab/sections.py` via dynamic module load, bukan membuat WBS baru.
- Kategori struktural -> seksi `III` / `Pekerjaan Struktur`.
- Kategori MEP seperti `sanitasi`, `drainase`, `plumbing`, `listrik` -> seksi `V` / `Pekerjaan MEP`.
- Kategori arsitektur/finishing -> seksi `IV`.
- Kategori tanah/galian/urugan -> seksi `II`.
- Kategori tidak dikenal -> `LAINNYA`.

Kategori yang saat ini dianggap punya dukungan rumus bila ada takeoff item:

- `kolom`
- `kolom_praktis`
- `sloof`
- `balok`
- `ring_balok`
- `latei`
- `plat`
- `pondasi_telapak`
- `dinding_beton`
- `tangga`

Kategori yang saat ini ditandai belum didukung tanpa volume:

- `sanitasi`
- `drainase`
- `plumbing`
- `listrik`
- kategori lain di luar hasil takeoff struktural yang sudah tersedia.

## Hasil Test Lengkap

- `cd services/core-engine && python -m pytest -q`
  - 279 passed, 1 warning.
- `cd services/document-intelligence && python -m pytest -q`
  - 141 passed, 5 skipped, 2 warnings.
- `cd packages/schemas && pnpm build && pnpm test`
  - build OK.
  - Jest 12 passed.
- `cd apps/web && pnpm vitest run && pnpm tsc --noEmit`
  - Vitest 47 passed.
  - TypeScript exit 0.
- Smoke PLHUT:
  - `PAAX_PLHUT_PDF=C:\Users\Nothing\Downloads\GAMBAR KERJA PLHUT SURAKARTA.pdf python -m pytest -q tests/test_perception_consolidate.py::test_smoke_real_plhut_consolidation_sane`
  - 1 passed.

## Pending / Belum Didukung

- Fase W belum menambah rumus takeoff baru. Ini sengaja. Modul hanya grouping dan status.
- Kategori MEP/sanitasi/drainase belum diberi volume karena belum ada rumus deterministik yang aman.
- Kategori arsitektur/finishing yang belum keluar dari pipeline takeoff struktural tetap memerlukan fase lanjutan per trade.
- Regex normalisasi sengaja konservatif. Kasus yang tidak ditangani otomatis: kode dengan format non-prefiks yang tidak jelas atau kode yang mengandung kata generik di tengah, karena itu berisiko false-positive collapse.
- Tidak ada perubahan UI di `apps/web/src/components/**` atau `apps/web/src/app/**` untuk Fase V/W. UI Fase Y tetap di luar scope.

## Commit dan PR Fase V/W

Commit SHA Fase V/W: `efe51d3`  
PR Fase V/W: https://github.com/Wisnu8aji/paax-ai/pull/36  
Status PR: draft.

Langkah owner berikutnya:

1. Review PR backlog #35 karena Fase V/W berdiri di atas tiga commit backlog itu.
2. Review PR Fase V/W setelah link PR diisi.
3. Keputusan fase berikutnya: Fase X perlu prompt terpisah per trade untuk menambah rumus kategori yang sekarang `belum_didukung`.
