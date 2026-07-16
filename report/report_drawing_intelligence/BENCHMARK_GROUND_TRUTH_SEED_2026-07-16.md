# Benchmark Ground Truth — Seed v0 (2026-07-16)

> Dilabel manual dari fixture 88 halaman PLHUT dengan pembacaan insinyur sipil senior.
> Seed untuk harness evaluasi (Workstream 9). `current` = hasil probe endpoint hari ini.
> Kaidah penting semantik jawaban: **jumlah label tergambar ≠ jumlah fisik elemen**
> (denah bisa melabeli representatif saja) — sistem harus menjawab pada level "label
> tergambar/occurrence tercatat" + evidence, BUKAN mengklaim jumlah fisik.

| # | Pertanyaan (alami) | Kelas | Jawaban benar (evidence) | current |
|---|---|---|---|---|
| 1 | Bangunan ini berapa lantai? | PROJECT_OVERVIEW | 2 lantai + atap (+substruktur pondasi); peil ±0.00 = FFL Lantai 1 | **FAIL** — graf punya 12 "level" (7 pseudo) |
| 2 | Elemen apa saja yang ada di Lantai 2? | LIST_FILTER | arch (STK2, closet, dll) + MEP (26 occ) + STRUKTUR (K1A/K2/K3, lintel — hal.43,48) | **FAIL** — struktur hilang total (0 occ) |
| 3 | Kolom tipe apa saja dipakai di proyek? | LIST_FILTER | K1, K1A, K2, K3 (hal.42,43,50,54-56) | PARTIAL — type node ada, occurrence tidak |
| 4 | Kolom apa saja di Lantai 2? | LIST_FILTER | K1A, K2, K3 (hal.43 "DENAH KOLOM LANTAI 2") | **FAIL** — 0 occurrence struktur |
| 5 | Berapa label kolom tergambar di denah kolom Lantai 2? | COUNT (occurrence) | 17 label: K1A×12, K2×3, K3×2 (hal.43) | **FAIL** |
| 6 | Dimensi kolom K1 berapa? | NUMERIC_STORED_FACT | 400×400 mm (hal.50 TABEL KOLOM) | DATA-ADA-DI-GRAF (verified: ref hal.50 →HAS_DIMENSION→ "400x400 mm") — jalur query belum |
| 7 | Dimensi kolom K1A berapa? | MISSING_DATA (KONFIRMASI NYATA) | K1A HANYA muncul hal.42/43/54, TIDAK PERNAH dengan dimensi; absen dari TABEL KOLOM hal.50 → jawaban benar: "tidak tertulis di set gambar, perlu konfirmasi perencana" + flag review. Diverifikasi search 88 hal penuh | BELUM-DIUJI |
| 8 | Struktur apa saja di lantai 2? | LIST_FILTER (frasa gabungan) | kolom K1A/K2/K3 + balok lintel (hal.43,48) | **FAIL** — 0 node |
| 9 | Berapa volume beton kolom Lantai 2? | CALCULATION_REQUIRED | WAJIB menolak menghitung + arahkan ke Core Engine + approval; sebut data yang tersedia (tipe, dimensi, label) | **FAIL** — success kosong tanpa pengarahan |
| 10 | Ada berapa titik lampu di Lantai 1? | COUNT | dari occurrence MEP L1 (27 occ MEP — subset lampu; hitung dari graf, sebut evidence) | BELUM-DIUJI |
| 11 | Balok lintel dipakai di mana saja? | LIST_FILTER | LT.1 (10 label, hal.47) + LT-2 (3-4, hal.48) | **FAIL** — struktur |
| 12 | Pintu P2 ada di mana saja? | ELEMENT_LOOKUP | occurrence arch + refs (hal.21-22 dst) | PARTIAL — 75 node campur bleed |
| 13 | Potongan B menunjukkan apa? | SHEET_LOOKUP | hal.54: RB1/RB3-5, K1-K3, G1/G2, B2/B3, BL, CG2A — lintas level | BELUM-DIUJI |
| 14 | Ada konflik dimensi apa di gambar? | CONFLICT_LOOKUP | 1 konflik: total horizontal atas 20250 ≠ bawah 20000, selisih 250mm tak dijelaskan (hal.81) | DATA-ADA-DI-GRAF (verified: 1 node conflict + narasi) — jalur query belum |
| 15 | Elevasi FFL Lantai 2 berapa? | NUMERIC_STORED_FACT (KONFIRMASI) | **+4.400** — tertulis eksplisit "EL. +4.400 LANTAI 2" di hal.54 POTONGAN-B (juga "EL. ±0.000 LANTAI 1", "EL. +8.300 LANTAI ATAP") | BELUM-DIUJI |
| 15b | Elevasi lantai atap berapa? | NUMERIC_STORED_FACT + AMBIGUITY | +8.300 (hal.54) TAPI graf punya node "Lantai Atap P +16.20" — dua nilai berbeda → tampilkan keduanya + evidence + flag review (kemungkinan +16.20 = peil elemen lain/menara) | BELUM-DIUJI |
| 16 | Apa saja di Lantai 3? | HONEST_EMPTY | "Tidak ada Lantai 3 di proyek ini (bangunan 2 lantai)" — bukan sekadar 0 hasil | PARTIAL — 0 jujur tapi tanpa penjelasan |
| 17 | Main Floor itu lantai mana? | ALIAS semantik | = Lantai 1 (kasus DEM nyata: judul "DENAH LANTAI 1" ternormalisasi "Main Floor") | **FAIL** — 0 |
| 18 | K1A tidak ada di tabel kolom — apakah itu masalah? | CONFLICT/MISSING | Ya: K1A dipakai 12× di L2 (hal.43) tapi absen dari TABEL KOLOM (hal.50) → wajib flag review | BELUM-ADA fiturnya |

## Temuan desain penting dari pelabelan ini
Halaman POTONGAN menulis pemetaan elevasi→lantai secara EKSPLISIT
("EL. ±0.000 LANTAI 1" / "EL. +4.400 LANTAI 2" / "EL. +8.300 LANTAI ATAP", hal.54) —
kanonisasi elevasi→lantai bisa DETERMINISTIK dengan membaca pola ini dari gambar potongan;
DeepSeek Flash hanya untuk sisa kasus yang tidak tercakup pola (mis. "Main Floor").
Ini menurunkan biaya AI dan memperkuat tangga rule→Flash→Pro.

## Aturan penilaian harness (draft)
- PASS = jawaban memuat fakta benar + sitasi evidence + status data jujur (ambigu/konflik disebut).
- FAIL-scope = jawaban berisi node/fakta dari level/disiplin yang salah (lebih buruk dari kosong).
- FAIL-fabrikasi = angka/elemen tanpa evidence → pelanggaran berat.
- REFUSE-correct (untuk kelas kalkulasi) = menolak hitung + menyebut jalur benar (engine+approval).
- Metrik agregat: accuracy, wrong-level rate, false-scope rate, evidence coverage, zero-result
  rate, calculation-integrity (wajib 100%), konsistensi ulang-2×, latensi & token per query.

## Catatan semantik hitungan (Aturan Emas di level benchmark)
Jawaban COUNT selalu "X label/occurrence tercatat pada gambar" + halaman — TIDAK PERNAH
diklaim sebagai jumlah fisik terpasang; jumlah fisik = keputusan engineering (quantity
takeoff via engine + verifikasi manusia).
