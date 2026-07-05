# REPORT FASE X1 - BRIDGING GALIAN FOOTPLAT

Tanggal eksekusi: 2026-07-05
Branch kerja: `feat/fase-x1-bridging-galian-footplat`
Prompt sumber: `docs/prompts/PAAX_CODEX_PROMPT_FASE_X1_BRIDGING_GALIAN_FIX_ARSITEKTUR_2026-07-15.md`

## Ringkasan

Fase X1 dikerjakan sebagai vertical slice terbatas untuk memperbaiki arsitektur WBS/kategori dari Fase V/W dan menambahkan bridge `GalianFootplat` untuk `pondasi_telapak`.

Perubahan utama:
- WBS tidak lagi dibaca oleh `document-intelligence` dari file `core-engine` memakai filesystem/importlib.
- WBS dipindahkan menjadi helper Python shared di `packages/schemas/python/paax_schemas/wbs.py`.
- Prefiks/kategori TKG dipindahkan menjadi helper shared di `packages/schemas/python/paax_schemas/tkg_taxonomy.py`.
- `work_items.py` tidak lagi memakai daftar literal `_STRUCTURAL_CATEGORIES`.
- Kategori seperti `gording`, `kuda_kuda`, `ikatan_angin`, dan `trekstang` sekarang berasal dari taksonomi shared dan masuk WBS `III - Pekerjaan Struktur`, bukan `LAINNYA`.
- Bridge `pondasi_telapak -> galian_footplat` ditambahkan di `services/document-intelligence/app/perception/bridging_tanah.py`.
- Bridge tidak menghitung volume sendiri. Bila data lengkap, bridge membentuk payload dan memanggil `core-engine /takeoff/tanah`.
- Bila dimensi atau kedalaman tidak tersedia, output menjadi `perlu_review` dengan alasan spesifik dan tanpa volume palsu.

## 1. Perbaikan Arsitektur WBS dan Kategori

### 1.1 WBS Shared

Sebelum fase ini, `services/document-intelligence/app/perception/work_items.py` memuat `services/core-engine/app/rab/sections.py` dengan `importlib.util.spec_from_file_location`. Ini membuat `document-intelligence` bergantung pada layout folder service lain.

Perbaikan:
- Ditambahkan `packages/schemas/python/paax_schemas/wbs.py`.
- `services/core-engine/app/rab/sections.py` memakai shared WBS tersebut.
- `services/document-intelligence/app/perception/work_items.py` juga memakai shared WBS tersebut.

Tes yang menjaga regresi:
- `test_work_items_does_not_import_core_engine_sections_by_filesystem_path`
- Assertion memastikan `work_items.py` tidak memuat string `spec_from_file_location`.
- Assertion memastikan `work_items.py` tidak memuat string `core-engine`.

### 1.2 Kategori TKG Shared

Sebelum fase ini, `work_items.py` punya daftar literal kategori struktur yang tidak lengkap. Akibatnya kategori yang sudah dikenal core seperti `gording`, `kuda_kuda`, `ikatan_angin`, dan `trekstang` bisa jatuh ke `LAINNYA`.

Perbaikan:
- Ditambahkan `packages/schemas/python/paax_schemas/tkg_taxonomy.py`.
- Taksonomi memuat `PREFIKS`, `kategori_dari_kode()`, dan `known_tkg_categories()`.
- `services/core-engine/app/tkg/takeoff.py` memakai `kategori_dari_kode()` dari shared package.
- `services/document-intelligence/app/perception/consolidate.py` memakai `kategori_dari_kode()` saat registry elemen dibuat dari kode gambar.
- `services/document-intelligence/app/perception/work_items.py` memakai `known_tkg_categories()` dan fallback `kategori_dari_kode(entry.kode)`.

Bukti kategori yang sekarang ter-cover:
- `gording`
- `kuda_kuda`
- `ikatan_angin`
- `trekstang`

Semua kategori TKG dari shared taxonomy diuji agar tidak masuk WBS `LAINNYA`.

Tes terkait:
- `test_structural_categories_map_to_wbs_section_iii_via_core_normalize_section`
- `test_all_known_tkg_categories_map_to_explicit_wbs_section_not_lainnya`
- `test_work_items_derives_pondasi_telapak_category_from_code_when_missing`

## 2. Bridge Galian Footplat

### 2.1 Lokasi Implementasi

File baru:
- `services/document-intelligence/app/perception/bridging_tanah.py`

Integrasi:
- `services/document-intelligence/app/perception/work_items.py`
- `services/document-intelligence/app/api/tkg_routes.py`

Endpoint work-items sekarang membuat client tanah opsional dari environment:
- `PAAX_CORE_ENGINE_URL`
- `CORE_ENGINE_URL`

Jika environment tidak tersedia dan data memang butuh engine, item menjadi `perlu_review`, bukan dihitung lokal.

### 2.2 Data yang Dibentuk

Untuk `pondasi_telapak`, bridge membentuk input `GalianFootplat`:
- `kode`: dari entry canonical, contoh `PC1`.
- `b_ft`: dari dimensi entry, menerima `b`, `b_ft`, `lebar`, atau `lebar_bawah`.
- `l_ft`: dari dimensi entry, menerima `l`, `l_ft`, `panjang`, atau `panjang_bawah`.
- `d_gali`: dari `d_gali` atau `kedalaman_galian`.
- `n`: jumlah `entry.instances`, fallback `1` bila kosong.

Bridge sengaja tidak menebak:
- Jika `b/l` tidak ada, status `perlu_review`.
- Jika `d_gali` tidak ada, status `perlu_review`.
- Volume tidak diisi pada status review.

### 2.3 Manual Anchor

