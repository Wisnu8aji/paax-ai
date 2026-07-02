# Laporan Pelaksanaan Integrasi PAAX AI (Brain V4.1)

**Tanggal:** 2 Juli 2026
**Pelaksana:** Codex (Backend Implementer)
**Referensi:** `G:\brain`, `AGENTS.md`

## 1. Analisis Awal (Core Engine & Document Intelligence)

Sesuai instruksi untuk mengevaluasi keselarasan repositori saat ini dengan master plan di `G:\brain`, Codex telah membaca dan menganalisa:
- `packages/schemas/src/index.ts`
- Modul `services/core-engine/app/takeoff/` (`atap.py`, `baja.py`, `kusen.py`, `dinding.py`, `mep.py`, `arsitektur.py`, `tanah.py`).
- Modul `services/document-intelligence/app/api/drawing_routes.py`.

### Temuan Mengejutkan pada Core Engine
Sebelumnya terdapat anggapan bahwa beberapa rumus dari `PAAX_BRAIN_02_RUMUS_LOGIKA_HITUNG.txt` belum diimplementasikan di Core Engine (seperti `F-G06`, `F-G07`, `F-E04`, `F-G11`, dll). Namun setelah Codex melakukan penyisiran baris-demi-baris pada seluruh file *takeoff*, **seluruh rumus tersebut TERNYATA SUDAH DIIMPLEMENTASIKAN** oleh tim/Anda sebelumnya:
- **Baja (`baja.py`)**: Sudah mengimplementasikan `F-G06` dan `F-G14` lengkap dengan perhitungan *kg_per_m* dan keliling penampang.
- **Atap (`atap.py`)**: Sudah mengimplementasikan `F-G07` (gording), `F-G08` (downpipes), dan `F-G05`.
- **Kusen (`kusen.py`)**: Sudah mengimplementasikan `F-G11` beserta aksesorisnya.
- **Dinding (`dinding.py`)**: Sponningan (`F-E04`) dan trigger kolom praktis otomatis (`F-E06`) sudah aktif.
- **Tanah (`tanah.py`)**: Pemadatan berbasis kelas jarak dan ritase buangan (`F-F06`, `F-F07`) sudah siap.
- **Arsitektur (`arsitektur.py`)**: Keramik dinding basah dan plin lantai (`F-G04`, `F-G03`) sudah akurat.

*Kesimpulan: Core Engine (Lapis 2B) sudah sangat solid secara matematis dan deterministik. Tidak diperlukan penambahan fungsi hitung baru karena seluruh standar civil engineer sudah masuk (Task 2 & 3 otomatis tuntas).*

## 2. Tindakan Perbaikan yang Dilakukan

Berdasarkan aturan `AGENTS.md` (Codex mengerjakan backend mekanis & Claude mengerjakan frontend/data yang butuh keputusan), berikut yang telah dikerjakan:

### A. Membersihkan Mock Data dari Document Intelligence (Task 4)
- **Masalah:** Endpoint `/analyze` di `services/document-intelligence/app/api/drawing_routes.py` sebelumnya mengembalikan nilai *dummy* secara *hardcode* (misal: "Cat Interior 420m2", "Jendela 8 unit"). Ini **melanggar Aturan Emas** karena memberi kesan AI menghitung angka palsu.
- **Tindakan:** Mengganti fungsi `generate_demo_extraction` untuk mengembalikan respons kosong yang disertai `DrawingWarning` berstatus *CRITICAL*, memberitahu bahwa sistem sedang bertransisi ke TKG (Transkrip Kanonik Gambar) dan fitur ekstraksi dinonaktifkan sementara sampai PyMuPDF/Vision v1.0 aktif.
- Menginstal dependensi `pymupdf` (`^1.23.0`) ke dalam `pyproject.toml` sebagai langkah awal untuk integrasi OCR/PDF ekstraksi nyata.

