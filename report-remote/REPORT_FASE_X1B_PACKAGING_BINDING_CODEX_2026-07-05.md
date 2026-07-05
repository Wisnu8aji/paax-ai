# REPORT FASE X1B - PACKAGING PAAX SCHEMAS + INVESTIGASI BINDING FOOTPLAT

Tanggal eksekusi: 2026-07-05
Branch kerja: `feat/fase-x1b-packaging-binding-footplat`
Prompt sumber: `docs/prompts/PAAX_CODEX_PROMPT_FASE_X1B_PACKAGING_FIX_DAN_BINDING_DIMENSI_FOOTPLAT_2026-07-16.md`

## Ringkasan

Fase X1B memperbaiki masalah arsitektur yang tersisa dari X1: `paax_schemas` sekarang menjadi package Python installable, bukan folder yang hanya bisa ditemukan lewat `sys.path.insert`.

Hasil utama:
- `packages/schemas/python/pyproject.toml` ditambahkan untuk package `paax-schemas` versi `0.1.0`.
- `services/core-engine/pyproject.toml` mencatat dependency `paax-schemas`.
- `services/document-intelligence/pyproject.toml` mencatat dependency path editable `paax-schemas`.
- `.github/workflows/ci.yml` menginstal shared Python schemas sebelum service Python dan menjalankan test core-engine + document-intelligence.
- `README.md` Quick Start diperbarui agar install shared Python schemas dilakukan sebelum install service.
- Fallback `try/except ModuleNotFoundError` dan `sys.path.insert` dihapus dari import `paax_schemas`.
- Test baru membuktikan import `paax_schemas` berhasil dari proses Python bersih tanpa `PYTHONPATH`.

## 1. Packaging `paax_schemas`

### Sebelum Perbaikan

Tes merah yang ditambahkan:
- `services/core-engine/tests/test_paax_schemas_packaging.py`
- `services/document-intelligence/tests/test_paax_schemas_packaging.py`
- perluasan test source di `services/document-intelligence/tests/test_perception_work_items.py`

Kegagalan awal:
```text
ModuleNotFoundError: No module named 'paax_schemas'
```

Test source juga gagal karena masih ada:
```text
sys.path.insert
except ModuleNotFoundError
```

### Setelah Perbaikan

Install editable berhasil:
```text
python -m pip install -e packages\schemas\python
Successfully installed paax-schemas-0.1.0
```

Import langsung yang sekarang dipakai:
```python
from paax_schemas.tkg_taxonomy import PREFIKS as _PREFIKS, kategori_dari_kode
from paax_schemas.wbs import WBS_SECTIONS, normalize_section, section_title
```

Tidak ada fallback tersisa di file target:
```text
rg "sys\.path\.insert|except ModuleNotFoundError" services/core-engine/app services/document-intelligence/app
```

Hasilnya kosong untuk source target.

Validasi metadata install:
```text
python -m pip install -e . --dry-run
```

Dari `services/core-engine`:
```text
Would install paax-core-engine-0.6.0 paax-schemas-0.1.0
```

Dari `services/document-intelligence`:
```text
Would install paax-document-intelligence-0.5.0 paax-schemas-0.1.0
```

## 2. Investigasi Dimensi dan Kedalaman Footplat PLHUT

PDF yang dipakai:
```text
C:\Users\Nothing\Downloads\GAMBAR KERJA PLHUT SURAKARTA (1).pdf
```

### 2.1 Output Pipeline

Pipeline `assemble_document_from_pdf_bytes` terhadap PDF 88 halaman menghasilkan:
```text
SHEETS 88
TABLE_SHEETS [(51, 2, 13, 'TABEL BALOK LANTAI 1 & SLOOF'), (52, 5, 34, 'TABEL BALOK LANTAI 2')]
```

Artinya tabel yang benar-benar menjadi `TkgTable/TypeRecord` hanya tabel balok/sloof halaman 51-52. Tidak ada `TypeRecord` footplat yang membawa `dimensi`.

Entry `pondasi_telapak` hasil konsolidasi:
```text
P1   n=7  dimensi={} pages=[4, 21]
P3   n=6  dimensi={} pages=[4, 21, 22]
P4   n=2  dimensi={} pages=[4, 21]
P5   n=1  dimensi={} pages=[4]
P6   n=1  dimensi={} pages=[4]
P7   n=1  dimensi={} pages=[4]
P2   n=3  dimensi={} pages=[4, 21, 22]
P150 n=1  dimensi={} pages=[4]
F2   n=5  dimensi={} pages=[16, 17]
F1   n=21 dimensi={} pages=[16, 17]
PC1  n=12 dimensi={} pages=[39]
PC2  n=6  dimensi={} pages=[39]
PC3  n=3  dimensi={} pages=[39]
```

