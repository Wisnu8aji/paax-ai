# REPORT FASE Q/R - Terapkan Hasil O/P + KEJAKSAAN Semarang

Tanggal eksekusi: 2026-07-11  
Branch: `feat/ahsp-unit-apply-semarang-import-kejaksaan`  
Base kerja: `origin/feat/ahsp-unit-gap-semarang-price-batch2` karena PR #29-#33 masih open dan fase ini bergantung pada hasil Fase O/P.  
PR: TBD

## Ringkasan

Fase Q menerapkan hasil yang sudah diverifikasi pada Fase O/P ke data produksi repo:

- 188 satuan AHSP CK 2026 diterapkan dari `report/AHSP_UNIT_GAP_RESOLUTION_2026-07-10.md`.
- `data/ahsp/cipta-karya-2026.json` sekarang memiliki 0 item dengan `unit=""` dari total 2.542 item.
- `data/harga-satuan/semarang.json` ditambahkan dari sumber lama `G:\paax-data\harga-satuan\semarang.json` berisi 23 resource, lalu ditambah 2 resource hasil Fase P yang sudah diputuskan:
  - `M.GEN.0085` - Baja Profil - `bahan/kg` - 12000.
  - `M.GEN.0456` - Sealtape - `bahan/buah` - 10000.
- 4 item ambigu Fase P tidak diterapkan.
- `data/harga-satuan/semarang_overrides.json` tidak diubah.

Fase R menambang sumber harga kedua `G:\AHSP\KEJAKSAAN.xlsx` sebagai laporan usulan saja:

- 121 baris dari sheet `HARGA BAHAN` berhasil diekstrak.
- Laporan baru: `report/HARGA_KEJAKSAAN_SEMARANG_2026-07-11.md`.
- Tidak ada harga KEJAKSAAN yang diterapkan ke `data/harga-satuan/semarang.json`.

## Perubahan Kode/Data

- `services/core-engine/app/rab/loader.py`
  - Loader sekarang hanya memuat file harga satuan JSON yang punya field `resources` berupa list.
  - Ini mencegah `semarang_overrides.json` dibaca sebagai price book kosong dan menimpa `semarang.json`.
- `data/ahsp/cipta-karya-2026.json`
  - 188 field `unit` yang kosong diisi persis dari marker `<!-- unit-gap-code:... -->` pada laporan Fase O.
- `data/harga-satuan/semarang.json`
  - File baru 25 resource untuk region `semarang`.
- `scripts/harga/kejaksaan_semarang_report.py`
  - Script deterministik untuk membaca `KEJAKSAAN.xlsx`, matching ke `_resources_catalog.json`, menampilkan kandidat dekat yang ditolak, dan membandingkan overlap dengan price book Semarang.
- Test baru:
  - `services/core-engine/tests/test_fase_q_apply_units_semarang.py`
  - `services/core-engine/tests/test_harga_kejaksaan_semarang.py`

## Coverage Semarang

Sebelum Fase Q:

- Region `semarang` terbaca dari `semarang_overrides.json`, tetapi price book kosong.
- Resource priced: 0.

Sesudah Fase Q:

- Resource unik dipakai AHSP CK 2026: 2.441.
- Resource priced Semarang: 25.
- Coverage ratio: 0.0102.

Catatan: coverage tetap sangat kecil dan itu benar. Fase ini hanya memasukkan 25 harga nyata Semarang yang sudah terverifikasi, bukan membuat harga baru dari katalog master.

## Hasil KEJAKSAAN

Sumber:

- Workbook: `G:\AHSP\KEJAKSAAN.xlsx`
- Sheet: `HARGA BAHAN`
- Kolom: B nama, E satuan, F harga/formula.

Ringkasan 121 baris:

- Matched aman: 24.
- Ambigu/perlu keputusan domain: 4.
- Tidak ketemu aman: 93.
- Marker `<!-- kejaksaan-source-row:N -->`: 121, tepat sekali per baris sumber.

Perbandingan dengan price book Semarang:

- Overlap kode sama: 24.
- Selisih harga >15%: 0.
- Tidak ada averaging dan tidak ada penerapan harga KEJAKSAAN otomatis.

## Verifikasi

- `cd services/core-engine && python -m pytest -q`
  - 264 passed, 1 warning.
- `cd apps/web && pnpm vitest run`
  - 46 passed.
- `cd apps/web && pnpm tsc --noEmit`
  - exit 0.
- `cd services/document-intelligence && python -m pytest -q`
  - 126 passed, 5 skipped, 2 warnings.

## Catatan Review Owner

- Empat item ambigu Fase P tetap belum diterapkan: Wiremesh, Kran air, dan dua varian Keramik.
- Semua baris KEJAKSAAN yang tidak matched aman sudah punya kandidat dekat dan alasan penolakan di laporan, agar owner bisa meninjau tanpa mencari manual ke katalog.
- Baris KEJAKSAAN masih berupa usulan audit. Penerapan harga tambahan ke Semarang harus menunggu keputusan owner pada fase berikutnya.
