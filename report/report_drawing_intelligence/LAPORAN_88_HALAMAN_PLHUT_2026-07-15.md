# Laporan Akhir — Uji Ekstraksi 88 Halaman PLHUT (Qwen3.7-Plus, Reasoning OFF)

**Tanggal:** 2026-07-15
**Fixture:** `docs/plans/drawing intelligence/Gambar kerja/GAMBAR KERJA PLHUT SURAKARTA (1).pdf` (88 halaman, terverifikasi)
**Provider:** Qwen3.7-Plus via OpenRouter, `reasoning: {"enabled": false}`, `response_format: json_schema` (strict)
**Hasil tersimpan lokal:** `report/report_drawing_intelligence/dem_extraction_88pages/pages/page-0000.json` s.d. `page-0087.json`

---

## Hasil Akhir

**88/88 halaman berhasil diekstrak, 0 gagal.**

Satu halaman (halaman 49, "DETAIL PONDASI") sempat gagal karena koneksi jaringan terputus di tengah proses (`IncompleteRead`, bukan kesalahan model) saat menjalankan 4 halaman sekaligus secara paralel. Bug penyebabnya (kesalahan klasifikasi error di kode kita, bukan masalah AI) sudah diperbaiki secara permanen, dan halaman itu berhasil diproses ulang di percobaan pertama setelah perbaikan.

## Ringkasan Proses

1. **44 halaman pertama** diproses satu per satu (sekuensial) — durasi ~30-40 detik/halaman.
2. Atas permintaan Anda, **44 halaman sisa** dilanjutkan dengan 4 halaman diproses bersamaan (paralel) — mempercepat proses secara signifikan.
3. Selama proses paralel, ditemukan 1 bug (klasifikasi error jaringan yang salah) — diperbaiki langsung, di-commit, lalu halaman yang gagal diproses ulang.
4. Setelah semua 88 halaman selesai, dilakukan analisa kualitas menyeluruh — ditemukan 2 masalah kualitas data (dijelaskan di bawah), keduanya sudah diperbaiki di kode untuk fase berikutnya.

**Total ada 4 commit kode selama sesi ini** (di luar 2 commit sebelumnya soal prompt/reasoning):
- Perbaikan klasifikasi `IncompleteRead` jadi `transient` (`524ffc3`)
- Perbaikan kontrak `evidence_refs` harus merujuk ID yang benar-benar ada (`1ca1e44`)
- Perbaikan format bbox wajib ternormalisasi 0-1 (`e0b6b35`)

---

## Statistik Keseluruhan

| Metrik | Nilai |
|---|---|
| Total halaman | 88 |
| Berhasil | 88 (100%) |
| Gagal permanen | 0 |
| Rata-rata evidence per halaman | 32,8 |
| Median evidence per halaman | 30 |
| Rata-rata observasi per halaman | 46,3 |
| Halaman dengan `is_complete: false` (terpotong) | 0 |
| Halaman dengan ambiguitas tercatat | 4 |
| Halaman dengan konflik tercatat | 1 |
| Halaman dengan item tak terklasifikasi | 4 |

**Sebaran disiplin gambar (klasifikasi otomatis oleh model):**
MEP 23 halaman, Arsitektur ~28 halaman (tergabung beberapa variasi penulisan: "Arsitektur"/"ARSITEKTUR"/"arsitektur"/"Architecture"), Struktur ~20 halaman (variasi serupa), Plumbing 2, dan beberapa kategori kecil lainnya.

*Catatan kualitas kecil:* nilai disiplin tidak konsisten kapitalisasi/bahasanya ("Arsitektur" vs "ARSITEKTUR" vs "Architecture") — ini wajar karena field ini bertipe teks bebas (`InterpretedValue`), bukan enum tertutup. Tidak menyalahi skema, tapi perlu dinormalisasi saat PCKM synthesis (Fase 3) kalau ingin pengelompokan disiplin yang rapi.

---

## Kualitas Ekstraksi — Sample yang Dibaca Langsung

Saya baca isi JSON dari beberapa halaman berbeda (bukan cuma statistik jumlah) dan cocokkan pola datanya:

- **Halaman 1 (cover):** judul, sub-judul, lokasi proyek — semua akurat.
- **Halaman 26 (Detail Kusen):** skala "1:25" terbaca 4x konsisten, dimensi "1100mm"/"2360mm" dengan `numeric_value` dan `unit` terisi benar.
- **Halaman 51 (Tabel Balok Lantai 1 & Sloof):** halaman dengan evidence terbanyak (110 item) — dimensi balok "300x600mm"/"250x400mm" terbaca presisi, cocok format tabel struktur nyata.
- **Halaman 76 (Denah Air Bekas Lt 1):** dimensi pipa "1625mm"/"1500mm" dengan satuan benar, disiplin "Plumbing" terklasifikasi tepat.
- **Halaman 88 (Detail Saluran Air Hujan):** dimensi "250mm"/"100mm" dengan skala "1:10" — akurat.

