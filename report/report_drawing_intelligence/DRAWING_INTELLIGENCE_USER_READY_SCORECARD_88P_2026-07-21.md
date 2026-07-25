# PAAX Drawing Intelligence — User-Ready Scorecard 88 Halaman

**Tanggal:** 21 Juli 2026  
**Dokumen uji:** Gambar Kerja PLHUT Surakarta, 88 halaman  
**Mode pengujian:** offline/deterministik, tanpa live AI API

## Ringkasan penerimaan

| Indikator | Hasil |
|---|---:|
| Halaman dianalisis | 88/88 |
| Package benchmark | 19/19 PASS |
| Human benchmark | 10/10 PASS |
| User-ready gate | 18/18 PASS |
| Item siap tampil | 64 |
| Item perlu klarifikasi | 5 |
| Noise audit disembunyikan | 4 |
| Review task teknis | 76 |
| Review batch untuk user | 6 |
| Item diterima otomatis | 0 |

## Item berdasarkan disiplin

| Disiplin | Item |
|---|---:|
| Struktur | 34 |
| Arsitektur | 24 |
| Elektrikal | 6 |

## Item berdasarkan lokasi/level

| Lokasi | Item |
|---|---:|
| Atap | 9 |
| Belum diketahui | 1 |
| Fondasi/Substruktur | 6 |
| Lantai 1 | 25 |
| Lantai 2 | 23 |

## Item berdasarkan klasifikasi

| Klasifikasi | Item |
|---|---:|
| Balok | 16 |
| Pintu | 11 |
| Jendela | 10 |
| Kolom | 9 |
| Armatur Lampu | 4 |
| Pelat | 4 |
| Fondasi | 3 |
| Perlengkapan Elektrikal | 2 |
| Profil Baja | 2 |
| Tipe Plafon | 2 |
| Kombinasi Pintu-Jendela | 1 |

## Contoh hasil siap dibaca user

### Kolom K2 — Lantai 2

```text
Jenis          : Kolom struktur
Lokasi         : Lantai 2
Ukuran tertulis: 250 × 600 mm
Temuan         : 3 label/simbol teramati
Status jumlah  : Belum menjadi jumlah fisik terverifikasi
Sumber         : Denah Kolom Lantai 2 + Tabel Kolom
Tindakan       : Periksa overlay dan verifikasi objek fisik
```

## Item yang perlu klarifikasi

| Item | Lokasi | Temuan | Masalah yang perlu diselesaikan |
|---|---|---:|---|
| Pintu P3 | Lantai 1 | 2 label/simbol teramati | Ukuran elemen belum ditemukan atau belum dapat dipastikan.; Jumlah fisik belum diverifikasi.; Perlu pemeriksaan manusia untuk memastikan jumlah objek sebenarnya. |
| Pintu P3 | Lantai 2 | 2 label/simbol teramati | Ukuran elemen belum ditemukan atau belum dapat dipastikan.; Jumlah fisik belum diverifikasi.; Perlu pemeriksaan manusia untuk memastikan jumlah objek sebenarnya. |
| Belum terklasifikasi W-01 | Lantai 1 | 1 label/simbol teramati |  |
| Belum terklasifikasi P6 | Lantai 2 | 1 label/simbol teramati |  |
| Belum terklasifikasi P-01 | Lantai 1 | 1 label/simbol teramati |  |

## Kandidat yang disembunyikan dari user tetapi tetap diaudit

| Kode | Alasan suppression |
|---|---|
| LT1 | sheet_level_marker_not_an_element |
| D-01 | detail_callout_marker |
| E27 | product_specification_not_a_countable_item |
| K-01 | cross_discipline_background_label, unresolved_background_on_plumbing_sheet |

## Kebijakan keselamatan data

- Angka pada gambar ditampilkan sebagai **label/simbol teramati**, bukan jumlah fisik final.
- Accept classification tidak otomatis menerima jumlah fisik.
- Ukuran hanya tampil jika dapat ditautkan ke definisi elemen yang relevan.
- Noise tidak dihapus dari evidence; noise hanya dipindahkan dari daftar utama ke audit layer.
- DEM, primitive, cross-reference, dan provenance tetap tersedia untuk audit teknis.
- Drawing Intelligence tidak menghitung RAB, harga, schedule, atau kuantitas final pada gelombang ini.

## Status

**Lulus untuk pilot review PLHUT pada frontend PAAX.** Belum universal production-ready sampai ground truth object-level dan proyek kedua membuktikan generalisasi.
