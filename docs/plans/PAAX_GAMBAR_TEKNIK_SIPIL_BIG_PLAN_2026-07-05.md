# PAAX — Rencana Besar: Ekstraksi Gambar Kerja Teknik Sipil (2026-07-05)

> Ditulis Claude, 2026-07-05, atas instruksi owner untuk menyusun rencana besar
> ("big scope") setelah fondasi persepsi (Fase 2 P1-P6 + grid-geometri §3.1.1,
> lihat `docs/ai-map/STATE.md`) berhasil menaikkan cakupan PLHUT 0%→33,75%.
> Dokumen ini adalah **living roadmap** — perbarui statusnya seiring fase
> dikerjakan, jangan ditulis ulang dari nol tiap sesi.

---

## 0. Kenapa dokumen ini ada

Owner memberi 2 dokumen referensi nyata (`Downloads/paax_plhut_extraction_
teknik_sipil_hasil akhir.md` dan `Downloads/paax_plhut_extraction_summary
(1).md`) — hasil ekstraksi PDF PLHUT oleh AI lain, jauh lebih matang dari
output PAAX sekarang: terorganisir per **paket pekerjaan teknik sipil**
(substruktur, struktur lantai 1, struktur lantai 2, struktur atap), grid
dengan posisi mm nyata, tiap elemen diikat ke **alamat grid** ("A1", "B3")
atau **notasi offset** ("B-offset_below_1" untuk elemen di luar grid), status
`TERBACA` vs `PERLU REVIEW` tegas, tabel definisi tipe (dimensi/tulangan/mutu)
terikat ke instance di denah.

**PENTING — §0.1 ditegaskan ulang:** PDF PLHUT + kedua dokumen referensi itu
HANYA bahan belajar/validasi ("begini bentuk output yang bagus"), BUKAN
template untuk di-hardcode. Owner eksplisit: pengujian sungguhan nanti akan
memakai gambar-gambar yang sangat berbeda dari PLHUT. Setiap kemampuan baru
WAJIB lolos di **fixture sintetis independen** (label/nilai/tata-letak beda
dari PLHUT) sebelum dianggap selesai — kalau suatu logika HANYA benar di
PLHUT tapi gagal di fixture sintetis, itu **belum selesai**, titik.

## 1. Kondisi sekarang (baseline, sebelum plan ini dikerjakan)

- Pipeline persepsi (`services/document-intelligence/app/perception/`)
  sudah bisa: baca teks vektor + rotasi (P1), gabung fragmen jadi Run (P1),
  kenali grammar notasi struktur — kode tipe/tulangan/dimensi/mutu/level (P2),
  baca tabel bergaris nyata + hitung elemen dari kode (P3), rekonstruksi grid
  dari BUBBLE-AS + GARIS-DIMENSI vektor nyata dengan posisi_mm kumulatif
  (§3.1.1, selesai sesi lalu), validator+metrik+gerbang dasar (P4), adapter
  PaddleOCR raster lazy/opsional belum di-install (P6).
- **Cakupan real PDF PLHUT (15 sheet, agregat): 33,75%** (naik dari 16,24%).
- **YANG BELUM ADA** (persis kesenjangan yang bikin output PAAX kalah jauh
  dari dokumen referensi owner):
  1. Tiap sheet TIDAK diklasifikasi ke paket-pekerjaan (substruktur/struktur
     lantai N/atap) — hanya jenis sheet generik (denah/tabel/detail).
  2. Elemen TIDAK diikat ke alamat grid — field `alamat` masih placeholder
     string statis, bukan hasil hitung posisi nyata.
  3. TIDAK ADA notasi offset untuk elemen di luar grid.
  4. TIDAK ADA konsolidasi lintas-halaman — tiap sheet berdiri sendiri,
     definisi dari tabel tidak diikat ke instance di denah.
  5. TIDAK ADA deteksi simbol grafis — hanya hitung dari label teks.
  6. UI menampilkan istilah teknis mentah (cakupan %, grammar_pass_rate,
     kode gerbang V-01/V-06, unclassified) — tidak ramah pengguna non-teknis.
  7. Proses berjalan sinkron (blocking) — tidak ada job latar belakang.
  8. PaddleOCR belum benar-benar terpasang (baru lolos via mock).

## 2. Visi akhir (definisi "selesai" untuk seluruh inisiatif ini)

User mengunggah PDF gambar kerja APA PUN (bukan cuma PLHUT) → sistem
memprosesnya di latar belakang per halaman → setiap halaman diklasifikasi
(zona/judul/skala) → grid & elemen tiap halaman diekstrak dengan alamat nyata
→ seluruh halaman dikonsolidasi jadi satu pandangan bangunan (registry elemen
lintas-zona + grid tunggal + daftar asumsi/perlu-review) → user melihat
**"Review Gambar"** yang enak dibaca (bahasa teknik sipil, bukan kode
validator) → user menyimpan hasil → engine menjalankan validasi/render/takeoff
→ volume siap dikirim ke Draft RAB. Kode AHSP tetap dipilih user di halaman
RAB sampai mapping AHSP deterministik siap.

## 3. Peta fase (detail teknis lengkap ada di plan-file sesi eksekusi,
`C:\Users\Nothing\.claude\plans\ancient-plotting-biscuit.md` — ringkasan di
sini supaya sesi depan tahu status tanpa baca file di luar repo)

