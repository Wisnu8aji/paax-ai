# Halaman Daftar Proyek

Route: `/proyek`. Status: **[ada/sebagian]** daftar + CRUD proyek.

> Baca [README.md](README.md) §1 (Aturan Emas) dulu.

## Tujuan
Daftar semua proyek user; buat/buka/hapus proyek; cari & filter.

## Data yang ditampilkan
Nama proyek, lokasi, tahun, total RAB ringkas, status. Tampilan dari DB/engine.

## Sumber angka (ENGINE-ONLY)
Total RAB ringkas dari `/rab/build` (cache); frontend tidak menghitung.

## Peran AI di halaman ini
- **READ** — daftar proyek jadi konteks Engineering Chat lintas-proyek.
- Tidak ada PROPOSE angka di sini.

## Akses Engineering Chat
`list_projects()` membaca daftar ini (hanya milik user, sesuai RBAC).

## Fallback manual
CRUD & daftar berjalan penuh tanpa AI.

## Status
Daftar + CRUD: ada/sebagian sesuai progres DB.
