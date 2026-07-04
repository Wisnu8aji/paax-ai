# REPORT CODEX — Fase M/N: V-03 Fix + Impor AHSP CK 2026

Prompt: `docs/prompts/PAAX_CODEX_PROMPT_FASE_M_N_V03_FIX_AHSP_IMPORT_2026-07-08.md`
Branch: `feat/v03-fix-ahsp-catalog-import`
Base branch: `origin/feat/rab-nav-validator-audit-ahsp-suggest`
Alasan base: PR #29 dan PR #30 masih open/belum merged saat pekerjaan dimulai.
PR: `(diisi setelah PR dibuat)`

## Ringkasan

Fase M selesai. Validator V-03 tidak lagi memakai fingerprint grid penuh antar sheet `denah`. Sekarang validator membandingkan hanya label as yang sama-sama muncul di dua sheet. Denah subset yang sah tidak lagi menjadi `E-GRID`, tetapi konflik posisi label yang benar-benar berbeda tetap ditangkap.

Fase N selesai sebagai impor data mekanis. Katalog AHSP CK 2026 resmi dari `G:\paax-data\ahsp\cipta-karya-2026.json` berisi 2.542 item sudah disalin ke repo sebagai `data/ahsp/cipta-karya-2026.json`. File sample lama 4 item tidak dihapus dan tidak diubah.

## Fase M — V-03 Fix

File utama:
- `services/core-engine/app/tkg/validate.py`
- `services/core-engine/tests/test_tkg.py`

Perubahan validator:
- Mengganti logika V-03 dari fingerprint penuh menjadi perbandingan posisi label as yang overlap.
- Posisi axis memakai `GridAxis.posisi_mm` bila semua axis di keluarga sumbu punya posisi.
- Bila posisi tidak lengkap, posisi diturunkan dari rantai `bentang_x`/`bentang_y` memakai `grid_distance_m`.
- Jika irisan label kosong, validator tidak membuat error karena tidak ada dasar perbandingan.
- Jika label overlap berbeda melewati `params.tol_grid`, validator menambah `E-GRID` dengan subject seperti `x:B`.
- `_cek_v02` tidak diubah.

Test M:
- Marker `xfail(strict=True)` pada `test_v03_denah_subset_grid_pipeline_sah_tidak_menjadi_e_grid` dihapus.
- Test subset-grid sah sekarang lolos: sheet penuh A-B-C dan sheet subset B-C dengan posisi yang sama tidak menghasilkan `E-GRID`.
- Test baru `test_v03_tetap_menangkap_konflik_posisi_grid_yang_sungguh_berbeda` membuktikan posisi B berbeda 3000mm vs 3500mm tetap menjadi `E-GRID`.

Red/green:
- Sebelum fix, targeted pytest V-03 menghasilkan 2 failure.
- Setelah fix, targeted pytest V-03: 2 passed.
- `tests/test_tkg.py`: 36 passed.

## Fase N — Impor AHSP CK 2026

Sumber:
- AHSP: `G:\paax-data\ahsp\cipta-karya-2026.json`
- Master resource untuk cross-check: `G:\paax-data\harga-satuan\_resources_catalog.json`

Output repo:
- `data/ahsp/cipta-karya-2026.json`
- `report/AHSP_IMPORT_BATCH_FINDINGS_2026-07-08.md`

Hasil validasi 10 batch:

| Batch | OK parse | Gagal parse | Resource tak dikenal | Anomali/duplikasi |
|---:|---:|---:|---:|---:|
| 1 | 255 | 0 | 0 | 24 |
| 2 | 255 | 0 | 0 | 0 |
| 3 | 255 | 0 | 0 | 16 |
| 4 | 255 | 0 | 0 | 0 |
| 5 | 255 | 0 | 0 | 0 |
| 6 | 255 | 0 | 0 | 0 |
| 7 | 255 | 0 | 0 | 24 |
| 8 | 255 | 0 | 0 | 0 |
| 9 | 255 | 0 | 0 | 39 |
| 10 | 247 | 0 | 0 | 94 |
| **Total** | **2542** | **0** | **0 unique** | **197** |