### 2.2 Bukti Halaman Detail Pondasi

Halaman 49 memuat teks mentah:
```text
1500
1300
1500
100
1300
PC 1
1500
100
600
DETAIL PONDASI
1900
1600
PC 2
100
PC 3
1200
D16 - 150
D16 - 150
D13- 200
400
1300
400
300
600
400
300
400
900
```

Tetapi `page.find_tables()` halaman 49 hanya menghasilkan:
```text
TABLE 1: title block administratif
TABLE 2: ['300 600 400', '', '']
TABLE 3: ['400', '']
```

Tidak ada tabel dengan kolom `kode` + `dimensi` yang bisa langsung diproses oleh parser tabel saat ini.

### 2.3 Kesimpulan Investigasi

Kesimpulan untuk prompt X1B:
- Ini bukan bug alias field sempit di `bridging_tanah.py`.
- Bridge sudah mencari alias `b`, `b_ft`, `lebar`, `lebar_bawah`, `l`, `l_ft`, `panjang`, dan `panjang_bawah`.
- Masalahnya: data dimensi footplat PLHUT belum sampai ke `TypeRecord.dimensi`.
- Halaman detail pondasi memang punya angka dan kode, tetapi bentuknya detail/grafis, bukan tabel kode-dimensi yang parser saat ini bisa bind otomatis.
- Karena itu tidak ada perbaikan ekstraksi dimensi yang dipaksakan di fase ini.

Untuk `d_gali`:
- Pencarian teks `GALIAN`, `KEDALAMAN`, `D_GALI`, `D GALI`, `PEIL`, `ELEVASI`, `DASAR`, `TANAH` tidak menemukan sumber kedalaman galian eksplisit untuk footplat.
- Hit hanya administratif/konteks umum seperti `Lantai Dasar`, `TANAH ASLI`, dan `PENULANGAN PELAT DGN ELEVASI BERBEDA`.
- Status `perlu_review` untuk kedalaman tetap benar.

## 3. Verifikasi

Tes packaging fokus setelah perbaikan:
```text
services/core-engine: 1 passed
services/document-intelligence: 2 passed, 1 warning
```

Full verification:
```text
services/core-engine: 280 passed, 1 warning
services/document-intelligence: 149 passed, 5 skipped, 2 warnings
packages/schemas pnpm build: success
packages/schemas pnpm test: 12 passed
apps/web pnpm vitest run: 13 files passed, 47 tests passed
apps/web pnpm tsc --noEmit: success
```

## 4. File yang Diubah

File baru:
- `packages/schemas/python/pyproject.toml`
- `services/core-engine/tests/test_paax_schemas_packaging.py`
- `services/document-intelligence/tests/test_paax_schemas_packaging.py`
- `report-remote/REPORT_FASE_X1B_PACKAGING_BINDING_CODEX_2026-07-05.md`

File diubah:
- `.github/workflows/ci.yml`
- `README.md`
- `services/core-engine/app/rab/sections.py`
- `services/core-engine/app/tkg/takeoff.py`
- `services/core-engine/pyproject.toml`
- `services/document-intelligence/app/perception/consolidate.py`
- `services/document-intelligence/app/perception/work_items.py`
- `services/document-intelligence/pyproject.toml`
- `services/document-intelligence/tests/test_perception_work_items.py`

File prompt baru:
- `docs/prompts/PAAX_CODEX_PROMPT_FASE_X1B_PACKAGING_FIX_DAN_BINDING_DIMENSI_FOOTPLAT_2026-07-16.md`

## 5. Commit dan PR

Commit sesi ini yang membawa implementasi X1B:
```text
6f355a7fb533c158fd17782f0fca11f27bd44064
fix(packaging): install shared paax schemas


```

PR:
- Draft PR: https://github.com/Wisnu8aji/paax-ai/pull/38
- Base: `main`
- Head: `feat/fase-x1b-packaging-binding-footplat`
- Status saat report diperbarui: draft, open, belum merge.

Catatan audit:
- Output `git log -1 --format="%H%n%s%n%n%b" 6f355a7` disalin mentah di atas.
- Body commit kosong, sehingga tidak ada trailer `Co-Authored-By` atau signature lain pada commit utama.
- Commit dokumentasi kecil setelah PR dibuat hanya mencatat link PR/report final di branch.

## 6. Pending

Pending untuk fase berikutnya:
- Ekstraksi dimensi footplat dari detail/grafis halaman 49 perlu fase terpisah. Ini bukan sekadar alias field di bridge.
- Sumber `d_gali` perlu input manual atau ekstraksi dari sumber gambar/detail yang eksplisit bila tersedia di dokumen lain.
- Tidak ada perubahan pada `services/core-engine/app/takeoff/tanah.py`.
- Tidak ada perubahan pada `apps/web/**`.
