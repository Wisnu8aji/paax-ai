# Laporan Implementasi Endpoint Materialize & Kalkulasi Geometri Deterministik
**Tanggal:** 2026-07-17
**Fase:** 3 (Drawing Intelligence - Quantity Assumptions & Materialize)

## Ringkasan Eksekutif
Implementasi telah selesai untuk proses "Materialize" pada fitur Bridge AI -> RAB di aplikasi PAAX. Proses ini merupakan bagian paling krusial dalam orkestrasi Fase 3, menghubungkan `RabBridgeProposal` yang di-review secara manual dengan `RabDraft` yang akan digunakan untuk kalkulasi akhir, secara ketat mematuhi **Aturan Emas** (AI dilarang menghitung angka secara final, perhitungan wajib bersifat deterministik).

## Detail Implementasi

### 1. Modul Pencocokan AHSP (Tugas A)
- **Lokasi:** `services/core-engine/app/rab/suggest.py`
- **Cara Kerja:** Menerapkan logika token-overlap deterministik menggunakan *Jaccard similarity*.
- Mencocokkan input (`name` + `discipline`) dengan nama-nama item yang ada di katalog AHSP yang di-load oleh `core-engine`.
- Parameter `ahsp_suggested=True` diterapkan pada baris yang dimaterialisasi apabila usulan algoritma ini digunakan.
- Jika tingkat kemiripan (score) berada di bawah ambang batas deterministik (0.45), sistem secara konsisten akan menolak untuk mengusulkan dan memberikan alasan `missing_ahsp_code`.

### 2. Sumber Volume & Kalkulasi Geometri (Tugas B)
- **Lokasi:** `services/core-engine/app/rab/geometry.py`
- **Logika:** Fungsi `compute_volume()` yang generik menerima dimensi dalam bentuk Dictionary (dari `stored_measurement_facts`) atau dari String (dari endpoint `quantity_assumptions` yang baru).
- **Penanganan Teks Asumsi:** Bila PM menyetujui teks seperti "volume 25" atau "2 x 3 x 4", regex deterministik yang ketat mendeteksi seluruh operan angka, lalu mengalikannya atau mengembalikan single value secara mutlak.
- **Metadata Transparansi:** Setiap nilai yang diisi ke RAB membawa field sumber yang sangat spesifik, yaitu `volume_source` yang bernilai `"written_dimension"` (bila bersumber eksplisit dari drawing) atau `"human_assumption"` (bila bersumber dari kuantitas asumsi PM). Field pendukung seperti `evidence_ids` dan `assumption_id` juga disimpan dalam `RabDraftLine`.

### 3. Endpoint Materialize (Tugas C)
- **Lokasi:** `services/db/src/paax_db/main.py`
- **Method & Path:** `POST /projects/{id}/project-graph/rab-bridge/{proposal_id}/materialize`
- **Validasi Ketat:**
  1. Proposal wajib ditemukan dan berstatus `approved` (mengikuti aturan keras D12).
  2. Masing-masing item diperiksa ketersediaan nilai `ahsp_code` dan `volume`. Apabila tidak lengkap, item dikategorikan ke dalam `skipped_items` dengan `reason` seperti `blocked_missing_dimension` atau `missing_ahsp_code`.
- **Integrasi Pydantic & Zod:**
  - `SkippedItem` dan `RabBridgeMaterializeResponse` ditambahkan ke `services/db/src/paax_db/schemas.py`.
  - Sinkronisasi bersamaan dilakukan pada `packages/schemas/src/index.ts` agar Zod seirama.
  - Skema TypeScript `RabDraftLine` di-update (`apps/web/src/lib/projects/rab-repository.ts`) untuk mengakomodir meta parameter volume.
- **Penyimpanan State:** Item yang berhasil dimaterialisasi akan di-append (GET -> append -> PUT) ke payload JSON milik tabel `RabDraft`.

### 4. Test Suite
- **Lokasi:** `services/db/tests/test_rab_materialize.py`
- **Skenario Tercakup:**
  - *Happy Path*: Satu proposal berhasil direalisasikan ke RAB menggunakan `written_dimension` dan satu lagi menggunakan `human_assumption`. Item yang gagal akan masuk `skipped_items`.
  - *Rejected Validation*: Pengujian apabila status proposal adalah `rejected` lalu dimaterialisasi, di mana ia akan dilempar HTTP 400 sesuai aturan PM approval.
- **Hasil:** Seluruh unit test berjalan mulus dan lulus.

## Kesimpulan
Sistem berhasil mengakomodasi aliran AI -> Bridge -> PM (Approval & Quantity Assumptions) -> Materialize -> RAB secara end-to-end tanpa melanggar prinsip kepastian perhitungan (Aturan Emas). Parameter asal (evidence, assumption) tertaut kuat sehingga proses audit berjalan transparan. Kebutuhan Fase 3 tercapai.
