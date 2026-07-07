# Halaman RAB Tester (Dev)

> ⚠️ **USANG — DITEMUKAN 2026-07-05.** Route `/rab-tester` **sudah dihapus**
> dari `apps/web` (dicek langsung: tidak ada folder route ini lagi di
> `apps/web/src/app`). Halaman uji manual/harness ini sudah tidak ada;
> fungsi verifikasi engine sekarang cukup lewat `pytest` di
> `services/core-engine` + halaman produk nyata (`/proyek/[id]/rab`).
> Dibiarkan sbg arsip histori, hapus baris `rab-tester.md` dari indeks
> `docs/pages/README.md` §2 kapan-kapan saat dirapikan (belum dihapus sesi
> ini krn instruksi audit: jangan hapus konten, hanya tandai).

Route: `/rab-tester`. Status: **[dihapus]** — halaman uji internal, BUKAN untuk
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
