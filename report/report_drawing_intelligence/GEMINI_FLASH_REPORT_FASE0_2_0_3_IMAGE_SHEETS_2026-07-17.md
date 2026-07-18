# GEMINI FLASH REPORT: FASE 0.2 & 0.3 (Image serving & Sheet listing)

**Tanggal:** 2026-07-17

Laporan ini merinci pekerjaan implementasi Fase 0.2 (Ekspos rendering gambar) dan Fase 0.3 (Endpoint daftar sheet proyek) di bawah orkestrasi Sonnet 5 untuk repository PAAX AI.

---

## 1. Apa yang Dibangun (Files & Lines)

Berikut adalah daftar lengkap file dan baris yang ditambahkan atau dimodifikasi:

### Backend Database (services/db)
- **`services/db/src/paax_db/models.py`** [L215-L216](file:///G:/paax-ai-main/services/db/src/paax_db/models.py#L215-L216)
  - Menambahkan kolom `pdf_path = Column(String, nullable=True)` ke model `DemRun`.
- **`services/db/src/paax_db/schemas.py`** [L302](file:///G:/paax-ai-main/services/db/src/paax_db/schemas.py#L302), [L319](file:///G:/paax-ai-main/services/db/src/paax_db/schemas.py#L319), [L346-L352](file:///G:/paax-ai-main/services/db/src/paax_db/schemas.py#L346-L352)
  - Menambahkan `pdf_path: Optional[str] = None` ke skema `DemRunCreate` dan `DemRunResponse`.
  - Menambahkan skema Pydantic `ProjectDemSheetResponse` baru.
- **`services/db/alembic/versions/0014_add_pdf_path_to_dem_runs.py`** (Seluruh File)
  - Membuat naskah migrasi Alembic untuk menambahkan kolom `pdf_path` ke tabel `dem_runs` di PostgreSQL.
- **`services/db/src/paax_db/main.py`** [L468-L501](file:///G:/paax-ai-main/services/db/src/paax_db/main.py#L468-L501)
  - Menambahkan endpoint `GET /projects/{id}/dem/sheets` untuk menampilkan sheet yang terasosiasi dengan suatu proyek, mengambil detail run/page, mengekstrak judul lembar, dan menghasilkan link URL ke gambar.

### Backend Document Intelligence (services/document-intelligence)
- **`services/document-intelligence/app/transcription/db_client.py`** [L40](file:///G:/paax-ai-main/services/document-intelligence/app/transcription/db_client.py#L40), [L51](file:///G:/paax-ai-main/services/document-intelligence/app/transcription/db_client.py#L51), [L86-91](file:///G:/paax-ai-main/services/document-intelligence/app/transcription/db_client.py#L86-L91)
  - Memperluas fungsi `create_run()` agar menerima dan mem-forward `pdf_path` ke DB API.
  - Menambahkan fungsi `get_run(run_id)` untuk menarik detail dari run tertentu (termasuk kolom `pdf_path`).
- **`services/document-intelligence/app/api/dem_routes.py`** [L4-18](file:///G:/paax-ai-main/services/document-intelligence/app/api/dem_routes.py#L4-L18), [L126](file:///G:/paax-ai-main/services/document-intelligence/app/api/dem_routes.py#L126), [L141-155](file:///G:/paax-ai-main/services/document-intelligence/app/api/dem_routes.py#L141-L155), [L198-240](file:///G:/paax-ai-main/services/document-intelligence/app/api/dem_routes.py#L198-L240)
  - **Penyimpanan PDF asli**: Menyimpan stream bytes PDF yang diunggah pengguna ke disk lokal di bawah folder `UPLOAD_DIR` menggunakan format penamaan unik `{document_id}_{filename}` sebelum memulai ekstraksi DEM.
  - **Endpoint Gambar**: Membangun endpoint `GET /drawings/dem/{run_id}/pages/{page_index}/image`.
  - **Caching Gambar**: Hasil render diserialisasi menjadi berkas PNG dan disimpan di disk lokal (`UPLOAD_DIR/cache_{run_id}_{page_index}.png`) agar pemanggilan berikutnya tidak mengulang proses ekstraksi/rendering PDF.

---

## 2. Hasil Pengujian (Angka Pasti)

Seluruh pengujian unit berjalan lancar dengan status hijau 100% (0 failed):

- **`services/document-intelligence` unit tests:**
  - File baru/termodifikasi: [test_dem_routes.py](file:///G:/paax-ai-main/services/document-intelligence/tests/test_dem_routes.py) (Menambahkan 3 test case: `test_get_page_image_not_found`, `test_get_page_image_valid_and_cached`, `test_get_page_image_out_of_bounds`).
  - Total passed: **449 passed** (naik dari baseline 441 passed).
  - Eksekusi: `python -m pytest` berhasil sukses dalam waktu **22.47s** (0 failed, 5 skipped, 2 warnings).

- **`services/db` unit tests:**
  - File termodifikasi: [test_dem_runs.py](file:///G:/paax-ai-main/services/db/tests/test_dem_runs.py) (Menambahkan test case komprehensif `test_list_project_dem_sheets`).
  - Total passed: **65 passed** (naik dari baseline 64 passed).
  - Eksekusi: `python -m pytest` berhasil sukses dalam waktu **23.42s** (0 failed, 1 skipped, 3 warnings).

---

## 3. Keputusan yang Diambil (Mitigasi Ambiguitas)

1. **Penyimpanan Berkas PDF Asli (Tugas A Langkah 1):**
   - PDF disimpan secara permanen di bawah direktori `UPLOAD_DIR` (default: `<temp_dir>/paax_uploads` atau sesuai konfigurasi env var `UPLOAD_DIR`).
   - Format penyimpanan dirancang unik menggunakan nama berkas `{document_id}_{original_filename}` untuk menjamin integritas data dan mencegah bentrokan nama berkas jika berkas dengan nama yang sama diunggah beberapa kali.
   - Lokasi path disimpan di kolom `pdf_path` di dalam tabel database `dem_runs`.

2. **Lokasi Endpoint & Pola Penamaan URL (Tugas B Langkah 1):**
   - Endpoint "daftar sheet untuk proyek X" diputuskan diletakkan di `services/db/src/paax_db/main.py`. Hal ini sejalan dengan letak data persistence dan CRUD `DemRun`/`DemPage` lainnya.
   - Struktur URL dirancang konsisten dengan endpoint proyek lainnya menggunakan format path `/projects/{id}/dem/sheets` (FastAPI route parameter `id`). Ini untuk mempermudah pemetaan parameter ke kelas `RoleChecker` yang memvalidasi otorisasi pengguna (`X-User-Id` / `X-Internal-Key`) secara langsung berdasarkan hak akses proyek.

3. **Format Thumbnail URL:**
   - Thumbnail URL yang dikembalikan dari list sheets menggunakan format URL relatif `/drawings/dem/{run_id}/pages/{page_index}/image` agar dapat diakses secara langsung oleh frontend melalui HTTP proxy ke service document intelligence.

---

## 4. Pekerjaan yang Belum Selesai (Next Steps)

Semua tugas pada Fase 0.2 dan Fase 0.3 yang didelegasikan telah diselesaikan dan diuji sepenuhnya secara lokal. Langkah-langkah berikutnya yang berada di luar cakupan tugas ini adalah:
- Integrasi visual component canvas frontend V2 (`sheet-plan-svg.tsx` / `sheet-gallery.tsx`) untuk memuat gambar dari route `/drawings/dem/{run_id}/pages/{page_index}/image` baru ini.
- Melakukan deployment/migrasi skema database PostgreSQL menggunakan berkas migrasi `0014_add_pdf_path_to_dem_runs.py` yang sudah dibuat.