| Fase | Isi | Status |
|---|---|---|
| 0 | Realignment dokumentasi + brain + plan besar ini | 🟢 selesai |
| B | Zone/paket-pekerjaan classifier per sheet (rule-based, keyword judul) | 🟢 selesai — 15/15 sheet PLHUT judul+skala cocok persis |
| C | Label→grid binding + notasi offset (§5 brain-00) — **prioritas tertinggi** | 🟢 selesai — PC1/PC2/PC3 PLHUT cocok persis referensi |
| D | Deteksi simbol grafis (count_simbol) — eksperimental, boleh tunda jujur | 🟡 ditunda jujur — simbol PLHUT terlalu spesifik-drafter |
| E | Konsolidasi lintas-halaman + skema `ConsolidatedExtraction` | 🟢 selesai |
| F | Proses latar belakang (async job, polling status) | 🟢 selesai |
| G | PaddleOCR sungguhan (bukan mock) | 🟡 terpasang & termuat, inferensi gagal native (oneDNN) di mesin ini — degradasi anggun diverifikasi |
| H | UI/UX overhaul (drag-drop, animasi thinking, Review Gambar ramah pengguna) | 🟢 selesai — diverifikasi live browser |
| I | Verifikasi akhir + update STATE.md + prompt commit Codex | 🟢 selesai |
| J | Wiring Review Gambar → validate/render/takeoff → Draft RAB | 🟢 selesai — placeholder disabled dihapus, volume siap masuk Draft RAB |
| J-2 | Navigasi setelah kirim volume ke Draft RAB | 🟢 selesai — setelah kirim sukses muncul tombol "Lihat Draft RAB" ke `/proyek/[projectId]/rab` |
| K | Coverage validator untuk `zone`/`alamat_list`/`alamat_needs_review`/offset | 🟢 selesai — test membuktikan field pipeline baru tidak mengganggu validator lama |
| K-2 | Audit validator multi-sheet realistis (V-02/V-03/V-04) | 🟡 selesai sebagai audit — V-02/V-04 aman; V-03 punya false-positive untuk subset grid sah dan perlu keputusan sebelum logic diubah |
| M | Perbaikan V-03 subset grid multi-sheet | 🟢 selesai sebagai fix pertama — V-03 hanya membandingkan label as yang overlap, tetapi koreksi lanjutan M-2 dibutuhkan karena posisi absolut per sheet tidak global |
| M-2 | Koreksi V-03 posisi relatif antar sheet | 🟢 selesai — V-03 membandingkan jarak relatif terhadap anchor shared; subset dengan anchor independen per halaman lolos, konflik nyata tetap `E-GRID` |
| N | Impor katalog AHSP CK 2026 resmi | 🟡 selesai sebagai impor data — 2.542 item masuk, 10 batch diaudit; coverage harga regional masih rendah karena HSD resmi belum tersedia |

Legenda: 🟢 selesai · 🟡 sebagian/ditunda jujur · ⚪ belum mulai.

**Hasil akhir (2026-07-05 malam)**: 412 test hijau (core-engine 238 + document-
intelligence 131 + web 43), 0 regresi. Cakupan real PLHUT 33,75%→36,11%.
Detail lengkap per fase: `docs/ai-map/STATE.md`.

## 4. Prinsip yang tidak boleh dilanggar sepanjang eksekusi

1. **Aturan Emas (CLAUDE.md §1)**: zone classifier, grid-binding, konsolidasi
   = KLASIFIKASI/STRUKTURISASI persepsi, BUKAN perhitungan RAB. Tidak ada
   angka biaya yang muncul di sini. RAB tetap 100% dari `services/core-engine`.
2. **§0.1 fixture bukan template**: PLHUT = kunci uji, bukan sumber logika.
   Tiap fase WAJIB fixture sintetis independen sebelum dianggap general.
3. **Tidak menebak diam-diam**: binding/zone/offset yang tidak yakin → masuk
   assumption/needs_review (pola `AssumptionSchema` di `packages/schemas`),
   bukan dipaksakan jadi angka pasti.
4. **Output template konsisten** (feedback owner eksplisit): hasil konsolidasi
   berupa skema Pydantic tetap (field selalu ada, meski null/kosong) — bukan
   dict bebas bentuk yang berubah tergantung isi gambar tertentu.
5. **Tidak commit** — Claude hanya bekerja di working tree; Codex yang commit
   (prompt disiapkan di Fase I).

## 5. Setelah rencana ini (di luar cakupan sesi ini, dicatat sbg arah)

- Mapping AHSP otomatis/deterministik untuk item takeoff (`/ahsp/search` dan
  `/ahsp/map`) masih tahap berikutnya. Saat ini volume sudah bisa masuk Draft
  RAB, tetapi `ahsp_code` sengaja kosong agar user memilih item AHSP manual.
  Setelah Fase N, katalog AHSP resmi sudah jauh lebih lengkap (2.542 item),
  tetapi auto-suggest tetap perlu prompt/test terpisah karena laporan batch
  masih punya temuan mekanis dan coverage harga regional masih rendah.
- Visi-LLM sebagai fallback KHUSUS sheet raster tanpa teks vektor (setelah
  OCR jadi lapis pertama, bukan pengganti) — sudah dicatat sbg arah di
  `docs/ai-map/STATE.md` sebelumnya, tidak berubah.
- HSD regional untuk katalog AHSP CK 2026 belum tersedia. `_resources_catalog`
  di `G:\paax-data` hanya master resource dengan `price=0`, sehingga sengaja
  tidak diimpor sebagai price book agar tidak menghasilkan HSP palsu.
