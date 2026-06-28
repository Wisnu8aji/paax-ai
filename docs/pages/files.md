# Halaman Files

Route: `/files`. Status: **[sebagian]**.

> Baca [README.md](README.md) §1 (Aturan Emas) dulu.

## Tujuan
Penyimpanan & manajemen berkas user/proyek (gambar, PDF, RAB lama, dokumen).

## Data yang ditampilkan
Daftar file, metadata (nama, tipe, ukuran, proyek terkait, tanggal).

## Sumber angka (ENGINE-ONLY)
Tidak ada perhitungan RAB di sini. Bila file dipakai untuk ekstraksi (RAB lama
/ gambar), angka tetap lewat engine (lihat [rab.md](rab.md), [gambar-kerja.md](gambar-kerja.md)).

## Peran AI di halaman ini
- **READ** — file jadi sumber bahan untuk Smart Import / ekstraksi.
- **PROPOSE** — dari file terstruktur (Excel RAB lama) usul mapping kolom →
  engine. AI tidak mengarang angka; deteksi anomali harga = usulan, bukan vonis.

## Akses Engineering Chat
READ daftar file & metadata sebagai konteks (mis. "RAB lama proyek X ada di
file Y").

## Fallback manual
Upload/kelola file penuh tanpa AI.

## Status
Sebagian. Smart Import (Excel RAB → mapping kolom AI): v0.8.
