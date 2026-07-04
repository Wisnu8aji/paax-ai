# REPORT FASE O/P - AHSP UNIT GAP + HARGA SEMARANG BATCH 2

Tanggal prompt: 2026-07-10
Branch kerja: `feat/ahsp-unit-gap-semarang-price-batch2`
Base kerja: `origin/fix/v03-relative-position-check`
PR: TBD

## 1. Ringkasan

Prompt ini menjalankan dua pekerjaan data baru:

- Fase O: membuat laporan usulan satuan untuk 188 item AHSP CK 2026 yang unit-nya kosong.
- Fase P: membuat laporan lanjutan mapping harga Semarang untuk 68 baris yang belum cocok dari audit lama.

Tidak ada nilai final yang ditulis langsung ke file produksi:

- `data/ahsp/cipta-karya-2026.json` tidak diubah.
- `data/harga-satuan/semarang.json` tidak diubah.
- `G:\paax-data\harga-satuan\semarang.json` tidak diubah.

Semua hasil berhenti sebagai laporan usulan untuk review Claude/owner.

## 2. Base dan status PR

`origin/main` belum memuat PR #29, #30, #31, dan #32. Karena prompt ini bergantung
pada Fase N dan M-2, branch dibuat dari `origin/fix/v03-relative-position-check`
(PR #32), bukan langsung dari `main`.

PR open saat mulai:

- #29 `feat/gambar-generate-rab-wiring` -> `main`
- #30 `feat/rab-nav-validator-audit-ahsp-suggest` -> `feat/gambar-generate-rab-wiring`
- #31 `feat/v03-fix-ahsp-catalog-import` -> `main`
- #32 `fix/v03-relative-position-check` -> `main`

## 3. Fase O - AHSP unit gap 188 item

Output lengkap:

- `report/AHSP_UNIT_GAP_RESOLUTION_2026-07-10.md`
- Generator audit: `scripts/ahsp/resolve_unit_gap.py`

Metode:

- Membaca 188 kode `unit kosong` dari `report/AHSP_IMPORT_BATCH_FINDINGS_2026-07-08.md`.
- Memastikan 188 kode tersebut memang masih `unit=""` di `data/ahsp/cipta-karya-2026.json`.
- Mengekstrak teks 16 PDF resmi di `G:\AHSP\Lampiran-VI-SE-DJBK-No-47-Tahun-2026-AHSP-Bidang-Cipta-Karya-{1..16}.pdf`.
- Mencari kode dengan regex exact-code agar kode seperti `10.3.1` tidak keliru cocok dengan `3.10.3.1`.
- Mengambil satuan dari pola indeks resmi: `Kode Uraian Pekerjaan Satuan Tipe AHSP Status`.

Hasil:

- Ditemukan pasti di PDF resmi: **188**
- Diinfer dari pola nama: **0**
- Tidak terselesaikan: **0**

Contoh bukti:

- `1.1.4.1` -> `Ha`, dari PDF lampiran 1 halaman 46.
- `9.1.1.1` -> `m`, dari PDF lampiran 2 halaman 46.
- `10.3.1` -> `set`, dari PDF lampiran 2 halaman 57.
- `1.1.3.10` -> `tunggul`, dari PDF lampiran 1 halaman 46.

## 4. Duplikasi resource AHSP

Prompt menyatakan 9 temuan duplikasi resource dalam satu item bukan bug. Saya
menambahkan test eksplisit untuk membuktikan engine memang menjumlahkan setiap
baris komponen apa adanya.

Test:

- `test_compute_hsp_menghitung_resource_duplikat_sebagai_baris_terpisah`

Anchor:

- Item nyata: `1.1.1.1`
- Resource `L.02` muncul dua kali dengan koefisien `0.2`.
- Dengan harga `L.02 = 1000` dan resource lain `0`, engine menghasilkan:
  - dua subtotal `L.02`: `200.0` dan `200.0`
  - `upah = 400.0`
  - `overhead_profit_value = 40.0`
  - `hsp = 440.0`

Kesimpulan: duplikasi resource diverifikasi sebagai perilaku yang dihitung benar,
bukan bug data yang perlu dihapus.

## 5. Fase P - Harga Semarang batch 2

Output lengkap:

- `report/HARGA_SEMARANG_BATCH2_FINDINGS_2026-07-10.md`
- Generator audit: `scripts/harga/semarang_batch2_report.py`

Acuan harga existing:

- `G:\paax-data\harga-satuan\semarang.json`

Konfirmasi sumber:

- `G:\paax-data\_audit\harga_semarang.json` mencatat 96 baris sumber, 26 matched, 68 unmatched, 2 ambiguous.
- `G:\paax-data\harga-satuan\semarang.json` berisi 23 resource unik hasil matched lama.
- `G:\paax-data\_audit\harga_semarang_review.csv` berisi 70 baris review: 68 unmatched + 2 ambiguous lama (`Paku`, `Paku sekrup`).

Metode:

- Reuse normalisasi dari `scripts/harga/extract_harga.py`.
- Second-pass konservatif hanya untuk exact alias yang sangat ketat:
  - `besi` -> `baja`
  - `seal tape` -> `sealtape`
- Kandidat dengan mutu beton, watt lampu, ukuran/varian keramik/granit/hollow,
  atau kandidat ganda tetap ditahan.

Hasil 68 baris batch2:

- Matched diusulkan: **2**
- Ambigu / perlu keputusan domain: **4**
- Tidak ketemu aman: **62**

Matched diusulkan:

- `Besi profil` -> `M.GEN.0085` / `Baja Profil`, harga Excel `12000`.
- `Seal tape` -> `M.GEN.0456` / `Sealtape`, harga Excel `10000`.

Ambigu:

- `Wiremesh` -> kandidat `Wiremesh M12` dan `Wiremesh M6`.
- `Kran air` -> kandidat diameter `1/2 inch` dan `3/4 inch`.
- `Keramik 30 x 60 cm` -> kandidat polished dan unpolished.
- `Keramik 30 x 30 cm` -> beberapa varian katalog.

## 6. Test baru

File baru:

- `services/core-engine/tests/test_ahsp_gap_reports_2026.py`
- `services/core-engine/tests/test_harga_semarang_batch2.py`

Cakupan test:

- Laporan unit gap memuat 188 kode dari findings Fase N persis sekali.
- Laporan harga Semarang batch2 memuat 68 baris sumber persis sekali.
- `compute_hsp` menghitung resource duplikat sebagai baris terpisah.
- Matcher batch2 punya 4 unit test: 2 match pasti, 1 ambigu, 1 tidak ketemu.

## 7. Verifikasi

Core Engine:

```text
258 passed, 1 warning
```

Web Vitest:

```text
13 test files passed
46 tests passed
```

Web TypeScript:

```text
pnpm tsc --noEmit
exit 0
```

Document Intelligence:

```text
126 passed, 5 skipped, 2 warnings
```

## 8. File produksi yang tidak disentuh

Tidak ada perubahan pada:

- `data/ahsp/cipta-karya-2026.json`
- `data/harga-satuan/semarang.json`
- `G:\paax-data\harga-satuan\semarang.json`

Perubahan hanya berupa scripts audit, test, prompt, report, dan status docs.
