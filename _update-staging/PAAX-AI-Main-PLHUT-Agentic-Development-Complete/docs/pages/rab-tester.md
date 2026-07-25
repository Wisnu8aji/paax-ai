# Halaman RAB Tester (Dev)

Route: `/rab-tester`. Status: **[ada]** — halaman uji internal, BUKAN untuk
end-user.

> Baca [README.md](README.md) §1 (Aturan Emas) dulu.

## Tujuan
Menguji engine secara langsung (HSP/RAB/Kurva S/skenario) tanpa alur produk —
alat verifikasi developer & demo.

## Data yang ditampilkan
Form input mentah → hasil mentah endpoint engine.

## Sumber angka (ENGINE-ONLY)
Langsung memanggil endpoint engine (`/rab/hsp`, `/rab/calculate`, `/rab/build`,
`/schedule/s-curve`, `/scenario/simulate`, `/geometry/volume`). Tidak ada
logika hitung di halaman.

## Peran AI di halaman ini
Tidak ada. Murni alat uji deterministik (justru berguna untuk memverifikasi
Aturan Emas: angka selalu cocok dengan output engine).

## Akses Engineering Chat
Tidak relevan (halaman dev).

## Fallback manual
N/A (memang manual/dev).

## Status
Ada. Pertahankan sebagai harness verifikasi; jangan ekspos sebagai fitur user.
