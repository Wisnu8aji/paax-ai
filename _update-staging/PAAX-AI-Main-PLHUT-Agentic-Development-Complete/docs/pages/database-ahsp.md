# Halaman Database AHSP & Harga

Route: `/database-ahsp`. Status: **[ada/sebagian]** browser AHSP & harga.

> Baca [README.md](README.md) §1 (Aturan Emas) dulu.

## Tujuan
Telusuri katalog AHSP (koefisien) & harga satuan regional; jadi sumber pilih
kode AHSP untuk RAB (jalur manual & jembatan Smart RAB).

## Data yang ditampilkan
Daftar item AHSP (kode, nama, satuan, bidang), komponen + koefisien, harga
satuan per wilayah. Dari engine: `GET /ahsp`, `GET /ahsp/{code}`, `GET /regions`.

## Sumber angka (ENGINE-ONLY)
HSP contoh dari `/rab/hsp`. AHSP = sumber **koefisien**, BUKAN template output.
RAB dibangun dari `koef × harga`, bukan menyalin contoh. Harga real ada di luar
repo (`G:\paax-data`, moat) via `PAAX_DATA_DIR`.

## Peran AI di halaman ini
- **EXPLAIN** — bantu cari/jelaskan item AHSP yang relevan untuk suatu
  pekerjaan; **READ** untuk mendukung pemetaan Smart RAB.
- **NEVER** — AI tidak mengubah koefisien/harga; itu data, bukan keluaran AI.

## Akses Engineering Chat
`get_hsp(ahsp_code, region)` & pencarian AHSP mendukung jawaban chat.

## Fallback manual
Browser + pilih kode AHSP berjalan penuh tanpa AI.

## Status
Browser: ada/sebagian. Pencocokan harga by-nama (Fase A/A-2): berjalan.
