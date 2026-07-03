# Fixture uji golden — PLHUT (Surakarta 2024)

> ⚠️ **INI FIXTURE UJI (kunci jawaban), BUKAN data/template sistem.**
> Lihat prinsip §0.1 di `docs/plans/PAAX_ROADMAP_GAMBAR_KE_RAB_2026-07-03.md`:
> PLHUT hanya kasus uji untuk MEMVALIDASI mesin umum; dilarang menaruh data ini
> di `data/ahsp/` atau `data/harga-satuan/` sebagai grounding default, dan
> dilarang ada logika yang mengenali "ini PLHUT" di luar folder `tests/`.

## `ahs_golden.json`

Sumber: `rab gedung plhut surakarta ALFA.xlsx` (RAB manual asli proyek Gedung
PLHUT Surakarta, TA 2024), sheet **AHS** (Analisa Harga Satuan). 32 analisa harga
satuan pekerjaan, lengkap dengan koefisien + harga resource + tarif Overhead &
Profit per analisa, dan **`expected_hsp`** = nilai HSP final (baris F) yang
dihitung estimator profesional di file itu = **kunci jawaban**.

Dipakai golden anchor (brain TXT03 §6 T-04): **engine UMUM `compute_hsp()` wajib
mereproduksi `expected_hsp` tiap analisa** via rumus kanonik
`HSP = (bahan + upah + alat) × (1 + overhead_profit)` (CLAUDE.md §5).
Terverifikasi **32/32** saat fixture dibuat (2026-07-03).

### Catatan penting — kode resource ALFA TIDAK andal
Kode resource di `ALFA.xlsx` **dipakai ulang untuk material berbeda** antar
analisa (contoh nyata: `M.504` = "Rangka baja ringan" Rp 65.000 di satu analisa,
tapi "Portland cement" Rp 1.300 di analisa lain). Karena itu identitas resource
yang sah = **nama + harga**, bukan kode. Fixture ini memakai **kunci resource
lokal per-analisa** (`PLHUT-AHS-NN#RMM`) supaya tiap analisa self-contained dan
reproduksi HSP tepat tanpa collision. Kode asli ALFA disimpan di `alfa_code`
hanya sebagai jejak (jangan dipakai sebagai identitas).

Ini juga alasan kenapa fixture TIDAK boleh jadi price book sistem: penomoran
resource-nya khas file itu, bukan katalog resmi.

### Regenerasi
`_generate_ahs_golden.py <path-ke-ALFA.xlsx>` (butuh file sumber; TIDAK disertakan
di repo). Skrip men-scan sheet AHS, memisah blok per "Jenis Pekerjaan", membaca
koefisien/harga/OP, lalu memverifikasi 32/32 sebelum menulis. Skrip disimpan
untuk auditabilitas provenans (brain INV-TKG-03 no-silent-fix): siapa pun bisa
memastikan fixture = ekstraksi setia dari sumber, bukan angka karangan.

## Lingkup yang BELUM ada di sini (langkah 0a berikutnya)
- Sheet **DKH** (224 item + volume) sebagai kunci jawaban **RAB total** (≈ Rp 1,86 M).
- Sheet **HARGA BAHAN** (112 harga) → price book **Surakarta** regional (setelah
  kode direkonsiliasi ke resmi — ini bagian GERBANG-0b, grounding umum).
