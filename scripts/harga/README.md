# Harga Extractor - Daftar Harga Bahan dan Upah

Mengekstrak file `Daftar harga bahan dan upah.xlsx` menjadi price book regional
yang bisa dibaca PAAX core engine.

## Tata kelola data

Ikuti pola `scripts/ahsp`: kode extractor masuk repo, hasil data tetap di luar
repo.

- Script, test, dan README ini: di-commit ke repo.
- File sumber: `G:\AHSP\Daftar harga bahan dan upah.xlsx`, read-only.
- Output price book dan audit: `G:\paax-data`, tidak di-commit.
- Engine membaca data nyata lewat env `PAAX_DATA_DIR=G:\paax-data`.

## Pakai

```bash
python scripts/harga/extract_harga.py ^
  --src "G:\AHSP\Daftar harga bahan dan upah.xlsx" ^
  --catalog "G:\paax-data\harga-satuan\_resources_catalog.json" ^
  --ahsp "G:\paax-data\ahsp\cipta-karya-2026.json" ^
  --overrides "G:\paax-ai-main\data\harga-satuan\semarang_overrides.json" ^
  --out "G:\paax-data" ^
  --region "Semarang" ^
  --region-code "semarang" ^
  --effective-date "2026-06-28"
```

## Output

| File | Isi |
|---|---|
| `harga-satuan/semarang.json` | Price book regional dengan resource yang berhasil dicocokkan ke kode katalog. |
| `_audit/harga_semarang.json` | Statistik match, daftar matched, unmatched, dan ambiguous untuk review manual. |
| `_audit/harga_semarang_review.csv` | Worksheet Excel untuk sisa item yang perlu keputusan manusia. |

## Override Manual

Override manual dibaca dari `data/harga-satuan/semarang_overrides.json`.
Formatnya:

```json
{
  "region_code": "semarang",
  "overrides": [
    {
      "source_name": "Kloset jongkok porselen",
      "code": "M.GEN.0450",
      "catalog_name": "Kloset Jongkok"
    }
  ]
}
```

`source_name` harus sama persis dengan nama di XLSX sumber. `code` harus ada di
katalog resource. Override adalah keputusan manusia yang mengalahkan auto-match;
extractor tetap memakai harga persis dari XLSX sumber.

## Worksheet Review

Untuk item yang belum tersambung, extractor menulis CSV review dengan kandidat
top-5 dan kolom `chosen_code` kosong. Owner/Claude bisa memakai file itu sebagai
daftar keputusan manual berikutnya. Item seperti mutu beton, watt lampu, ukuran
keramik/plywood berbeda, atau substitusi satuan harus diputuskan di worksheet,
bukan ditebak oleh auto-match.

## Kebijakan matching

Extractor hanya memakai angka harga yang ada di file sumber. Nama dicocokkan ke
katalog dengan urutan: override manual tervalidasi, kategori dan satuan cocok
untuk auto-match, nama dinormalisasi untuk exact/alias, angka atau dimensi tidak
boleh konflik, lalu subset token hanya diterima untuk token tambahan yang aman
seperti `quarry`, `lokasi`, `pekerjaan`, `polos`, `ulir`, `pelitur`, atau
`kerikil`. Jika beberapa kandidat sama-sama cocok, extractor memakai kode yang
terbukti dipakai item AHSP; jika tetap seri, baris masuk review manual.

Jika beberapa kode katalog sama-sama masuk akal atau nama terlalu umum, baris
ditulis ke `ambiguous` atau `unmatched`. Harga tidak ditebak dan resource tidak
dimasukkan ke price book sampai ada review manual.

## Test

Test extractor memakai fixture inline, bukan `G:\AHSP` atau `G:\paax-data`.

```bash
cd services/core-engine
python -m pytest tests/test_harga_extract.py -q
```