Temuan penting:
- Semua item lolos parse Pydantic sebagai `AHSPItem`.
- Tidak ada `resource_code` AHSP yang tidak dikenal terhadap master resource.
- Ada 197 anomali mekanis, terutama `unit` kosong dan duplikasi resource dengan coefficient sama dalam satu item.
- Tidak ada nilai koefisien/nama/unit yang saya ubah. Semua item disalin apa adanya, temuan dicatat untuk review Claude/owner.

## Coverage Harga

Sebelum impor:
- `load_data()` memuat 4 AHSP sample.
- Region tersedia: `jateng`, `semarang`, `surakarta`.
- `jateng` coverage ratio: `1.0` untuk 12 resource sample.

Sesudah impor:
- `load_data()` memuat 2.546 AHSP: 2.542 resmi + 4 sample.
- Tidak ada collision kode antara file sample dan katalog baru.
- `jateng` coverage ratio: `0.0049`.
- Resource AHSP yang dipakai: 2.441.
- Resource yang punya harga `jateng`: 12.
- Missing resource `jateng`: 2.429.
- `compute_hsp` untuk kode baru seperti `1.1.1.1` fail-fast dengan `KeyError` karena HSD belum tersedia. Ini perilaku jujur, bukan bug.

## Test Baru Fase N

File:
- `services/core-engine/tests/test_ahsp_import_2026.py`
- `services/core-engine/tests/test_api.py`

Test yang ditambahkan:
- Loader memuat 2.546 AHSP dan sample lama tetap ada.
- Price binding untuk kode baru (`1.1.1.1`, `1.1.1.2`, `9.8.1.8`) menunjukkan `coverage_ratio < 1.0`.
- `compute_hsp` untuk kode baru gagal jujur jika harga `L.01` belum tersedia.
- `/data/coverage?region_code=jateng` melaporkan `ahsp_total=2546`, `coverage_ratio=0.0049`, dan 2.429 missing resource.

## Batasan yang Dijaga

- Tidak mengubah `_cek_v02`.
- Tidak menambah tolerance baru; tetap memakai `params.tol_grid`.
- Tidak mengubah nilai katalog AHSP resmi.
- Tidak menghapus/menyentuh `data/ahsp/cipta-karya.sample.json`.
- Tidak mengimpor `_resources_catalog.json` sebagai price book karena semua `price=0`.
- Tidak mengerjakan AHSP auto-suggest, deteksi simbol grafis, vision-LLM fallback, atau redesign visual.

## Verifikasi

Core Engine:
- `cd services/core-engine && python -m pytest -q`
- Hasil: **249 passed, 1 warning**
- Catatan: tidak ada xfail tersisa untuk V-03.

Web:
- `cd apps/web && pnpm vitest run`
- Hasil: **13 file test, 46 passed**
- `cd apps/web && pnpm tsc --noEmit`
- Hasil: **exit 0**

Document Intelligence:
- `cd services/document-intelligence && python -m pytest -q`
- Hasil: **126 passed, 5 skipped, 2 warnings**

## File Berubah

- `services/core-engine/app/tkg/validate.py`
- `services/core-engine/tests/test_tkg.py`
- `services/core-engine/tests/test_ahsp_import_2026.py`
- `services/core-engine/tests/test_api.py`
- `data/ahsp/cipta-karya-2026.json`
- `report/AHSP_IMPORT_BATCH_FINDINGS_2026-07-08.md`
- `report/REPORT_FASE_M_N_V03_FIX_AHSP_IMPORT_CODEX_2026-07-08.md`
- `docs/ai-map/STATE.md`
- `docs/plans/PAAX_GAMBAR_TEKNIK_SIPIL_BIG_PLAN_2026-07-05.md`
- `docs/prompts/PAAX_CODEX_PROMPT_FASE_M_N_V03_FIX_AHSP_IMPORT_2026-07-08.md`