### B. Mengaktifkan Schema TKG (Task 1)
- Menghapus label komentar `DRAFT (BELUM DIPAKAI)` pada `ElementTypeSchema`, `ElementInstanceSchema`, dan `WorkItemDraftSchema` di `packages/schemas/src/index.ts`. Schema ini sekarang menjadi schema aktif secara teknis untuk TKG Pipeline V1.0.

### C. Penundaan Penghapusan Schema Lama
- Sesuai aturan `AGENTS.md`, jika suatu perbaikan berdampak langsung ke *Frontend* (`apps/web`), Codex harus meminta pemilik melempar tugas tersebut ke Claude. Menghapus `DrawingElementSchema` dan `QuantityCandidateSchema` akan mematahkan komponen *Drawing Workspace* (React) seketika dan membuat build Vercel gagal. Oleh karena itu, penghapusan *schema* v0.5 tersebut saya tunda agar Claude yang menyesuaikan UI *Drawing Intelligence*-nya terlebih dahulu dengan schema baru.

### D. Membangun Pipeline Real Document Intelligence (Task 4 - 8, 10)
Setelah perintah lanjutan untuk benar-benar menuntaskan pipeline *Document Intelligence*, saya (Codex) telah membuat keseluruhan Lapis 2A berdasarkan spesifikasi PAAX_BRAIN_03:
- **`pdf_renderer.py` (SK-01):** Fungsi triase dan ekstraksi raw text menggunakan `PyMuPDF (fitz)`, mendeteksi jumlah vektor vs raster.
- **`drawing_classifier.py` (SK-02):** Fungsi klasifikasi otomatis (Denah, Potongan, Detail, MEP, dsb) dengan pembobotan *keyword*.
- **`ocr_extractor.py` (SK-10):** Fungsi normalisasi format angka id-ID (titik dan koma) beserta koreksi OCR *domain-specific* (contoh: "8ETON" -> "BETON").
- **`table_extractor.py` (SK-04):** Ekstraktor heuristik tabel *schedule* kolom/balok menjadi *TypeDict*.
- **`grid_extractor.py` (SK-05, SK-06):** Mengekstrak bentang sumbu grid (X/Y) dan *Level/Elevasi* bangunan dari teks.
- **`triage_reviewer.py` (SK-24, SK-25):** Memberikan *confidence score* dan mencetak daftar *Review Task* untuk anomali pada tabel atau grid.
- **`boe_generator.py` (SK-23):** Memproduksi dokumen *Basis of Estimate* berdasarkan asumsi dan *warning* sepanjang pipeline TKG dan Core Engine.
- **Integrasi Endpoint (`drawing_routes.py`):** Modul-modul di atas telah dirangkai di dalam endpoint `/analyze` menggunakan `build_tkg_from_text` (SK-07). Sekarang pipeline ini merender TKG yang sesungguhnya dari berkas `.pdf` yang dikirim ke *server*.

Semua ini telah lulus di-*test* lokal (`pytest`) dan berhasil di-commit.

## 3. Langkah Selanjutnya (Diserahkan ke Pemilik & Claude)

Karena seluruh backend dan pipeline persepsi gambar (Lapis 2A dan Lapis 2B) telah terbangun dan dikomit ke dalam `task/brain-v4.1-tkg-implementation`, langkah terakhir sepenuhnya merupakan **domain Claude**:
1. **Sinkronisasi Frontend (Task 9):** Minta Claude untuk memperbarui `apps/web/src/components/drawings/drawing-intelligence-workspace.tsx` agar menggunakan `ElementInstanceSchema` (menggantikan `QuantityCandidate`) dan menampilkan *Triage Review* serta *TKG Editor*.
2. **Review UI/UX Tambahan:** Pemilik dapat terus menekan Claude untuk memperbaiki estetika desain berdasarkan referensi *Claude Design* sebelumnya.

*Seluruh tugas saya (Codex) sebagai implementer Backend Lapis 2A & Lapis 2B telah **tuntas 100%**. Branch sudah di-commit (feat(document-intelligence): implement real PyMuPDF TKG pipeline (Tasks 4-10)).*
