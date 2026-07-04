# Harga Semarang Batch 2 Findings - 2026-07-10

Laporan ini adalah USULAN lanjutan untuk 68 baris harga Semarang yang belum cocok pada audit Fase A-2.
Tidak ada harga yang diterapkan ke `data/harga-satuan/semarang.json` atau `G:\paax-data\harga-satuan\semarang.json` dalam fase ini.

Acuan harga existing: `G:\paax-data\harga-satuan\semarang.json`
Audit manifest: `G:\paax-data\_audit\harga_semarang.json`
Review CSV: `G:\paax-data\_audit\harga_semarang_review.csv`
Master resource: `G:\paax-data\harga-satuan\_resources_catalog.json`

## Ringkasan

- Baris sumber batch2 dari manifest unmatched: **68**
- Matched diusulkan: **2**
- Ambigu: **4**
- Tidak ketemu aman: **62**
- Metode: reuse normalisasi `scripts/harga/extract_harga.py`, lalu second-pass konservatif untuk exact alias `besi->baja` dan `seal tape->sealtape`.
- Prinsip tahan: mutu beton, watt lampu, ukuran/varian keramik/granit/hollow, dan kandidat ganda tidak dipilih sepihak.

## Matched Diusulkan

| Row | Source name | Unit | Harga Excel | Kode katalog | Catalog name | Skor | Alasan |
|---:|---|---|---:|---|---|---:|---|
<!-- semarang-batch2-source-row:42 -->
| 42 | Besi profil | `kg` | 12000 | `M.GEN.0085` | Baja Profil | 1.00 | nama/kategori/unit cocok setelah normalisasi ketat |
<!-- semarang-batch2-source-row:74 -->
| 74 | Seal tape | `buah` | 10000 | `M.GEN.0456` | Sealtape | 1.00 | nama/kategori/unit cocok setelah normalisasi ketat |

## Ambigu / Perlu Keputusan Domain

| Row | Source name | Unit | Harga Excel | Kandidat | Alasan |
|---:|---|---|---:|---|---|
<!-- semarang-batch2-source-row:28 -->
| 28 | Wiremesh | `kg` | 12800 | M.GEN.0140 - Wiremesh M12 (kg); M.GEN.0142 - Wiremesh M6 (kg) | lebih dari satu kandidat parsial; butuh keputusan domain |
<!-- semarang-batch2-source-row:73 -->
| 73 | Kran air | `buah` | 60000 | M.GEN.0471 - Kran Air diameter 1/2 inch (buah); M.GEN.0472 - Kran Air diameter 3/4 inch (buah) | lebih dari satu kandidat parsial; butuh keputusan domain |
<!-- semarang-batch2-source-row:99 -->
| 99 | Keramik 30 x 60 cm | `buah` | 11000 | M.GEN.0633 - Keramik Lantai uk. 30 x 60 cm, Unpolished (buah); M.GEN.0645 - Keramik Lantai uk. 30 x 60 cm, Polished (buah) | lebih dari satu kandidat parsial; butuh keputusan domain |
<!-- semarang-batch2-source-row:100 -->
| 100 | Keramik 30 x 30 cm | `buah` | 8500 | M.GEN.0626 - Keramik Lantai Artistik uk. 30 x 30 cm (buah); M.GEN.0632 - Keramik Lantai uk. 30 x 30 cm, Unpolished (buah); M.GEN.0635 - Keramik Lantai Variasi uk. 30 x 30 cm, Unpolished (buah); M.GEN.0644 - Keramik Lantai uk. 30 x 30 cm,... | lebih dari satu kandidat parsial; butuh keputusan domain |

## Tidak Ketemu Aman

