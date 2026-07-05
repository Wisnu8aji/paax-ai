# Harga KEJAKSAAN Semarang - 2026-07-11

Laporan ini membaca sheet `HARGA BAHAN` dari workbook KEJAKSAAN, mencocokkan setiap baris ke master resource, dan membandingkan overlap dengan price book Semarang yang sudah diterapkan pada fase Q.

Tidak ada harga KEJAKSAAN yang diterapkan ke `data/harga-satuan/semarang.json`.

## Sumber

- Workbook: `G:\AHSP\KEJAKSAAN.xlsx`
- Sheet: `HARGA BAHAN`
- Kolom dibaca: B = nama, E = satuan, F = harga/formula
- Master resource: `G:\paax-data\harga-satuan\_resources_catalog.json`
- Price book pembanding: `G:\paax-ai-main\data\harga-satuan\semarang.json`

## Ringkasan

- Baris sumber terbaca: **121**
- Matched aman: **24**
- Ambigu/perlu keputusan domain: **4**
- Tidak ketemu aman: **93**
- Overlap dengan price book Semarang: **24**
- Overlap beda harga >15%: **0**

## Matched Aman

| Row | Source name | Kategori | Unit | Harga KEJAKSAAN | Kode katalog | Catalog name | Alasan |
|---:|---|---|---|---:|---|---|---|
<!-- kejaksaan-source-row:12 -->
| 12 | Pekerja | `upah` | `OH` | 102000 | `L.01` | Pekerja | nama/kategori/unit cocok setelah normalisasi |
<!-- kejaksaan-source-row:13 -->
| 13 | Mandor | `upah` | `OH` | 112000 | `L.04` | Mandor | nama/kategori/unit cocok setelah normalisasi |
<!-- kejaksaan-source-row:18 -->
| 18 | Tukang Batu | `upah` | `OH` | 107000 | `L.02` | Tukang batu | nama/kategori/unit cocok setelah normalisasi |
<!-- kejaksaan-source-row:19 -->
| 19 | Kepala Tukang | `upah` | `OH` | 109000 | `L.03` | Kepala Tukang | nama/kategori/unit cocok setelah normalisasi |
<!-- kejaksaan-source-row:20 -->
| 20 | Tukang besi | `upah` | `OH` | 107000 | `L.02` | Tukang besi | nama/kategori/unit cocok setelah normalisasi |
<!-- kejaksaan-source-row:22 -->
| 22 | Tukang Kayu | `upah` | `OH` | 107000 | `L.02` | Tukang Kayu | nama/kategori/unit cocok setelah normalisasi |
<!-- kejaksaan-source-row:24 -->
| 24 | Tukang listrik | `upah` | `OH` | 107000 | `L.GEN.0014` | Tukang Listrik | nama/kategori/unit cocok setelah normalisasi |
<!-- kejaksaan-source-row:30 -->
| 30 | Ijuk | `bahan` | `kg` | 20000 | `M.GEN.0236` | Ijuk | nama/kategori/unit cocok setelah normalisasi |
<!-- kejaksaan-source-row:32 -->
| 32 | Baja tulangan polos / ulir | `bahan` | `kg` | 11500 | `M.GEN.0464` | Baja Tulangan | nama katalog adalah subset aman dari source |
<!-- kejaksaan-source-row:33 -->
| 33 | Kawat beton | `bahan` | `kg` | 16000 | `M.GEN.0146` | Kawat beton | nama/kategori/unit cocok setelah normalisasi |
<!-- kejaksaan-source-row:36 -->
| 36 | Minyak bekisting | `bahan` | `liter` | 12000 | `M.GEN.0087` | Minyak Bekisting | nama/kategori/unit cocok setelah normalisasi |
<!-- kejaksaan-source-row:40 -->
| 40 | Pasir urug (quarry - lokasi pekerjaan) | `bahan` | `m3` | 175900 | `M.GEN.0175` | Pasir urug | nama katalog adalah subset aman dari source |
<!-- kejaksaan-source-row:41 -->
| 41 | Bata merah 5 x 11 x 22 cm | `bahan` | `buah` | 500 | `M.GEN.0035` | Bata merah | nama/kategori/unit cocok setelah normalisasi |
<!-- kejaksaan-source-row:42 -->
| 42 | Besi profil | `bahan` | `kg` | 12000 | `M.GEN.0085` | Baja Profil | nama/kategori/unit cocok setelah normalisasi |
<!-- kejaksaan-source-row:46 -->
| 46 | Kuas 3" | `bahan` | `buah` | 8000 | `M.GEN.0553` | Kuas | nama/kategori/unit cocok setelah normalisasi |
<!-- kejaksaan-source-row:48 -->
| 48 | Ampelas | `bahan` | `lembar` | 3000 | `M.GEN.0547` | Ampelas | nama/kategori/unit cocok setelah normalisasi |
<!-- kejaksaan-source-row:54 -->
| 54 | Batu pecah 1/2 | `bahan` | `m3` | 250000 | `M.GEN.1555` | Batu pecah / kerikil | source adalah subset aman dari nama katalog |
<!-- kejaksaan-source-row:55 -->
| 55 | Air, | `bahan` | `liter` | 40 | `M.GEN.0007` | Air | nama/kategori/unit cocok setelah normalisasi |
<!-- kejaksaan-source-row:56 -->
| 56 | Batu belah (quarry - lokasi pekerjaan) | `bahan` | `m3` | 265000 | `M.GEN.0174` | Batu belah | nama katalog adalah subset aman dari source |
<!-- kejaksaan-source-row:74 -->
| 74 | Seal tape | `bahan` | `buah` | 10000 | `M.GEN.0456` | Sealtape | nama/kategori/unit cocok setelah normalisasi |
<!-- kejaksaan-source-row:87 -->
| 87 | Besi strip | `bahan` | `kg` | 11000 | `M.GEN.0032` | Besi Strip | nama/kategori/unit cocok setelah normalisasi |
<!-- kejaksaan-source-row:91 -->
| 91 | Genteng beton | `bahan` | `buah` | 12000 | `M.GEN.0245` | Genteng Beton | nama/kategori/unit cocok setelah normalisasi |
<!-- kejaksaan-source-row:93 -->
| 93 | Semen warna | `bahan` | `kg` | 9000 | `M.GEN.0252` | Semen Warna | nama/kategori/unit cocok setelah normalisasi |
<!-- kejaksaan-source-row:98 -->
| 98 | Batu tempel hitam | `bahan` | `m2` | 65000 | `M.GEN.0319` | Batu Tempel Hitam | nama/kategori/unit cocok setelah normalisasi |

## Ambigu / Perlu Keputusan Domain

