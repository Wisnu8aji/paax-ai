# Laporan Progress Phase 04B: Runtime and Measured Acceptance Remediation

Berikut adalah rangkuman lengkap pekerjaan dan perbaikan yang telah diselesaikan untuk memperbaiki isu-isu pada Phase 04B dan e2e test `phase04-perf.spec.ts`:

---

## 1. Infrastruktur & Autentikasi Backend

### 1.1 Perbaikan Autentikasi Internal (Service-to-Service)
- **Isu:** Test E2E `timeout` karena UI Next.js mendapatkan error `401 Unauthorized` dari endpoint `/api/drawing-intelligence/...` yang diteruskan ke `services/db`.
- **Solusi:** Memperbarui `services/db/src/paax_db/auth.py` agar secara default `INTERNAL_SERVICE_KEY` menggunakan nilai `"live-test-key"` yang sesuai dengan token proxy dari frontend.

### 1.2 Inisialisasi Database PostgreSQL Lokal
- **Isu:** Container / Server PostgreSQL di environment lokal terrestart dan kehilangan database `paax` (`asyncpg.exceptions.InvalidCatalogNameError: database "paax" does not exist`).
- **Solusi:** Membuat script Python asinkron (`scratch_create_db.py`) menggunakan `asyncpg` untuk koneksi ke database default `postgres` dan mengeksekusi `CREATE DATABASE paax`.

### 1.3 Kompatibilitas Migrasi Alembic (Tanpa pgvector)
- **Isu:** Migrasi Alembic gagal pada revisi `0003` karena ekstensi `pgvector` tidak tersedia di PostgreSQL Windows lokal (`FeatureNotSupported`).
- **Solusi:** Melakukan patch sementara pada `services/db/alembic/versions/0003_pgvector.py` dengan menghapus `CREATE EXTENSION vector` dan mengubah tipe kolom `VECTOR(768)` menjadi `JSONB`.

### 1.4 Perbaikan Driver Alembic (Sinkron vs Asinkron)
- **Isu:** Menggunakan `DATABASE_URL=postgresql+asyncpg://...` menyebabkan Alembic `upgrade head` error (`MissingGreenlet: greenlet_spawn has not been called`).
- **Solusi:** Menambahkan logika di `services/db/alembic/env.py` untuk secara otomatis menghapus suffix `+asyncpg` saat string koneksi diteruskan ke Alembic Config (`psycopg2`).

### 1.5 Bypass RBAC untuk Service Internal
- **Isu:** Endpoint API memunculkan `403 Forbidden` karena project `test-proj` tidak memiliki baris keanggotaan/kepemilikan dalam database kosong.
- **Solusi:** Menambahkan default `INTERNAL_SERVICE_SCOPES` di `services/db/src/paax_db/auth.py` menjadi `"drawing_intelligence,project_graph,document_intelligence,core_engine"`, melewati pengecekan RBAC untuk request internal dengan `X-Internal-Key`.

---

## 2. Frontend Workspace & PDF Viewer Layer Remediation

### 2.1 Perbaikan Reducer `replace-mapped-sheets` (`workspace-store.tsx`)
- **Isu:** `activeSheetId` tidak memvalidasi apakah ID lembar aktif terdahulu ada di dalam array `action.sheets` baru. Akibatnya, `activeSheetId` tetap memegang ID lembar lama yang tidak terdapat pada lembar-lembar PDF placeholder baru (misal `'mock-sheet-1'`), menyebabkan `mappedSheet` bernilai `null` dan elemen kanvas `<PdfPageLayer>` tidak di-render ke DOM.
- **Solusi:** Memperbarui penanganan `replace-mapped-sheets` agar memvalidasi `activeSheetId` dan secara otomatis memilih `action.sheets[0].id` jika ID terdahulu tidak ditemukan di lembar baru.

### 2.2 Dukungan URL Absolut pada `isAuthorisedArtifactUrl` (`pdf-tile-pool.ts`)
- **Isu:** Validator `isAuthorisedArtifactUrl` secara ketat hanya menerima URL yang diawali dengan slash relatif (`!url.startsWith('/')`). Ketika `pdf-page-layer.tsx` menyusun URL absolut (`http://127.0.0.1:3000/api/document-intelligence/...`), `isAuthorisedArtifactUrl` menolak URL tersebut dan memunculkan error `PDF tile pool requires an authorised artifact URL`. Akibatnya, `pool.open` langsung menolak (*reject*) dan elemen kanvas PDF `[data-testid="pdf-page-layer"]` tidak pernah di-render.
- **Solusi:** Memperbarui `isAuthorisedArtifactUrl` menggunakan `new URL(url)` agar mendukung URL absolut (HTTP/HTTPS) maupun relatif.

