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

## Kebijakan matching

Extractor hanya memakai angka harga yang ada di file sumber. Nama dicocokkan ke
katalog dengan urutan: kategori dan satuan harus cocok, nama dinormalisasi
untuk exact/alias, angka atau dimensi tidak boleh konflik, lalu subset token
hanya diterima untuk token tambahan yang aman seperti `quarry`, `lokasi`,
`pekerjaan`, `polos`, `ulir`, `pelitur`, atau `kerikil`.

Jika beberapa kode katalog sama-sama masuk akal atau nama terlalu umum, baris
ditulis ke `ambiguous` atau `unmatched`. Harga tidak ditebak dan resource tidak
dimasukkan ke price book sampai ada review manual.

## Test

Test extractor memakai fixture inline, bukan `G:\AHSP` atau `G:\paax-data`.

```bash
cd services/core-engine
python -m pytest tests/test_harga_extract.py -q
```