| Row | Source name | Kategori | Unit | Harga KEJAKSAAN | Kandidat aman | Alasan |
|---:|---|---|---|---:|---|---|
<!-- kejaksaan-source-row:21 -->
| 21 | Tukang Cat | `upah` | `OH` | 107000 | L.02 - Tukang cat/pelitur*) (upah/OH); L.02 - Tukang Cat/Pelitur (upah/OH); L.02 - Tukang cat/ pelitur (upah/OH) | lebih dari satu kandidat aman dengan skor sama |
<!-- kejaksaan-source-row:35 -->
| 35 | Paku | `bahan` | `kg` | 15000 | M.GEN.0045 - Paku (bahan/kg); M.GEN.0102 - Paku 5 cm (bahan/kg); M.GEN.0129 - Paku 12 cm (bahan/kg); M.GEN.0137 - Paku 5 cm - 10 cm (bahan/kg); M.GEN.0144 - Paku 5 cm – 12 cm (bahan/kg); M.GEN.0154 - Paku 5 – 10 cm (bahan/kg); M.GEN.0155 - Paku 5 – 12 cm (b... | lebih dari satu kandidat aman dengan skor sama |
<!-- kejaksaan-source-row:52 -->
| 52 | Portland cement | `bahan` | `kg` | 1200 | M.GEN.0004 - Semen Portland (PC) (bahan/kg); M.GEN.0147 - Semen Portland (bahan/kg); M.GEN.0176 - Semen Portland (SP) (bahan/kg) | lebih dari satu kandidat aman dengan skor sama |
<!-- kejaksaan-source-row:85 -->
| 85 | Paku sekrup | `bahan` | `kg` | 16000 | M.GEN.0287 - Paku Sekrup ½”-1” (bahan/kg); M.GEN.0299 - Paku Sekrup 2" (bahan/kg); M.GEN.0327 - Paku Sekrup 10 cm (bahan/kg); M.GEN.0503 - Paku Sekrup (bahan/kg) | lebih dari satu kandidat aman dengan skor sama |

## Tidak Ketemu Aman

| Row | Source name | Kategori | Unit | Harga KEJAKSAAN | Kandidat dekat yang ditolak | Alasan utama |
|---:|---|---|---|---:|---|---|
<!-- kejaksaan-source-row:14 -->
| 14 | Operator alat berat | `upah` | `OH` | 150000 | L.14.b - Tenaga Terampil Operator*) (upah/OH): tidak cukup kuat untuk dipilih otomatis; L.14b - Tenaga Terampil Operator (upah/OH): tidak cukup kuat untuk dipilih otomatis; L.01 - Pekerja (upah/OH): nama terlalu jauh; L.01 - Tukang Ereksi (upah/OH): nama terlalu jauh; L.02 - Tukang Kayu (upah/OH): nama terlalu jauh | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:15 -->
| 15 | Pembantu operator alat berat | `upah` | `OH` | 102000 | L.06 - Pembantu Juru Ukur (upah/OH): tidak cukup kuat untuk dipilih otomatis; L.14.b - Tenaga Terampil Operator*) (upah/OH): tidak cukup kuat untuk dipilih otomatis; L.14b - Tenaga Terampil Operator (upah/OH): tidak cukup kuat untuk dipilih otomatis; L.01 - Pekerja (upah/OH): nama terlalu jauh; L.01 - Tukang Ereksi (upah/OH): nama terlalu jauh | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:16 -->
| 16 | Sopir | `upah` | `OH` | 150000 | L.01 - Pekerja (upah/OH): nama terlalu jauh; L.01 - Tukang Ereksi (upah/OH): nama terlalu jauh; L.02 - Tukang Kayu (upah/OH): nama terlalu jauh; L.02 - Tukang batu (upah/OH): nama terlalu jauh; L.02 - Tukang besi (upah/OH): nama terlalu jauh | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:17 -->
| 17 | Kenek | `upah` | `OH` | 102000 | L.01 - Pekerja (upah/OH): nama terlalu jauh; L.01 - Tukang Ereksi (upah/OH): nama terlalu jauh; L.02 - Tukang Kayu (upah/OH): nama terlalu jauh; L.02 - Tukang batu (upah/OH): nama terlalu jauh; L.02 - Tukang besi (upah/OH): nama terlalu jauh | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:23 -->
| 23 | Operator pompa | `upah` | `OH` | 107000 | L.14.b - Tenaga Terampil Operator*) (upah/OH): tidak cukup kuat untuk dipilih otomatis; L.14b - Tenaga Terampil Operator (upah/OH): tidak cukup kuat untuk dipilih otomatis; L.01 - Pekerja (upah/OH): nama terlalu jauh; L.01 - Tukang Ereksi (upah/OH): nama terlalu jauh; L.02 - Tukang Kayu (upah/OH): nama terlalu jauh | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:28 -->
| 28 | Wiremesh | `bahan` | `kg` | 12800 | M.GEN.0140 - Wiremesh M12 (bahan/kg): tidak cukup kuat untuk dipilih otomatis; M.GEN.0142 - Wiremesh M6 (bahan/kg): tidak cukup kuat untuk dipilih otomatis; M.GEN.0003 - Paku biasa 5 inch (bahan/kg): nama terlalu jauh; M.GEN.0004 - Semen Portland (PC) (bahan/kg): nama terlalu jauh; M.GEN.0005 - Pasir Beton (bahan/kg): nama terlalu jauh | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:29 -->
| 29 | Papan begisting | `bahan` | `m3` | 1400000 | M.GEN.0002 - Papan Kayu 2/20 (bahan/m3): tidak cukup kuat untuk dipilih otomatis; M.GEN.0060 - Kayu papan 3/20 cm (bahan/m3): tidak cukup kuat untuk dipilih otomatis; M.GEN.0225 - Papan cor (bahan/m3): tidak cukup kuat untuk dipilih otomatis; M.GEN.0101 - Papan 2 /20 Kayu Kelas 3 (bahan/m3): tidak cukup kuat untuk dipilih otomatis; M.GEN.1558 - Bekisting (bahan/m2): unit beda | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:31 -->
| 31 | Adukan beton K-350 ready mix | `bahan` | `m3` | 920000 | M.GEN.0162 - Beton Ready Mixed f'c 10 MPa (bahan/m3): angka tidak cocok; M.GEN.0163 - Beton Ready Mixed f'c 35 MPa (bahan/m3): angka tidak cocok; M.GEN.0164 - Beton Ready Mixed f'c 15 MPa (bahan/m3): angka tidak cocok; M.GEN.0165 - Beton Ready Mixed f'c 17 MPa (bahan/m3): angka tidak cocok; M.GEN.0166 - Beton Ready Mixed f'c 20 MPa (bahan/m3): angka tidak cocok | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:34 -->
| 34 | Kayu bekisting | `bahan` | `m3` | 1750000 | M.GEN.0030 - Kayu (bahan/m3): tidak cukup kuat untuk dipilih otomatis; M.GEN.0002 - Papan Kayu 2/20 (bahan/m3): tidak cukup kuat untuk dipilih otomatis; M.GEN.0060 - Kayu papan 3/20 cm (bahan/m3): tidak cukup kuat untuk dipilih otomatis; M.GEN.0217 - Kayu kaso 5/7 (bahan/m3): tidak cukup kuat untuk dipilih otomatis; M.GEN.0465 - Kayu Bekisting (bahan/m2): unit beda | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:37 -->
| 37 | Kayu kelapa | `bahan` | `m3` | 1000000 | M.GEN.0030 - Kayu (bahan/m3): tidak cukup kuat untuk dipilih otomatis; M.GEN.0002 - Papan Kayu 2/20 (bahan/m3): tidak cukup kuat untuk dipilih otomatis; M.GEN.0060 - Kayu papan 3/20 cm (bahan/m3): tidak cukup kuat untuk dipilih otomatis; M.GEN.0217 - Kayu kaso 5/7 (bahan/m3): tidak cukup kuat untuk dipilih otomatis; M.GEN.0220 - Kayu kaso 5/8 (bahan/m3): tidak cukup kuat untuk dipilih otomatis | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:38 -->
| 38 | Plywood 9 mm (120x240) | `bahan` | `lembar` | 70000 | M.GEN.0324 - Plywood 4 mm, 120 x 240 (bahan/lembar): angka tidak cocok; M.GEN.0040 - Plywood 4mm (bahan/lembar): angka tidak cocok; M.GEN.0156 - Plywood tebal 12 mm (bahan/lembar): angka tidak cocok; M.GEN.0294 - Plywood uk. 122 cm x 244 cm x 6 mm (bahan/lembar): angka tidak cocok; M.GEN.0349 - Plywood tebal 4 mm ukuran (90x220) cm (bahan/lembar): angka tidak cocok | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:39 -->
| 39 | Got Normal U-20 | `bahan` | `buah` | 45000 | M.GEN.0066 - Marmer graphir 10x10 cm (bahan/buah): angka tidak cocok, nama terlalu jauh; M.GEN.0067 - Marmer graphir 12x12 cm (bahan/buah): angka tidak cocok, nama terlalu jauh; M.GEN.0083 - Angkur M16 panjang 50 cm (bahan/buah): angka tidak cocok, nama terlalu jauh; M.GEN.0090 - Pembuatan 1 buah Cetakan Panel P1 RISHA (Asumsi 400 kali pakai) (bahan/buah): angka tidak cocok, nama terlalu jauh; M.GEN.0214 - U-bolt... | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:43 -->
| 43 | Cat dasar (cat besi) | `bahan` | `kg` | 40000 | M.GEN.0549 - Cat Dasar Baja Galvanis (bahan/kg): tidak cukup kuat untuk dipilih otomatis; M.GEN.0543 - Cat Dasar Tembok (bahan/kg): tidak cukup kuat untuk dipilih otomatis; M.GEN.0558 - Cat Baja Galvanis (bahan/kg): tidak cukup kuat untuk dipilih otomatis; M.GEN.0560 - Cat Dasar Plafond (bahan/kg): tidak cukup kuat untuk dipilih otomatis; M.GEN.0572 - Cat Dasar Kayu (bahan/kg): tidak cukup kuat untuk dipilih otomatis | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:44 -->
| 44 | Cat antara (cat besi) | `bahan` | `kg` | 45000 | M.GEN.0551 - Cat Antara Baja Galvanis (bahan/kg): tidak cukup kuat untuk dipilih otomatis; M.GEN.0558 - Cat Baja Galvanis (bahan/kg): tidak cukup kuat untuk dipilih otomatis; M.GEN.0549 - Cat Dasar Baja Galvanis (bahan/kg): tidak cukup kuat untuk dipilih otomatis; M.GEN.0552 - Cat Penutup Baja Galvanis (bahan/kg): tidak cukup kuat untuk dipilih otomatis; M.GEN.0012 - Baja L 40.40.4 (bahan/kg): tidak cukup kuat unt... | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:45 -->
| 45 | Cat penutup (cat besi) | `bahan` | `kg` | 60000 | M.GEN.0552 - Cat Penutup Baja Galvanis (bahan/kg): tidak cukup kuat untuk dipilih otomatis; M.GEN.0558 - Cat Baja Galvanis (bahan/kg): tidak cukup kuat untuk dipilih otomatis; M.GEN.0573 - Cat Penutup Kayu (bahan/kg): tidak cukup kuat untuk dipilih otomatis; M.GEN.0549 - Cat Dasar Baja Galvanis (bahan/kg): tidak cukup kuat untuk dipilih otomatis; M.GEN.0551 - Cat Antara Baja Galvanis (bahan/kg): tidak cukup kuat u... | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:47 -->
| 47 | Beton Mutu fc = 14,5 Mpa (K175) | `bahan` | `m3` | 720000 | M.GEN.0092 - 1 m3 beton mutu sedang f'c 25 MPa, Slump (100 ± 25) mm, agregat maks 19 mm secara semi mekanis (bahan/m3): angka tidak cocok; M.GEN.0162 - Beton Ready Mixed f'c 10 MPa (bahan/m3): angka tidak cocok; M.GEN.0163 - Beton Ready Mixed f'c 35 MPa (bahan/m3): angka tidak cocok; M.GEN.0164 - Beton Ready Mixed f'c 15 MPa (bahan/m3): angka tidak cocok; L.GEN.0010 - Beton fc' 15 MPa (upah/m3): kategori beda, ang... | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:49 -->
| 49 | Produksi LPA (lapis pondasi agregat kelas A) | `bahan` | `m3` | 240000 | M.GEN.0328 - Kayu Lapis uk. 120 x 240 cm (bahan/m3): tidak cukup kuat untuk dipilih otomatis; M.GEN.0062 - Kaso 5/7 cm kelas II (bahan/m3): nama terlalu jauh; M.GEN.0100 - Kaso 5 x 7 Kayu Kelas 3 (bahan/m3): nama terlalu jauh; M.GEN.0101 - Papan 2 /20 Kayu Kelas 3 (bahan/m3): nama terlalu jauh; L.GEN.0004 - Lapis Fondasi Aggregat Kelas C (CBR > 30%, ukuran butiran maksimum 2,5 cm) (upah/m3): kategori beda | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:50 -->
| 50 | Joint sealent | `bahan` | `kg` | 55000 | M.GEN.0003 - Paku biasa 5 inch (bahan/kg): nama terlalu jauh; M.GEN.0004 - Semen Portland (PC) (bahan/kg): nama terlalu jauh; M.GEN.0005 - Pasir Beton (bahan/kg): nama terlalu jauh; M.GEN.0006 - Kerikil (bahan/kg): nama terlalu jauh; M.GEN.0301 - Sealent (bahan/buah): unit beda | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:51 -->
| 51 | Cerucuk Kayu/ Dolken Ø 10-12 cm panjang 4m | `bahan` | `batang` | 12500 | M.GEN.0157 - Dolken kayu 8-10 cm panjang 4 m (bahan/batang): angka tidak cocok; M.GEN.0158 - Dolken kayu dia. 8- 10 cm panjang 4 m (bahan/batang): angka tidak cocok; M.GEN.0232 - Bambu Panjang 4,5 meter (bahan/batang): angka tidak cocok; M.GEN.0136 - Kayu Kelas II (bahan/batang): nama katalog terlalu umum; M.GEN.0116 - Baja Ringan C75, t=1 mm (Batang Utama) (bahan/batang): angka tidak cocok, nama terlalu jauh | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:53 -->
| 53 | Pasir muntilan (quarry - lokasi pekerjaan) | `bahan` | `m3` | 288500 | M.GEN.0701 - Pasir (bahan/m3): tidak cukup kuat untuk dipilih otomatis; M.GEN.0018 - Pasir Beton (bahan/m3): tidak cukup kuat untuk dipilih otomatis; M.GEN.0033 - Pasir pasang (bahan/m3): tidak cukup kuat untuk dipilih otomatis; M.GEN.0068 - Pasir uruk (bahan/m3): tidak cukup kuat untuk dipilih otomatis; M.GEN.0175 - Pasir urug (bahan/m3): tidak cukup kuat untuk dipilih otomatis | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:57 -->
| 57 | Tanah padas | `bahan` | `m3` | 95000 | M.GEN.0072 - Tanah Subur (bahan/m3): tidak cukup kuat untuk dipilih otomatis; M.GEN.1553 - Urukan Tanah (bahan/m3): tidak cukup kuat untuk dipilih otomatis; M.GEN.0070 - Tanah liat (lempung) *) (bahan/m3): tidak cukup kuat untuk dipilih otomatis; M.GEN.1552 - Galian Tanah Biasa (bahan/m3): tidak cukup kuat untuk dipilih otomatis; M.GEN.0069 - Tanah biasa/ liat berpasir *) (bahan/m3): tidak cukup kuat untuk dipilih... | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:58 -->
| 58 | Granite 60 x60 polished dengan garis stepnosing tangga | `bahan` | `m2` | 190000 | M.GEN.0359 - Pintu lipat lengkap dengan accessories (bahan/m2): nama terlalu jauh; M.GEN.0345 - Rolling Door Besi Lengkap dengan Accessories (bahan/m2): nama terlalu jauh; M.GEN.0358 - Rolling Door Aluminium Lengkap dengan Accessories (bahan/m2): nama terlalu jauh; M.GEN.0385 - Teralis Besi Strip lengkap dengan accessories (bahan/m2): nama terlalu jauh; M.GEN.0429 - Tangga Servis tinggi 4 m (bahan/buah): unit beda... | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:59 -->
| 59 | Granite 60 x60 unpolished | `bahan` | `m2` | 160000 | M.GEN.0028 - Banner plastik 0,6 x 0,8 m2 (bahan/m2): angka tidak cocok, nama terlalu jauh; M.GEN.0076 - Geotextile (> 100 s/d 400 gr/m2) (bahan/m2): angka tidak cocok, nama terlalu jauh; M.GEN.0077 - Geotextil tebal (> 400 s/d 800 gr/m2) (bahan/m2): angka tidak cocok, nama terlalu jauh; M.GEN.0078 - Geotextile tebal (> 400 s/d 800 gr/m2) (bahan/m2): angka tidak cocok, nama terlalu jauh; M.GEN.0630 - Keramik Lantai... | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:60 -->
| 60 | Granite 60 x60 polished | `bahan` | `m2` | 140000 | M.GEN.0028 - Banner plastik 0,6 x 0,8 m2 (bahan/m2): angka tidak cocok, nama terlalu jauh; M.GEN.0076 - Geotextile (> 100 s/d 400 gr/m2) (bahan/m2): angka tidak cocok, nama terlalu jauh; M.GEN.0077 - Geotextil tebal (> 400 s/d 800 gr/m2) (bahan/m2): angka tidak cocok, nama terlalu jauh; M.GEN.0078 - Geotextile tebal (> 400 s/d 800 gr/m2) (bahan/m2): angka tidak cocok, nama terlalu jauh; M.GEN.0629 - Keramik Lantai... | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:61 -->
| 61 | Granite 100 x100 polished | `bahan` | `buah` | 265000 | M.GEN.0629 - Keramik Lantai uk. 20 x 20 cm, Polished (bahan/buah): angka tidak cocok; M.GEN.0640 - Keramik Lantai uk. 25 x 25 cm, Polished (bahan/buah): angka tidak cocok; M.GEN.0643 - Keramik Lantai uk. 25 x 40 cm, Polished (bahan/buah): angka tidak cocok; M.GEN.0644 - Keramik Lantai uk. 30 x 30 cm, Polished (bahan/buah): angka tidak cocok; M.GEN.0645 - Keramik Lantai uk. 30 x 60 cm, Polished (bahan/buah): angka... | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:62 -->
| 62 | Perekat khusus penutup lantai | `bahan` | `kg` | 3500 | M.GEN.0054 - Agg Penutup (bahan/kg): tidak cukup kuat untuk dipilih otomatis; M.GEN.0573 - Cat Penutup Kayu (bahan/kg): tidak cukup kuat untuk dipilih otomatis; M.GEN.0690 - Perekat Campuran Hydroseeding (bahan/kg): tidak cukup kuat untuk dipilih otomatis; M.GEN.0528 - Mortar Perekat Bata Ringan (bahan/kg): tidak cukup kuat untuk dipilih otomatis; M.GEN.0552 - Cat Penutup Baja Galvanis (bahan/kg): tidak cukup kuat... | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:63 -->
| 63 | Pengisi khusus rongga nat | `bahan` | `kg` | 15000 | M.GEN.0003 - Paku biasa 5 inch (bahan/kg): nama terlalu jauh; M.GEN.0004 - Semen Portland (PC) (bahan/kg): nama terlalu jauh; M.GEN.0005 - Pasir Beton (bahan/kg): nama terlalu jauh; M.GEN.0006 - Kerikil (bahan/kg): nama terlalu jauh; M.GEN.0012 - Baja L 40.40.4 (bahan/kg): nama terlalu jauh | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:64 -->
| 64 | Flexible waterproofing | `bahan` | `kg` | 55000 | M.GEN.0493 - Waterproofing Cristalin (bahan/kg): tidak cukup kuat untuk dipilih otomatis; M.GEN.0494 - Waterproofing Semen Base (bahan/kg): tidak cukup kuat untuk dipilih otomatis; M.GEN.0495 - Waterproofing Acrylic Base (bahan/kg): tidak cukup kuat untuk dipilih otomatis; M.GEN.0003 - Paku biasa 5 inch (bahan/kg): nama terlalu jauh; M.GEN.0004 - Semen Portland (PC) (bahan/kg): nama terlalu jauh | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:65 -->
| 65 | Baja tulangan polos U-24 | `bahan` | `kg` | 10100 | M.GEN.0138 - Baja Tulangan Polos (BjTP) diameter < 12 mm (bahan/kg): angka tidak cocok; M.GEN.0141 - Baja Tulangan Polos (BjTP) diameter ≥ 12 mm (bahan/kg): angka tidak cocok; M.GEN.0464 - Baja Tulangan (bahan/kg): nama katalog terlalu umum; M.GEN.0145 - Besi beton polos (bahan/kg): nama katalog terlalu umum; M.GEN.1557 - Tulangan (bahan/kg): nama katalog terlalu umum | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:66 -->
| 66 | Bambu cerucuk Ø 10-12 cm panjang 6m | `bahan` | `batang` | 20000 | M.GEN.0232 - Bambu Panjang 4,5 meter (bahan/batang): angka tidak cocok; M.GEN.0157 - Dolken kayu 8-10 cm panjang 4 m (bahan/batang): angka tidak cocok; M.GEN.0158 - Dolken kayu dia. 8- 10 cm panjang 4 m (bahan/batang): angka tidak cocok; M.GEN.0116 - Baja Ringan C75, t=1 mm (Batang Utama) (bahan/batang): angka tidak cocok, nama terlalu jauh; M.GEN.0117 - Baja Ringan C75, t=0,75 mm (Batang Pengaku) (bahan/batang):... | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:67 -->
| 67 | Pipa PVC tipe D Ø 2" panjang 4 m | `bahan` | `batang` | 65000 | M.GEN.0157 - Dolken kayu 8-10 cm panjang 4 m (bahan/batang): angka tidak cocok; M.GEN.0232 - Bambu Panjang 4,5 meter (bahan/batang): angka tidak cocok; M.GEN.0158 - Dolken kayu dia. 8- 10 cm panjang 4 m (bahan/batang): angka tidak cocok, nama terlalu jauh; M.GEN.0116 - Baja Ringan C75, t=1 mm (Batang Utama) (bahan/batang): angka tidak cocok, nama terlalu jauh; M.GEN.0235 - Pipa PVC ø 1" (bahan/m'): unit beda, angk... | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:68 -->
| 68 | Plint 10 x 60 | `bahan` | `buah` | 22000 | M.GEN.0663 - Plint Vynil uk. 15 x 30 cm (bahan/buah): angka tidak cocok; M.GEN.0628 - Plint Internal Cove Artistik 5 x 5 x 20 cm (bahan/buah): angka tidak cocok; M.GEN.0637 - Plint Keramik uk. 10 s.d. 15 cm x 20 cm (bahan/buah): angka tidak cocok; M.GEN.0638 - Plint Keramik uk. 10 s.d. 15 cm x 30 cm (bahan/buah): angka tidak cocok; M.GEN.0639 - Plint Keramik uk. 10 s.d. 15 cm x 40 cm (bahan/buah): angka tidak cocok | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:69 -->
| 69 | Buis beton Ø 80 cm | `bahan` | `buah` | 355000 | M.GEN.0181 - Alat penyambung beton ø 30 cm (bahan/buah): angka tidak cocok; M.GEN.0183 - Alat penyambung beton ø 35 cm (bahan/buah): angka tidak cocok; M.GEN.0185 - Alat penyambung beton ø 40 cm (bahan/buah): angka tidak cocok; M.GEN.0187 - Alat penyambung beton ø 45 cm (bahan/buah): angka tidak cocok; M.GEN.0189 - Alat penyambung beton ø 50 cm (bahan/buah): angka tidak cocok | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:70 -->
| 70 | Septic tank pabrikasi 800 liter | `bahan` | `buah` | 12500000 | M.GEN.0066 - Marmer graphir 10x10 cm (bahan/buah): angka tidak cocok, nama terlalu jauh; M.GEN.0067 - Marmer graphir 12x12 cm (bahan/buah): angka tidak cocok, nama terlalu jauh; M.GEN.0083 - Angkur M16 panjang 50 cm (bahan/buah): angka tidak cocok, nama terlalu jauh; M.GEN.0090 - Pembuatan 1 buah Cetakan Panel P1 RISHA (Asumsi 400 kali pakai) (bahan/buah): angka tidak cocok, nama terlalu jauh; M.GEN.1536 - Pressur... | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:71 -->
| 71 | Kloset jongkok porselen | `bahan` | `buah` | 350000 | M.GEN.0458 - Porselen 11x11 (bahan/buah): tidak cukup kuat untuk dipilih otomatis; M.GEN.0315 - Dinding Porselen uk. 10 x 20 cm (bahan/buah): tidak cukup kuat untuk dipilih otomatis; M.GEN.0316 - Dinding Porselen uk. 20 x 20 cm (bahan/buah): tidak cukup kuat untuk dipilih otomatis; M.GEN.0466 - Ubin Porselen 20x20cm (bahan/buah): tidak cukup kuat untuk dipilih otomatis; M.GEN.0450 - Kloset Jongkok (bahan/unit): un... | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:72 -->
| 72 | Pipa PVC tipe AW Ø 3/4" panjang 4 m | `bahan` | `batang` | 45000 | M.GEN.0157 - Dolken kayu 8-10 cm panjang 4 m (bahan/batang): angka tidak cocok; M.GEN.0232 - Bambu Panjang 4,5 meter (bahan/batang): angka tidak cocok; M.GEN.0158 - Dolken kayu dia. 8- 10 cm panjang 4 m (bahan/batang): angka tidak cocok, nama terlalu jauh; M.GEN.0116 - Baja Ringan C75, t=1 mm (Batang Utama) (bahan/batang): angka tidak cocok, nama terlalu jauh; M.GEN.0235 - Pipa PVC ø 1" (bahan/m'): unit beda, angk... | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:73 -->
| 73 | Kran air | `bahan` | `buah` | 60000 | M.GEN.0471 - Kran Air diameter 1/2 inch (bahan/buah): tidak cukup kuat untuk dipilih otomatis; M.GEN.0472 - Kran Air diameter 3/4 inch (bahan/buah): tidak cukup kuat untuk dipilih otomatis; M.GEN.1919 - Air Valve Ø 8" (200 mm) (bahan/Buah): tidak cukup kuat untuk dipilih otomatis; M.GEN.1920 - Air Valve Ø 3" (80 mm) (bahan/Buah): tidak cukup kuat untuk dipilih otomatis; M.GEN.1921 - Air Valve Ø 1-1/2 " (40 mm) (ba... | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:75 -->
| 75 | Floor drain stainles steel | `bahan` | `buah` | 75500 | M.GEN.0470 - Floor Drain (bahan/buah): tidak cukup kuat untuk dipilih otomatis; M.GEN.0403 - Engsel Tanam (Floor Hinge) (bahan/buah): tidak cukup kuat untuk dipilih otomatis; M.GEN.0035 - Bata merah (bahan/buah): nama terlalu jauh; M.GEN.0037 - Jendela naco (bahan/buah): nama terlalu jauh; M.GEN.0039 - Kunci tanam (bahan/buah): nama terlalu jauh | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:76 -->
| 76 | Lampu LED 12 watt | `bahan` | `buah` | 55000 | M.GEN.1129 - DMX LED Controller, 1 Universe dan aksesoris (bahan/buah): angka tidak cocok; M.GEN.0066 - Marmer graphir 10x10 cm (bahan/buah): angka tidak cocok, nama terlalu jauh; M.GEN.0067 - Marmer graphir 12x12 cm (bahan/buah): nama terlalu jauh; M.GEN.0083 - Angkur M16 panjang 50 cm (bahan/buah): angka tidak cocok, nama terlalu jauh; M.GEN.1109 - Lampu LED 7 Watt dan aksesoris (bahan/Unit): unit beda, angka ti... | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:77 -->
| 77 | Armature Lampu | `bahan` | `buah` | 70000 | M.GEN.0035 - Bata merah (bahan/buah): nama terlalu jauh; M.GEN.0037 - Jendela naco (bahan/buah): nama terlalu jauh; M.GEN.0039 - Kunci tanam (bahan/buah): nama terlalu jauh; M.GEN.0063 - Paku payung (bahan/buah): nama terlalu jauh; M.GEN.1098 - Pelindung Lampu (bahan/Unit): unit beda | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:78 -->
| 78 | Lampu LED 18 watt | `bahan` | `buah` | 75000 | M.GEN.1129 - DMX LED Controller, 1 Universe dan aksesoris (bahan/buah): angka tidak cocok; M.GEN.0066 - Marmer graphir 10x10 cm (bahan/buah): angka tidak cocok, nama terlalu jauh; M.GEN.0067 - Marmer graphir 12x12 cm (bahan/buah): angka tidak cocok, nama terlalu jauh; M.GEN.0083 - Angkur M16 panjang 50 cm (bahan/buah): angka tidak cocok, nama terlalu jauh; M.GEN.1109 - Lampu LED 7 Watt dan aksesoris (bahan/Unit):... | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:79 -->
| 79 | Saklar Clipsal single | `bahan` | `buah` | 30000 | M.GEN.0035 - Bata merah (bahan/buah): nama terlalu jauh; M.GEN.0037 - Jendela naco (bahan/buah): nama terlalu jauh; M.GEN.0039 - Kunci tanam (bahan/buah): nama terlalu jauh; M.GEN.0063 - Paku payung (bahan/buah): nama terlalu jauh; M.GEN.1017 - Saklar Tunggal dan aksesoris (bahan/Unit): unit beda | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:80 -->
| 80 | Saklar Clipsal double | `bahan` | `buah` | 40000 | M.GEN.1954 - Double Nipple Ø3/4" (20 mm) (bahan/Buah): tidak cukup kuat untuk dipilih otomatis; M.GEN.2027 - Double Nipple (Brass) Ø 1/2" (15 mm) (bahan/Buah): tidak cukup kuat untuk dipilih otomatis; M.GEN.0035 - Bata merah (bahan/buah): nama terlalu jauh; M.GEN.0037 - Jendela naco (bahan/buah): nama terlalu jauh; M.GEN.0039 - Kunci tanam (bahan/buah): nama terlalu jauh | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:81 -->
| 81 | Stop kontak Clipsal | `bahan` | `buah` | 30000 | M.GEN.0406 - Door Stop (bahan/buah): tidak cukup kuat untuk dipilih otomatis; M.GEN.0469 - Stop Keran 1/2” (bahan/buah): tidak cukup kuat untuk dipilih otomatis; M.GEN.0461 - Stop Keran PVC 3/4" (bahan/buah): tidak cukup kuat untuk dipilih otomatis; M.GEN.0035 - Bata merah (bahan/buah): nama terlalu jauh; M.GEN.1020 - Stop Kontak AC dan aksesoris (bahan/Unit): unit beda | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:82 -->
| 82 | Kabel NYM 2 x 2,5 mm2 | `bahan` | `m2` | 12000 | M.GEN.0028 - Banner plastik 0,6 x 0,8 m2 (bahan/m2): angka tidak cocok, nama terlalu jauh; M.GEN.0076 - Geotextile (> 100 s/d 400 gr/m2) (bahan/m2): angka tidak cocok, nama terlalu jauh; M.GEN.0077 - Geotextil tebal (> 400 s/d 800 gr/m2) (bahan/m2): angka tidak cocok, nama terlalu jauh; M.GEN.0078 - Geotextile tebal (> 400 s/d 800 gr/m2) (bahan/m2): angka tidak cocok, nama terlalu jauh; M.GEN.1021 - Kabel NYM 3 x... | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:83 -->
| 83 | Pralon 5/8" warna putih | `bahan` | `buah` | 10000 | M.GEN.0592 - Ubin Warna uk. 60 x 60 cm (bahan/buah): angka tidak cocok; M.GEN.0589 - Ubin Warna uk. 20 cm x 20 cm (bahan/buah): angka tidak cocok; M.GEN.0590 - Ubin Warna uk. 30 cm x 30 cm (bahan/buah): angka tidak cocok; M.GEN.0591 - Ubin Warna uk. 40 cm x 40 cm (bahan/buah): angka tidak cocok; M.GEN.0593 - Plint Ubin Warna uk. 10 s.d. 15 cm x 20 cm (bahan/buah): angka tidak cocok | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:84 -->
| 84 | Plafond PVC Motif | `bahan` | `m2` | 60000 | M.GEN.0051 - Cat dinding/plafon (bahan/m2): tidak cukup kuat untuk dipilih otomatis; M.GEN.0504 - Plafon Serat Semen/GRC Tebal 4 mm Termasuk Alat Pasang (bahan/m2): nama terlalu jauh; M.GEN.0506 - Plafon Serat Semen/GRC Tebal 5 mm Termasuk Alat Pasang (bahan/m2): nama terlalu jauh; M.GEN.0507 - Plafon Serat Semen/GRC Tebal 6 mm Termasuk Alat Pasang (bahan/m2): nama terlalu jauh; M.GEN.0460 - Pipa PVC 3/4" (bahan/m... | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:86 -->
| 86 | Hollow galvanis 40x40x0,4 mm | `bahan` | `m` | 7000 | M.GEN.0708 - Besi hollow 30x60 (bahan/m): angka tidak cocok; M.GEN.0338 - Rangka Metal Hollow 40.40 (bahan/m’): angka tidak cocok; M.GEN.0342 - Rangka Metal Hollow 20x40 mm (bahan/m’): angka tidak cocok; M.GEN.1486 - Hollow 50 x 50mm (bahan/m): angka tidak cocok; M.GEN.2116 - Pipa Galvanis, DN. 2- 1/2" (65 mm) (bahan/m): angka tidak cocok | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:88 -->
| 88 | Kayu Meranti (balok) | `bahan` | `m3` | 3650000 | M.GEN.0130 - Balok Kayu Kelas I (bahan/m3): tidak cukup kuat untuk dipilih otomatis; M.GEN.0131 - Balok Kayu Kelas II (bahan/m3): tidak cukup kuat untuk dipilih otomatis; M.GEN.0285 - Balok Kayu Kelas III (bahan/m3): tidak cukup kuat untuk dipilih otomatis; M.GEN.0322 - Balok Kayu, 6 x 12 Kelas II (bahan/m3): tidak cukup kuat untuk dipilih otomatis; M.GEN.0375 - Balok Kayu 6/12 Kelas I (bahan/m3): tidak cukup kuat... | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:89 -->
| 89 | Kayu bengkirai (balok kaso 5x7) | `bahan` | `m3` | 7000000 | M.GEN.0217 - Kayu kaso 5/7 (bahan/m3): tidak cukup kuat untuk dipilih otomatis; M.GEN.0220 - Kayu kaso 5/8 (bahan/m3): angka tidak cocok; M.GEN.0222 - Kayu kaso 5/9 (bahan/m3): angka tidak cocok; M.GEN.0224 - Kayu kaso 5/10 (bahan/m3): angka tidak cocok; M.GEN.0100 - Kaso 5 x 7 Kayu Kelas 3 (bahan/m3): angka tidak cocok | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:90 -->
| 90 | Kayu bengkirai (balok reng 2x3) | `bahan` | `m3` | 7000000 | M.GEN.0133 - Reng 2/3 Kayu Kelas II (bahan/m3): tidak cukup kuat untuk dipilih otomatis; M.GEN.0135 - Reng 3/4 Kayu Kelas II (bahan/m3): angka tidak cocok; M.GEN.0322 - Balok Kayu, 6 x 12 Kelas II (bahan/m3): angka tidak cocok; M.GEN.0375 - Balok Kayu 6/12 Kelas I (bahan/m3): angka tidak cocok; M.GEN.0377 - Balok Kayu 6/15 Kelas I (bahan/m3): angka tidak cocok | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:92 -->
| 92 | Beton Ready mix K-250 | `bahan` | `m3` | 850000 | M.GEN.0162 - Beton Ready Mixed f'c 10 MPa (bahan/m3): angka tidak cocok; M.GEN.0163 - Beton Ready Mixed f'c 35 MPa (bahan/m3): angka tidak cocok; M.GEN.0164 - Beton Ready Mixed f'c 15 MPa (bahan/m3): angka tidak cocok; M.GEN.0165 - Beton Ready Mixed f'c 17 MPa (bahan/m3): angka tidak cocok; M.GEN.0166 - Beton Ready Mixed f'c 20 MPa (bahan/m3): angka tidak cocok | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:94 -->
| 94 | Roster/terawang | `bahan` | `buah` | 7500 | M.GEN.0035 - Bata merah (bahan/buah): nama terlalu jauh; M.GEN.0037 - Jendela naco (bahan/buah): nama terlalu jauh; M.GEN.0039 - Kunci tanam (bahan/buah): nama terlalu jauh; M.GEN.0063 - Paku payung (bahan/buah): nama terlalu jauh; M.GEN.0065 - Pen kuningan titik acuan (bahan/buah): nama terlalu jauh | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:95 -->
| 95 | Cat dasar (cat tembok exterior) | `bahan` | `kg` | 55000 | M.GEN.0543 - Cat Dasar Tembok (bahan/kg): tidak cukup kuat untuk dipilih otomatis; M.GEN.0544 - Cat Tembok Interior (bahan/kg): tidak cukup kuat untuk dipilih otomatis; M.GEN.0545 - Cat Tembok Eksterior (bahan/kg): tidak cukup kuat untuk dipilih otomatis; M.GEN.0560 - Cat Dasar Plafond (bahan/kg): tidak cukup kuat untuk dipilih otomatis; M.GEN.0572 - Cat Dasar Kayu (bahan/kg): tidak cukup kuat untuk dipilih otomatis | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:96 -->
| 96 | Cat penutup (cat tembok exterior) | `bahan` | `kg` | 70000 | M.GEN.0543 - Cat Dasar Tembok (bahan/kg): tidak cukup kuat untuk dipilih otomatis; M.GEN.0544 - Cat Tembok Interior (bahan/kg): tidak cukup kuat untuk dipilih otomatis; M.GEN.0545 - Cat Tembok Eksterior (bahan/kg): tidak cukup kuat untuk dipilih otomatis; M.GEN.0573 - Cat Penutup Kayu (bahan/kg): tidak cukup kuat untuk dipilih otomatis; M.GEN.0552 - Cat Penutup Baja Galvanis (bahan/kg): tidak cukup kuat untuk dipi... | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:97 -->
| 97 | Cat kedap air ( water base) | `bahan` | `kg` | 4500 | M.GEN.0024 - Cat kayu (bahan/kg): tidak cukup kuat untuk dipilih otomatis; M.GEN.0426 - Cat Zyncromate (bahan/kg): tidak cukup kuat untuk dipilih otomatis; M.GEN.0440 - Cat Thermoplast (bahan/kg): tidak cukup kuat untuk dipilih otomatis; M.GEN.0563 - Cat Epoxy (bahan/kg): tidak cukup kuat untuk dipilih otomatis; M.GEN.1082 - Base Air Terminal dan aksesoris (bahan/Unit): unit beda | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:99 -->
| 99 | Keramik 30 x 60 cm | `bahan` | `buah` | 11000 | M.GEN.0654 - Keramik Tactile uk. 30 x 30 cm (bahan/buah): angka tidak cocok; M.GEN.0655 - Keramik Tactile uk. 40 x 40 cm (bahan/buah): angka tidak cocok; M.GEN.0306 - Keramik Dinding uk. 10 cm x 20 cm (bahan/buah): angka tidak cocok; M.GEN.0307 - Keramik Dinding uk. 20 cm x 20 cm (bahan/buah): angka tidak cocok; M.GEN.0623 - Keramik Lantai Artistik uk. 8 x 8 cm (bahan/buah): angka tidak cocok | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:100 -->
| 100 | Keramik 30 x 30 cm | `bahan` | `buah` | 8500 | M.GEN.0654 - Keramik Tactile uk. 30 x 30 cm (bahan/buah): tidak cukup kuat untuk dipilih otomatis; M.GEN.0655 - Keramik Tactile uk. 40 x 40 cm (bahan/buah): angka tidak cocok; M.GEN.0306 - Keramik Dinding uk. 10 cm x 20 cm (bahan/buah): angka tidak cocok; M.GEN.0307 - Keramik Dinding uk. 20 cm x 20 cm (bahan/buah): angka tidak cocok; M.GEN.0623 - Keramik Lantai Artistik uk. 8 x 8 cm (bahan/buah): angka tidak cocok | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:101 -->
| 101 | paving block abu, K300 t=6 cm | `bahan` | `m2` | 85000 | M.GEN.2092 - Paving block Tebal 6 cm f'c 20 MPa (bahan/m2): angka tidak cocok; M.GEN.0080 - Geomembran t = 1,5 mm (bahan/m2): angka tidak cocok; M.GEN.0533 - Rockwool t = 50 mm (bahan/m2): angka tidak cocok; M.GEN.0354 - Block Board tebal 2 x 18 mm (bahan/m2): angka tidak cocok; M.GEN.1484 - Rockwool Density 80kg/m3 t-40 (bahan/m2): angka tidak cocok, nama terlalu jauh | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:102 -->
| 102 | Hollow 50x50x1 mm | `bahan` | `kg` | 13500 | M.GEN.0216 - Besi hollow (50 x 50 x 3) mm (bahan/kg): angka tidak cocok; M.GEN.0003 - Paku biasa 5 inch (bahan/kg): angka tidak cocok, nama terlalu jauh; M.GEN.0012 - Baja L 40.40.4 (bahan/kg): angka tidak cocok, nama terlalu jauh; M.GEN.0013 - Kawat seng 3mm (bahan/kg): angka tidak cocok, nama terlalu jauh; M.GEN.0022 - Frame besi L.30.30.3 ***) (bahan/kg): angka tidak cocok, nama terlalu jauh | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:103 -->
| 103 | Hollow 40x40x1 mm | `bahan` | `kg` | 13500 | M.GEN.0216 - Besi hollow (50 x 50 x 3) mm (bahan/kg): angka tidak cocok; M.GEN.0003 - Paku biasa 5 inch (bahan/kg): angka tidak cocok, nama terlalu jauh; M.GEN.0012 - Baja L 40.40.4 (bahan/kg): angka tidak cocok, nama terlalu jauh; M.GEN.0013 - Kawat seng 3mm (bahan/kg): angka tidak cocok, nama terlalu jauh; M.GEN.0022 - Frame besi L.30.30.3 ***) (bahan/kg): angka tidak cocok, nama terlalu jauh | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:104 -->
| 104 | Plat Baja tebal 1mm | `bahan` | `kg` | 14500 | M.GEN.0128 - Besi Strip tebal 5 mm (bahan/kg): angka tidak cocok; M.GEN.0352 - Besi Pelat Baja tebal 2 mm (bahan/kg): angka tidak cocok; M.GEN.0012 - Baja L 40.40.4 (bahan/kg): angka tidak cocok; M.GEN.0216 - Besi hollow (50 x 50 x 3) mm (bahan/kg): angka tidak cocok; M.GEN.0334 - Baja Siku 40x40x4 mm (bahan/kg): angka tidak cocok | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:105 -->
| 105 | Hollow 75x50x1 mm | `bahan` | `kg` | 13500 | M.GEN.0216 - Besi hollow (50 x 50 x 3) mm (bahan/kg): angka tidak cocok; M.GEN.0003 - Paku biasa 5 inch (bahan/kg): angka tidak cocok, nama terlalu jauh; M.GEN.0012 - Baja L 40.40.4 (bahan/kg): angka tidak cocok, nama terlalu jauh; M.GEN.0013 - Kawat seng 3mm (bahan/kg): angka tidak cocok, nama terlalu jauh; M.GEN.0022 - Frame besi L.30.30.3 ***) (bahan/kg): angka tidak cocok, nama terlalu jauh | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:106 -->
| 106 | Cat dasar (cat tembok interior) | `bahan` | `kg` | 40000 | M.GEN.0543 - Cat Dasar Tembok (bahan/kg): tidak cukup kuat untuk dipilih otomatis; M.GEN.0544 - Cat Tembok Interior (bahan/kg): tidak cukup kuat untuk dipilih otomatis; M.GEN.0545 - Cat Tembok Eksterior (bahan/kg): tidak cukup kuat untuk dipilih otomatis; M.GEN.0560 - Cat Dasar Plafond (bahan/kg): tidak cukup kuat untuk dipilih otomatis; M.GEN.0561 - Cat Plafond Interior (bahan/kg): tidak cukup kuat untuk dipilih... | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:107 -->
| 107 | Cat penutup (cat tembok interior) | `bahan` | `kg` | 44000 | M.GEN.0544 - Cat Tembok Interior (bahan/kg): tidak cukup kuat untuk dipilih otomatis; M.GEN.0543 - Cat Dasar Tembok (bahan/kg): tidak cukup kuat untuk dipilih otomatis; M.GEN.0545 - Cat Tembok Eksterior (bahan/kg): tidak cukup kuat untuk dipilih otomatis; M.GEN.0561 - Cat Plafond Interior (bahan/kg): tidak cukup kuat untuk dipilih otomatis; M.GEN.0573 - Cat Penutup Kayu (bahan/kg): tidak cukup kuat untuk dipilih o... | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:108 -->
| 108 | step nosing | `bahan` | `buah` | 16000 | M.GEN.0642 - Step nosing keramik uk. 10 cm x 60 cm (bahan/buah): tidak cukup kuat untuk dipilih otomatis; M.GEN.0035 - Bata merah (bahan/buah): nama terlalu jauh; M.GEN.0037 - Jendela naco (bahan/buah): nama terlalu jauh; M.GEN.0039 - Kunci tanam (bahan/buah): nama terlalu jauh; M.GEN.0063 - Paku payung (bahan/buah): nama terlalu jauh | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:109 -->
| 109 | Plint kaca ryband tebal 8 cm | `bahan` | `buah` | 10500 | M.GEN.0663 - Plint Vynil uk. 15 x 30 cm (bahan/buah): angka tidak cocok; M.GEN.0527 - Bata Ringan Tebal 7,5 cm (bahan/buah): angka tidak cocok; M.GEN.0529 - Bata Ringan Tebal 10 cm (bahan/buah): angka tidak cocok; M.GEN.0530 - Bata Ringan Tebal 20 cm (bahan/buah): angka tidak cocok; M.GEN.0414 - Kaca tebal 3 mm (bahan/m2): unit beda, angka tidak cocok | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:110 -->
| 110 | List gypsum 10 x 10 cm | `bahan` | `buah` | 27000 | M.GEN.0066 - Marmer graphir 10x10 cm (bahan/buah): nama terlalu jauh; M.GEN.0067 - Marmer graphir 12x12 cm (bahan/buah): angka tidak cocok, nama terlalu jauh; M.GEN.0083 - Angkur M16 panjang 50 cm (bahan/buah): angka tidak cocok, nama terlalu jauh; M.GEN.0090 - Pembuatan 1 buah Cetakan Panel P1 RISHA (Asumsi 400 kali pakai) (bahan/buah): angka tidak cocok, nama terlalu jauh; M.GEN.0513 - List Gypsum (bahan/m’): un... | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:195 -->
| 195 | Bulldozer 100-150 HP | `bahan` | `jam` | 250000 | E.GEN.0115 - Excavator (Std.); Bucket 0,55 m3; 95 HP *) (alat/jam): kategori beda, angka tidak cocok; E.GEN.0124 - Horizontal Drill Machine 240 HP, Kapasitas 30-40 ton termasuk kelengkapannya (alat/jam): kategori beda, angka tidak cocok, nama terlalu jauh; E.GEN.0009 - Chainsaw 35”; 10 HP (alat/hari): kategori beda, unit beda, angka tidak cocok; E.GEN.0033 - Jack hammer (5 KW) + Genset (12 HP) (alat/hari): kategor... | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:196 -->
| 196 | Wheel loader 1,0-1,6 m³ | `bahan` | `jam` | 300000 | M.GEN.0457 - Bak Teraso vol. 0,3 m3 (bahan/unit): unit beda, angka tidak cocok; M.GEN.0459 - Bak Fibreglass vol. 0.3 m3 (bahan/unit): unit beda, angka tidak cocok; M.GEN.0462 - Bak Fibreglass vol. 1.0 m3 (bahan/unit): unit beda, angka tidak cocok; M.GEN.1484 - Rockwool Density 80kg/m3 t-40 (bahan/m2): unit beda, angka tidak cocok; E.GEN.0001 - Wheel Loader (alat/jam): kategori beda | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:197 -->
| 197 | Dump truck 7,5 ton | `bahan` | `jam` | 150000 | E.GEN.0002 - Dump Truck 1 (alat/jam): kategori beda, angka tidak cocok; E.GEN.0003 - Dump Truck 2 (alat/jam): kategori beda, angka tidak cocok; E.GEN.0004 - Dump Truck 3 (alat/jam): kategori beda, angka tidak cocok; E.GEN.0116 - Crane truck 3 Ton, Winch 5 Ton *) (alat/jam): kategori beda, angka tidak cocok; E.GEN.0117 - Crane truck 5 Ton, Winch 8 Ton *) (alat/jam): kategori beda, angka tidak cocok | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:198 -->
| 198 | Excavator 80-140 HP | `bahan` | `jam` | 225000 | E.GEN.0115 - Excavator (Std.); Bucket 0,55 m3; 95 HP *) (alat/jam): kategori beda, angka tidak cocok; E.GEN.0124 - Horizontal Drill Machine 240 HP, Kapasitas 30-40 ton termasuk kelengkapannya (alat/jam): kategori beda, angka tidak cocok, nama terlalu jauh; E.GEN.0009 - Chainsaw 35”; 10 HP (alat/hari): kategori beda, unit beda, angka tidak cocok; E.GEN.0033 - Jack hammer (5 KW) + Genset (12 HP) (alat/hari): kategor... | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:199 -->
| 199 | Dump truck 20 ton | `bahan` | `jam` | 180000 | E.GEN.0002 - Dump Truck 1 (alat/jam): kategori beda, angka tidak cocok; E.GEN.0003 - Dump Truck 2 (alat/jam): kategori beda, angka tidak cocok; E.GEN.0004 - Dump Truck 3 (alat/jam): kategori beda, angka tidak cocok; E.GEN.0116 - Crane truck 3 Ton, Winch 5 Ton *) (alat/jam): kategori beda, angka tidak cocok; E.GEN.0117 - Crane truck 5 Ton, Winch 8 Ton *) (alat/jam): kategori beda, angka tidak cocok | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:200 -->
| 200 | Alat bantu | `bahan` | `ls` | 10000 | M.GEN.1126 - Junction Box IP Rated termasuk alat bantu dan aksesoris (bahan/buah): unit beda; M.GEN.1053 - Material Bantu (bahan/lot): unit beda; M.GEN.0179 - Alat penyambung balok Δ 28 cm (bahan/buah): unit beda; M.GEN.0194 - Alat penyambung balok Δ 32 cm (bahan/buah): unit beda; M.GEN.0196 - Alat penyambung beton 20 x 20 cm (bahan/buah): unit beda | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:201 -->
| 201 | Jack hammer | `bahan` | `jam` | 50000 | M.GEN.1273 - Modular Jack dan aksesoris (bahan/unit): unit beda; M.GEN.1537 - Tangki Anti Water Hammer + Material Bantu/Aksesoris (bahan/Unit): unit beda; E.GEN.0067 - Driver Hammer 1 Ton (alat/jam): kategori beda; E.GEN.0068 - Driver Hammer 2 Ton (alat/jam): kategori beda; E.GEN.0016 - Jack Hammer Drill 2,5 KW + Genset 5 KW (alat/hari): kategori beda, unit beda | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:202 -->
| 202 | Palu/Godam (Baja keras) | `bahan` | `buah` | 100000 | M.GEN.0434 - Logo PU Pelat Baja uk. 80 cm x 80 cm (bahan/buah): tidak cukup kuat untuk dipilih otomatis; M.GEN.0435 - Signage Pelat Baja lengkap dengan accessories (bahan/buah): nama terlalu jauh; M.GEN.0114 - Angkur Baja Full Drat ASTM 307 Ø 10 mm panjang 35 cm (bahan/buah): nama terlalu jauh; M.GEN.0115 - Angkur Baja Full Drat ASTM 307 Ø 10 mm panjang 65 cm (bahan/buah): nama terlalu jauh; E.GEN.0027 - Palu/goda... | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:203 -->
| 203 | Gergaji Besi | `bahan` | `buah` | 10000 | M.GEN.0434 - Logo PU Pelat Baja uk. 80 cm x 80 cm (bahan/buah): tidak cukup kuat untuk dipilih otomatis; M.GEN.0435 - Signage Pelat Baja lengkap dengan accessories (bahan/buah): tidak cukup kuat untuk dipilih otomatis; M.GEN.0114 - Angkur Baja Full Drat ASTM 307 Ø 10 mm panjang 35 cm (bahan/buah): tidak cukup kuat untuk dipilih otomatis; M.GEN.0115 - Angkur Baja Full Drat ASTM 307 Ø 10 mm panjang 65 cm (bahan/buah... | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:204 -->
| 204 | Pahat Beton (Baja keras) | `bahan` | `buah` | 65000 | M.GEN.0245 - Genteng Beton (bahan/buah): tidak cukup kuat untuk dipilih otomatis; M.GEN.0443 - Paku beton 5 cm (bahan/buah): tidak cukup kuat untuk dipilih otomatis; M.GEN.0180 - Sepatu pancang beton Δ 28 cm (bahan/buah): tidak cukup kuat untuk dipilih otomatis; M.GEN.0195 - Sepatu pancang beton Δ 32 cm (bahan/buah): tidak cukup kuat untuk dipilih otomatis; E.GEN.0028 - Pahat beton (baja keras) (alat/buah): katego... | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:205 -->
| 205 | Vibratory plate tamper | `bahan` | `jam` | 10000 | M.GEN.1459 - Orifice Plate dia. 25 mm dan aksesoris (bahan/Unit): unit beda; E.GEN.0083 - Alat Pancang Mini Pile Driver (Vibratory) Hammer 50 kg (1 HP) (alat/Jam): kategori beda, unit beda, nama terlalu jauh | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:206 -->
| 206 | Tripod tinggi 5 m | `bahan` | `hari` | 150000 | M.GEN.0429 - Tangga Servis tinggi 4 m (bahan/buah): unit beda, angka tidak cocok; M.GEN.0021 - Tiang kayu 8/12 kelas II, tinggi 4m (bahan/m3): unit beda, angka tidak cocok; E.GEN.0026 - Tripod tinggi 7 m kap 2 ton (alat/hari): kategori beda, angka tidak cocok; E.GEN.0031 - Tripod 7 meter (alat/hari): kategori beda, angka tidak cocok; E.GEN.0103 - Sewa tripod/tackel (alat/hari): kategori beda | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:207 -->
| 207 | Alat pancang Hammer 0.5 ton | `bahan` | `hari` | 300000 | M.GEN.0197 - Sepatu pancang 20 x 20 cm (bahan/buah): unit beda, angka tidak cocok; M.GEN.0199 - Sepatu pancang 25 x 25 cm (bahan/buah): unit beda, angka tidak cocok; M.GEN.0201 - Sepatu pancang 30 x 30 cm (bahan/buah): unit beda, angka tidak cocok; M.GEN.0203 - Sepatu pancang 35 x 35 cm (bahan/buah): unit beda, angka tidak cocok; E.GEN.0074 - Alat pancang Hidraulik Pile Driver 2 ton (alat/jam): kategori beda, unit... | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:208 -->
| 208 | Concrete mixer 350 ℓ | `bahan` | `jam` | 15000 | M.GEN.0012 - Baja L 40.40.4 (bahan/kg): unit beda, angka tidak cocok; M.GEN.0022 - Frame besi L.30.30.3 ***) (bahan/kg): unit beda, angka tidak cocok; M.GEN.0027 - Frame aluminium L.10.1 **) (bahan/kg): unit beda, angka tidak cocok; M.GEN.0351 - Besi Siku L 30.30.3 (bahan/kg): unit beda, angka tidak cocok; M.GEN.0227 - Prestressed Concrete (PC) Strand (bahan/kg): unit beda | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:209 -->
| 209 | Water tanker truck 3000-4000 ℓ | `bahan` | `jam` | 120000 | M.GEN.0012 - Baja L 40.40.4 (bahan/kg): unit beda, angka tidak cocok; M.GEN.0022 - Frame besi L.30.30.3 ***) (bahan/kg): unit beda, angka tidak cocok; M.GEN.0027 - Frame aluminium L.10.1 **) (bahan/kg): unit beda, angka tidak cocok; M.GEN.0152 - PVC Water stop 230- 320 mm (bahan/m): unit beda, angka tidak cocok; E.GEN.0097 - Sewa Water Truck (alat/hari): kategori beda, unit beda | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:210 -->
| 210 | Crane on wheel 10-15 ton | `bahan` | `jam` | 165000 | E.GEN.0077 - Crane Mobile 7 ton (alat/jam): kategori beda, angka tidak cocok; E.GEN.0066 - Crawler Crane 10 Ton + leader 14 ton (alat/jam): kategori beda, angka tidak cocok; E.GEN.0075 - Crawler Crane 20 Ton + leader 14 ton (alat/jam): kategori beda, angka tidak cocok; E.GEN.0116 - Crane truck 3 Ton, Winch 5 Ton *) (alat/jam): kategori beda, angka tidak cocok; E.GEN.0117 - Crane truck 5 Ton, Winch 8 Ton *) (alat/j... | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:211 -->
| 211 | Concrete vibrator | `bahan` | `jam` | 20000 | M.GEN.0227 - Prestressed Concrete (PC) Strand (bahan/kg): unit beda; E.GEN.0050 - Vibrator (alat/hari): kategori beda, unit beda; E.GEN.0114 - Concrete Cutter (alat/hari): kategori beda, unit beda; E.GEN.0085 - Alat Pancang Mini Pile Driver (Vibrator) Hammer 500 kg (10 HP) (alat/Hari): kategori beda, unit beda, nama terlalu jauh | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:212 -->
| 212 | Motor grader >100 HP | `bahan` | `jam` | 200000 | M.GEN.0995 - Motor Control Center (bahan/Unit): unit beda; E.GEN.0115 - Excavator (Std.); Bucket 0,55 m3; 95 HP *) (alat/jam): kategori beda, angka tidak cocok; E.GEN.0124 - Horizontal Drill Machine 240 HP, Kapasitas 30-40 ton termasuk kelengkapannya (alat/jam): kategori beda, angka tidak cocok, nama terlalu jauh; E.GEN.0009 - Chainsaw 35”; 10 HP (alat/hari): kategori beda, unit beda, angka tidak cocok; E.GEN.0033... | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:213 -->
| 213 | Tandem roller 6-8 ton | `bahan` | `jam` | 220000 | E.GEN.0067 - Driver Hammer 1 Ton (alat/jam): kategori beda, angka tidak cocok; E.GEN.0068 - Driver Hammer 2 Ton (alat/jam): kategori beda, angka tidak cocok; E.GEN.0073 - Driver Hammer 3 Ton (alat/jam): kategori beda, angka tidak cocok; E.GEN.0077 - Crane Mobile 7 ton (alat/jam): kategori beda, angka tidak cocok; E.GEN.0030 - Hoist 1 ton (alat/hari): kategori beda, unit beda, angka tidak cocok | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:214 -->
| 214 | Concrete slip form paver | `bahan` | `jam` | 30000 | M.GEN.0227 - Prestressed Concrete (PC) Strand (bahan/kg): unit beda; E.GEN.0114 - Concrete Cutter (alat/hari): kategori beda, unit beda | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:215 -->
| 215 | Sewa bekisting rigid | `bahan` | `hari` | 20000 | M.GEN.1558 - Bekisting (bahan/m2): unit beda; M.GEN.0087 - Minyak Bekisting (bahan/liter): unit beda; M.GEN.0465 - Kayu Bekisting (bahan/m2): unit beda; M.GEN.0159 - Penjaga jarak bekisting/spacer (bahan/buah): unit beda; M.GEN.0056 - Sewa Lahan (Jika di luar Rumija, Luas lahan bisa lebih besar dari contoh) (bahan/m2): unit beda, nama terlalu jauh | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:216 -->
| 216 | Bore pile machine | `bahan` | `jam` | 1000000 | E.GEN.0059 - Bored Pile Machine (Hidraulik) Auger ø 60 cm (alat/jam): kategori beda; E.GEN.0060 - Bored Pile Machine (Hidraulik) Auger ø 80 cm (alat/jam): kategori beda; E.GEN.0061 - Bored Pile Machine (Hidraulik) Auger ø 100 cm (alat/jam): kategori beda; E.GEN.0062 - Bored Pile Machine (Hidraulik) Auger ø 120 cm (alat/jam): kategori beda; E.GEN.0046 - Pressure Grout machine 30 KW; 60 - 75 bar (D) (alat/jam): kate... | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:217 -->
| 217 | Concrete pump | `bahan` | `jam` | 350000 | M.GEN.0227 - Prestressed Concrete (PC) Strand (bahan/kg): unit beda; M.GEN.1011 - Hand Pump Solar dan aksesoris (bahan/Unit): unit beda; M.GEN.1478 - Jockey Fire Pump Vertical Multi Stage, 25 USGPM dan aksesoris (bahan/Unit): unit beda, nama terlalu jauh; M.GEN.1479 - Main Fire Pump Centrifugal End Suction, 1.000 USGPM dan aksesoris (bahan/Unit): unit beda, nama terlalu jauh; E.GEN.0114 - Concrete Cutter (alat/har... | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:218 -->
| 218 | Formtie/penjaga jarak bekesting/spacer | `bahan` | `buah` | 25000 | M.GEN.0159 - Penjaga jarak bekisting/spacer (bahan/buah): tidak cukup kuat untuk dipilih otomatis; M.GEN.0035 - Bata merah (bahan/buah): nama terlalu jauh; M.GEN.0037 - Jendela naco (bahan/buah): nama terlalu jauh; M.GEN.0039 - Kunci tanam (bahan/buah): nama terlalu jauh; M.GEN.0063 - Paku payung (bahan/buah): nama terlalu jauh | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |
<!-- kejaksaan-source-row:219 -->
| 219 | Pompa Air, diesel 5 KW | `bahan` | `hari` | 80000 | M.GEN.0007 - Air (bahan/liter): unit beda; M.GEN.2172 - Air (bahan/m3): unit beda; M.GEN.0687 - Air bersih (bahan/liter): unit beda; M.GEN.1919 - Air Valve Ø 8" (200 mm) (bahan/Buah): unit beda, angka tidak cocok; E.GEN.0018 - Pompa lumpur diesel 10 KW; 5" (alat/hari): kategori beda, angka tidak cocok | tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama |

## Perbandingan dengan sumber Semarang lain

Perbandingan ini hanya memberi tanda bila kode yang sama muncul di KEJAKSAAN dan price book Semarang. Tidak ada rata-rata harga dan tidak ada nilai KEJAKSAAN yang diterapkan otomatis.

| Kode | Nama | Harga KEJAKSAAN | Harga Semarang | Selisih | Status |
|---|---|---:|---:|---:|---|
| `L.01` | Pekerja | 102000 | 102000 | 0.0% | selaras |
| `L.04` | Mandor | 112000 | 112000 | 0.0% | selaras |
| `L.02` | Tukang batu | 107000 | 107000 | 0.0% | selaras |
| `L.03` | Kepala Tukang | 109000 | 109000 | 0.0% | selaras |
| `L.02` | Tukang besi | 107000 | 107000 | 0.0% | selaras |
| `L.02` | Tukang Kayu | 107000 | 107000 | 0.0% | selaras |
| `L.GEN.0014` | Tukang Listrik | 107000 | 107000 | 0.0% | selaras |
| `M.GEN.0236` | Ijuk | 20000 | 20000 | 0.0% | selaras |
| `M.GEN.0464` | Baja Tulangan | 11500 | 11500 | 0.0% | selaras |
| `M.GEN.0146` | Kawat beton | 16000 | 16000 | 0.0% | selaras |
| `M.GEN.0087` | Minyak Bekisting | 12000 | 12000 | 0.0% | selaras |
| `M.GEN.0175` | Pasir urug | 175900 | 175900 | 0.0% | selaras |
| `M.GEN.0035` | Bata merah | 500 | 500 | 0.0% | selaras |
| `M.GEN.0085` | Baja Profil | 12000 | 12000 | 0.0% | selaras |
| `M.GEN.0553` | Kuas | 8000 | 8000 | 0.0% | selaras |
| `M.GEN.0547` | Ampelas | 3000 | 3000 | 0.0% | selaras |
| `M.GEN.1555` | Batu pecah / kerikil | 250000 | 250000 | 0.0% | selaras |
| `M.GEN.0007` | Air | 40 | 40 | 0.0% | selaras |
| `M.GEN.0174` | Batu belah | 265000 | 265000 | 0.0% | selaras |
| `M.GEN.0456` | Sealtape | 10000 | 10000 | 0.0% | selaras |
| `M.GEN.0032` | Besi Strip | 11000 | 11000 | 0.0% | selaras |
| `M.GEN.0245` | Genteng Beton | 12000 | 12000 | 0.0% | selaras |
| `M.GEN.0252` | Semen Warna | 9000 | 9000 | 0.0% | selaras |
| `M.GEN.0319` | Batu Tempel Hitam | 65000 | 65000 | 0.0% | selaras |

## Catatan Audit

- Matching aman mensyaratkan kategori, unit, angka/ukuran, dan nama lolos bersama.
- Kandidat dekat yang ditampilkan pada baris tidak ketemu adalah bukti penolakan, bukan rekomendasi penerapan harga.
- Baris yang beda kategori seperti alat yang muncul di section bahan tidak dipaksa masuk; alasan `kategori beda` ditampilkan agar bisa ditinjau manual.