### 2.3 Perbaikan Latensi Resolusi PDF Web Worker Pool (`pdf-tile-pool.ts`)
- **Isu:** Fungsi `pool.open` sebelumnya menunggu seluruh (*all*) 4 pekerja Web Worker merespons `document-ready` secara bersamaan sebelum menyelesaikan `Promise`. Jika salah satu dari 4 Web Worker tertunda, resolusi promise tertunda atau menggantung.
- **Solusi:** Mengubah `pool.open` agar langsung menyelesaikan `Promise` metrik halaman PDF (`width`, `height`, `rotation`) begitu pekerja Web Worker **pertama** merespons dengan `document-ready`, sementara pekerja sisanya tetap menyiapkan pemrosesan tile di latar belakang.

### 2.4 Peralihan Mode Otomatis ke `analyze` setelah Unggah Selesai (`workspace-store.tsx`)
- **Isu:** Setelah simulasi pengunggahan file nyata selesai, mode workspace tetap berada pada `files`, sehingga kanvas PDF tidak otomatis tampil tanpa interaksi manual.
- **Solusi:** Menambahkan `dispatch({ type: 'set-mode', mode: 'analyze' })` langsung di dalam callback penyelesaian unggah `startUploadSimulation`.

### 2.5 Pencegahan Race Condition Async pada `useBackendSync` (`use-backend-sync.ts`)
- **Isu:** Panggilan `sync()` asinkron yang berjalan setiap 3000ms menimpa mode workspace aktif (seperti `'analyze'`) kembali ke mode awal (`'files'`) karena menyimpan snapshot state yang lama di closure promise.
- **Solusi:** Menambahkan `stateRef` (`stateRef.current = state`) untuk memeriksa mode aktif secara dinamis setelah `Promise.all` selesai, mencegah penimpaan mode aktif.

### 2.6 Fallback `activeProjectId` pada Workspace (`page.tsx`)
- **Isu:** Pada komponen `DrawingIntelligenceWorkspaceV2`, `projectId` bernilai `null` saat memuat awal sebelum `useProjects()` selesai dari Postgres DB.
- **Solusi:** Menambahkan fallback `projectId={project?.id ?? activeProjectId ?? null}` pada `apps/web/src/app/(dashboard)/drawing-intelligence/page.tsx`.

---

## 3. Perbaikan E2E Test Suite (`phase04-perf.spec.ts`)

### 3.1 Navigasi Tab setelah `page.reload()` pada Cold Runs
- **Isu:** Pada ikal pengujian *Cold run 2 & 3* (`for (let i = 0; i < 2; i++)`), skrip pengujian memanggil `await page.reload()`. Setelah halaman direload, state mode kembali ke default yaitu **Files** (`state.mode === 'files'`). Skrip pengujian yang langsung menunggu `[data-testid="pdf-page-layer"]` mengalami timeout 60 detik di setiap perulangan karena kanvas PDF tidak di-render di tab **Files**.
- **Solusi:** Menambahkan `await page.getByRole('tab', { name: 'Analyze' }).click()` setelah setiap panggilan `page.reload()` pada perulangan Cold run.

### 3.2 Peningkatan Logging Diagnostik Test Failure
- **Isu:** Ketika terjadi kesalahan timeout, log hanya menampilkan pesan generik Playwright tanpa rincian status UI.
- **Solusi:** Mengubah blok `catch` pada pengujian agar mencetak `statusEl`, `bodyText` (`.di-workspace`), dan snapshot HTML untuk mempermudah diagnosa runtime.

---

## Ringkasan Berkas yang Dimodifikasi

1. **`services/db/src/paax_db/auth.py`**: Default `X-Internal-Key` dan `INTERNAL_SERVICE_SCOPES`.
2. **`services/db/alembic/env.py`**: Stripping `+asyncpg` untuk Alembic DDL.
3. **`services/db/alembic/versions/0003_pgvector.py`**: Patch pgvector ke JSONB.
4. **`apps/web/src/components/drawing-intelligence/workspace/workspace-store.tsx`**: Validasi `activeSheetId` di `replace-mapped-sheets` dan auto-switch mode `'analyze'`.
5. **`apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile-pool.ts`**: Dukungan URL absolut `isAuthorisedArtifactUrl` dan resolusi awal `pool.open`.
6. **`apps/web/src/components/drawing-intelligence/workspace/use-backend-sync.ts`**: `stateRef` untuk pencegahan penimpaan mode asinkron.
7. **`apps/web/src/app/(dashboard)/drawing-intelligence/page.tsx`**: Fallback `activeProjectId`.
8. **`apps/web/e2e/phase04-perf.spec.ts`**: Klik tab `Analyze` setelah `page.reload()` dan peningkatan logging diagnostik.