| Row | Source name | Unit | Harga Excel | Alasan |
|---:|---|---|---:|---|
<!-- semarang-batch2-source-row:14 -->
| 14 | Operator alat berat | `OH` | 150000 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:15 -->
| 15 | Pembantu operator alat berat | `OH` | 102000 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:16 -->
| 16 | Sopir | `OH` | 150000 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:17 -->
| 17 | Kenek | `OH` | 102000 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:23 -->
| 23 | Operator pompa | `OH` | 107000 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:29 -->
| 29 | Papan begisting | `m3` | 1400000 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:31 -->
| 31 | Adukan beton K-350 ready mix | `m3` | 920000 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:34 -->
| 34 | Kayu bekisting | `m3` | 1750000 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:37 -->
| 37 | Kayu kelapa | `m3` | 1000000 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:38 -->
| 38 | Plywood 9 mm (120x240) | `lembar` | 70000 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:39 -->
| 39 | Got Normal U-20 | `buah` | 45000 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:43 -->
| 43 | Cat dasar (cat besi) | `kg` | 40000 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:44 -->
| 44 | Cat antara (cat besi) | `kg` | 45000 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:45 -->
| 45 | Cat penutup (cat besi) | `kg` | 60000 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:47 -->
| 47 | Beton Mutu fc = 14,5 Mpa (K175) | `m3` | 720000 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:49 -->
| 49 | Produksi LPA (lapis pondasi agregat kelas A) | `m3` | 240000 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:50 -->
| 50 | Joint sealent | `kg` | 55000 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:51 -->
| 51 | Cerucuk Kayu/ Dolken Ø 10-12 cm panjang 4m | `batang` | 12500 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:53 -->
| 53 | Pasir muntilan (quarry - lokasi pekerjaan) | `m3` | 288500 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:57 -->
| 57 | Tanah padas | `m3` | 95000 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:58 -->
| 58 | Granite 60 x60 polished dengan garis stepnosing tangga | `m2` | 190000 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:59 -->
| 59 | Granite 60 x60 unpolished | `m2` | 160000 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:61 -->
| 61 | Granite 100 x100 polished | `buah` | 265000 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:62 -->
| 62 | Perekat khusus penutup lantai | `kg` | 3500 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:63 -->
| 63 | Pengisi khusus rongga nat | `kg` | 15000 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:64 -->
| 64 | Flexible waterproofing | `kg` | 55000 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:65 -->
| 65 | Baja tulangan polos U-24 | `kg` | 10100 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:66 -->
| 66 | Bambu cerucuk Ø 10-12 cm panjang 6m | `batang` | 20000 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:67 -->
| 67 | Pipa PVC tipe D Ø 2" panjang 4 m | `batang` | 65000 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:68 -->
| 68 | Plint 10 x 60 | `buah` | 22000 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:69 -->
| 69 | Buis beton Ø 80 cm | `buah` | 355000 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:70 -->
| 70 | Septic tank pabrikasi 800 liter | `buah` | 12500000 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:72 -->
| 72 | Pipa PVC tipe AW Ø 3/4" panjang 4 m | `batang` | 45000 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:75 -->
| 75 | Floor drain stainles steel | `buah` | 75500 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:76 -->
| 76 | Lampu LED 12 watt | `buah` | 55000 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:77 -->
| 77 | Armature Lampu | `buah` | 70000 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:78 -->
| 78 | Lampu LED 18 watt | `buah` | 75000 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:79 -->
| 79 | Saklar Clipsal single | `buah` | 30000 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:80 -->
| 80 | Saklar Clipsal double | `buah` | 40000 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:81 -->
| 81 | Stop kontak Clipsal | `buah` | 30000 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:82 -->
| 82 | Kabel NYM 2 x 2,5 mm2 | `m2` | 12000 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:83 -->
| 83 | Pralon 5/8" warna putih | `buah` | 10000 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:84 -->
| 84 | Plafond PVC Motif | `m2` | 60000 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:86 -->
| 86 | Hollow galvanis 40x40x0,4 mm | `m` | 7000 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:88 -->
| 88 | Kayu Meranti (balok) | `m3` | 3650000 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:89 -->
| 89 | Kayu bengkirai (balok kaso 5x7) | `m3` | 7000000 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:90 -->
| 90 | Kayu bengkirai (balok reng 2x3) | `m3` | 7000000 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:92 -->
| 92 | Beton Ready mix K-250 | `m3` | 850000 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:94 -->
| 94 | Roster/terawang | `buah` | 7500 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:95 -->
| 95 | Cat dasar (cat tembok exterior) | `kg` | 55000 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:96 -->
| 96 | Cat penutup (cat tembok exterior) | `kg` | 70000 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:97 -->
| 97 | Cat kedap air ( water base) | `kg` | 4500 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:101 -->
| 101 | paving block abu, K300 t=6 cm | `m2` | 85000 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:102 -->
| 102 | Hollow 50x50x1 mm | `kg` | 13500 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:103 -->
| 103 | Hollow 40x40x1 mm | `kg` | 13500 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:104 -->
| 104 | Plat Baja tebal 1mm | `kg` | 14500 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:105 -->
| 105 | Hollow 75x50x1 mm | `kg` | 13500 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:106 -->
| 106 | Cat dasar (cat tembok interior) | `kg` | 40000 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:107 -->
| 107 | Cat penutup (cat tembok interior) | `kg` | 44000 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:108 -->
| 108 | step nosing | `buah` | 16000 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:109 -->
| 109 | Plint kaca ryband tebal 8 cm | `buah` | 10500 | tidak ada kandidat aman untuk batch2 |
<!-- semarang-batch2-source-row:110 -->
| 110 | List gypsum 10 x 10 cm | `buah` | 27000 | tidak ada kandidat aman untuk batch2 |

## Catatan

- Dua baris ambiguous lama (`Paku`, `Paku sekrup`) tetap berasal dari review Fase A-2 dan tidak dihitung sebagai 68 baris batch2.
- Semua angka harga di tabel adalah nilai dari Excel sumber; laporan ini hanya mengusulkan mapping kode katalog.