**Kesimpulan kualitas konten: baik.** Angka dimensi, kode elemen, dan klasifikasi disiplin secara konsisten akurat di seluruh sample yang saya periksa manual.

---

## Masalah Kualitas Data yang Ditemukan (dan Statusnya)

Ini bagian yang saya laporkan apa adanya, tidak disembunyikan, karena penting untuk Fase 3 nanti:

### 1. Referensi evidence yang putus (dangling reference) — 21,8% dari seluruh referensi

**Temuan:** dari 3.549 total `evidence_refs` di seluruh 88 halaman, **775 (21,8%) menunjuk ke `evidence_id` yang tidak pernah benar-benar dibuat** di array `evidence[]` halaman itu. Terjadi di 40 dari 88 halaman (45%).

**Contoh nyata (halaman 3):**
```json
{"raw": "BETON COR DITEMPAT", "evidence_refs": ["material-label-concrete-1"]}
```
tapi `evidence: []` di halaman itu kosong total — ID `"material-label-concrete-1"` cuma label buatan model, tidak pernah benar-benar jadi entri evidence.

**Dampak:** isi faktanya sendiri (mis. "BETON COR DITEMPAT") tetap akurat dan bisa dipakai — yang putus adalah jejak audit visualnya (tidak bisa diklik/dirujuk balik ke posisi bbox di gambar asli via evidence).

**Status:** akar masalah (prompt tidak menegaskan `evidence_refs` harus berpasangan wajib dengan entri nyata di `evidence[]`) sudah diperbaiki di kode (`1ca1e44`) untuk semua ekstraksi berikutnya. **Data 88-halaman ini TIDAK diproses ulang** (sesuai instruksi Anda: 88 halaman hanya dijalankan sekali) — dipakai apa adanya dengan catatan ini.

### 2. Bounding box dalam piksel, bukan koordinat ternormalisasi — 97% halaman

**Temuan:** 85 dari 88 halaman memakai bbox dalam skala piksel mentah (mis. `[120, 200, 180, 220]`) padahal seharusnya ternormalisasi 0.0-1.0 sesuai desain skema. Hanya 3 halaman yang kebetulan memakai format benar.

**Dampak:** tidak hilang data — `source.width_px`/`source.height_px` tetap tersimpan tiap halaman, jadi bbox piksel ini masih bisa dikonversi ke 0-1 belakangan kalau diperlukan (tinggal bagi dengan width_px/height_px). Tapi kalau dipakai langsung tanpa konversi, perbandingan posisi antar-halaman jadi tidak konsisten.

**Status:** sudah diperbaiki di kode (`e0b6b35`) untuk ekstraksi berikutnya. Data 88-halaman ini tidak diproses ulang, dipakai apa adanya.

### 3. Lima belas halaman dengan `evidence: []` kosong total

> **Koreksi 2026-07-15 (audit ulang):** angka "10 halaman" di versi laporan ini sebelumnya salah hitung (index tercampur 0-index/1-index). Dihitung ulang langsung dari file JSON aktual di `pages/` — hasil yang benar: **15 halaman**.

Ini adalah subset dari masalah #1 — 15 halaman (page_index 2, 4, 10, 15, 19, 29, 40, 48, 61, 68, 72, 81, 82, 83, 85 — setara page_number 3, 5, 11, 16, 20, 30, 41, 49, 62, 69, 73, 82, 83, 84, 86) punya `observations` terisi penuh (6-63 item) tapi `evidence[]` kosong sepenuhnya. Bukan halaman yang "gagal" atau kosong kontennya — datanya ada, cuma jejak evidence-nya 100% putus di halaman-halaman ini spesifik.

---

## Kesimpulan & Rekomendasi

**Data 88-halaman ini layak dipakai sebagai bahan uji/desain Fase 3 (PCKM Synthesis)** — isi faktanya akurat dan lengkap (rata-rata 32,8 evidence + 46,3 observasi per halaman, jauh lebih baik dari uji awal sebelum perbaikan prompt). Dua masalah kualitas yang ditemukan (dangling reference, bbox piksel) tidak merusak isi faktanya, hanya melemahkan ketertelusuran (traceability) — dan keduanya sudah diperbaiki di kode untuk ekstraksi berikutnya.

**Untuk Fase 3 nanti**, saran saya: PCKM synthesis sebaiknya tidak terlalu bergantung pada `evidence_refs` dari dataset 88-halaman ini secara ketat (karena 21,8%-nya putus) — pakai isi `observations`/`sheet_identity` sebagai sumber utama, `evidence[]` sebagai pelengkap kalau ada.

**Tidak ada tindakan lebih lanjut yang saya ambil tanpa izin Anda** — 88 halaman sudah selesai sesuai batas "hanya 1x jalan", 3 bug ditemukan selama proses sudah diperbaiki dan di-commit, data sudah tersimpan permanen di lokal. Menunggu instruksi Anda untuk lanjut ke Fase 3.