Tes anchor lengkap memakai data sintetis:
- `b_ft = 1.0 m`
- `l_ft = 1.0 m`
- `d_gali = 1.5 m`
- `n = 4`
- `w_kerja = 0.3 m` dari respons fake engine

Formula engine:
`(b_ft + 2*w_kerja) x (l_ft + 2*w_kerja) x d_gali x n`

Anchor:
`(1 + 2 x 0.3) x (1 + 2 x 0.3) x 1.5 x 4 = 15.36 m3`

Tes memastikan payload dikirim ke client tanah dan hasil volume berasal dari respons engine, bukan hitungan manual di `document-intelligence`.

Tes terkait:
- `test_bridge_galian_footplat_without_depth_requires_review_and_no_volume`
- `test_bridge_galian_footplat_incomplete_dimensions_requires_specific_review`
- `test_bridge_galian_footplat_complete_dimensions_calls_tanah_engine_client`
- `test_work_items_pondasi_telapak_without_depth_is_review_not_unsupported`

## 3. Smoke PLHUT

Smoke dijalankan terhadap:
`C:\Users\Nothing\Downloads\GAMBAR KERJA PLHUT SURAKARTA (1).pdf`

Hasil:
- Jumlah halaman: 88
- Registry total: 42
- Entry `pondasi_telapak`: 13
- Item bridge `galian_footplat`: 13
- Status `dihitung`: 0
- Status `perlu_review`: 13

Alasan review:
- 13 item: `dimensi footplat tidak lengkap di gambar: b, l`

Daftar item bridge dari smoke:
- `P1`: perlu review, dimensi kosong, `n=7`, halaman `[4, 21]`
- `P3`: perlu review, dimensi kosong, `n=6`, halaman `[4, 21, 22]`
- `P4`: perlu review, dimensi kosong, `n=2`, halaman `[4, 21]`
- `P5`: perlu review, dimensi kosong, `n=1`, halaman `[4]`
- `P6`: perlu review, dimensi kosong, `n=1`, halaman `[4]`
- `P7`: perlu review, dimensi kosong, `n=1`, halaman `[4]`
- `P2`: perlu review, dimensi kosong, `n=3`, halaman `[4, 21, 22]`
- `P150`: perlu review, dimensi kosong, `n=1`, halaman `[4]`
- `F2`: perlu review, dimensi kosong, `n=5`, halaman `[16, 17]`
- `F1`: perlu review, dimensi kosong, `n=21`, halaman `[16, 17]`
- `PC1`: perlu review, dimensi kosong, `n=12`, halaman `[39]`
- `PC2`: perlu review, dimensi kosong, `n=6`, halaman `[39]`
- `PC3`: perlu review, dimensi kosong, `n=3`, halaman `[39]`

Interpretasi:
- Bridge sudah aktif karena entry dari kode `P/F/PC` dikenali sebagai `pondasi_telapak`.
- Tidak ada volume dihitung karena registry PLHUT hasil persepsi belum membawa dimensi footplat `b/l` dan belum membawa `d_gali`.
- Ini sesuai aturan fase X1: tidak menebak dimensi dan tidak membuat volume palsu.

## 4. Verifikasi

Tes merah sebelum implementasi:
- `known_tkg_categories` belum ada di `work_items.py`.
- `app.perception.bridging_tanah` belum ada.

Tes fokus setelah implementasi:
- Command: `python -m pytest -q tests/test_perception_work_items.py tests/test_perception_bridging_tanah.py`
- Hasil: `10 passed, 1 warning`

Document Intelligence:
- Command: `python -m pytest -q`
- Hasil akhir: `148 passed, 5 skipped, 2 warnings`

Core Engine:
- Command: `python -m pytest -q`
- Hasil akhir: `279 passed, 1 warning`

Packages Schemas:
- Command: `pnpm build`
- Hasil: success
- Command: `pnpm test`
- Hasil: `12 passed`

Apps Web:
- Command: `pnpm vitest run`
- Hasil: `13 passed`, `47 tests passed`
- Command: `pnpm tsc --noEmit`
- Hasil: success

## 5. File yang Diubah

File baru:
- `packages/schemas/python/paax_schemas/__init__.py`
- `packages/schemas/python/paax_schemas/wbs.py`
- `packages/schemas/python/paax_schemas/tkg_taxonomy.py`
- `services/document-intelligence/app/perception/bridging_tanah.py`
- `services/document-intelligence/tests/test_perception_bridging_tanah.py`
- `report-remote/REPORT_FASE_X1_BRIDGING_GALIAN_CODEX_2026-07-05.md`

File diubah:
- `services/core-engine/app/rab/sections.py`
- `services/core-engine/app/tkg/takeoff.py`
- `services/document-intelligence/app/api/tkg_routes.py`
- `services/document-intelligence/app/perception/consolidate.py`
- `services/document-intelligence/app/perception/work_items.py`
- `services/document-intelligence/tests/test_perception_work_items.py`

File prompt baru yang ikut dicatat:
- `docs/prompts/PAAX_CODEX_PROMPT_FASE_X1_BRIDGING_GALIAN_FIX_ARSITEKTUR_2026-07-15.md`

## 6. Pending

Belum ada volume nyata dari PLHUT karena data persepsi belum mengeluarkan dimensi footplat dan kedalaman galian. Pekerjaan lanjutan yang diperlukan:
- Ekstraksi dimensi footplat dari tabel/detail PLHUT ke `ElementDefinisi.dimensi`.
- Sumber eksplisit `d_gali` dari gambar atau input manual user.
- Setelah `b/l/d_gali` tersedia, bridge yang sama bisa menghasilkan status `dihitung` lewat `core-engine /takeoff/tanah`.

## 7. Commit dan PR

Commit dan PR akan dilengkapi setelah commit/push dibuat dari hasil kerja ini.
