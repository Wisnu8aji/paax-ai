# Master Feedback — Remediasi Khusus PDF Review/Analyze & Gambar Asli Sheets

**Repository:** `G:\paax-ai-contextual-integration`  
**Branch:** `codex/pdf-artifact-viewer-remediation`  
**Base Commit:** `804eaa75`  
**Status:** `COMPLETED` & `VERIFIED`

---

## 1. Ringkasan Eksekutif

Proses remediasi PDF Review/Analyze, Artifact Storage/Signing, dan Gambar Asli pada mode Sheets telah diselesaikan secara lengkap dengan prinsip **Zero Data Loss**, **Fail-Closed Security**, dan **Strict Golden Rule Alignment**.

Seluruh temuan masalah dasar (HTTP 500 pada artifact-url, HTTP 403 pada page image/thumbnail, `reference://` artifact key invalid, 5-page truncation pada bootstrap, dan ilustrasi sintetis `SheetPlanSvg elements=[]` pada gallery) telah diremediasi secara total dan diverifikasi melalui test suite otomatis (195 Vitest tests + pytest suite).

---

## 2. Rincian Perbaikan Berdasarkan Target Task

### Target A: Otorisasi Artifact Service-to-Service & Error Translation
1. **Pemisahan Service Scope vs Human RBAC pada Services/DB:**
   - Endpoint `/internal/projects/{id}/artifact-access` sekarang diverifikasi menggunakan `RoleChecker(["estimator", "pm", "lapangan", "owner"], service_scope="dem:read")`. Service `document-intelligence` yang mengirim `X-Internal-Key` dengan scope `dem:read` berhasil diotorisasi.
   - Endpoint `/internal/projects/{id}/artifact-delete-access` menggunakan `RoleChecker(["owner"], service_scope="dem:delete")`.
   - Endpoint `/internal/authorize-actor` mendukung verifikasi peran `required_role="owner"` untuk aksi penghapusan artifact.
2. **Koreksi HTTP Transport Client pada Document Intelligence:**
   - Transaksi internal `authorize_artifact` pada `DemDbClient` (`services/document-intelligence/app/transcription/db_client.py`) kini menggunakan transport identity resmi `self._client()`, bukan instansiasi `httpx.AsyncClient` manual yang menyuntikkan `X-User-Id` manusia secara keliru.
3. **Preservasi HTTP Status Code (Anti HTTP 500 Swallowing):**
   - Helper `_authorized_run_pdf`, `issue_artifact_url`, dan `delete_artifact` pada `services/document-intelligence/app/api/dem_routes.py` menangkap `httpx.HTTPStatusError` secara presisi dan meneruskan status code asli (401, 403, 404, 410, 503) dengan detail pesan yang jujur. `HTTPStatusError` tidak pernah berubah menjadi unhandled HTTP 500.

---

### Target B: Unifikasi Canonical Artifact Key & Reparasi Reference PLHUT
1. **Unifikasi Object Key Portable:**
   - Seluruh object key dipastikan menggunakan format relatif portable `original-pdf/runs/{run_id}` (kembalian dari `ArtifactStore.put`).
   - Karakter `:` yang terlarang oleh `LocalArtifactStore._safe_key()` (seperti `reference://...`) telah dieliminasi total.
2. **Idempotent Database Repair:**
   - Fungsi `reference_bootstrap.py` pada DB service secara otomatis dan idempotently memigrasikan `artifact_key` untuk run acuan PLHUT `514fb7f2-26fd-5816-9f22-a4a2412688bf` dari `reference://plhut-surakarta-2024` menjadi `original-pdf/runs/514fb7f2-26fd-5816-9f22-a4a2412688bf` tanpa mengubah atau menghapus data pengguna lain.
3. **Bootstrap Full 88 Halaman PLHUT:**
   - Script `scripts/live_test/bootstrap_plhut_artifacts.py` kini membaca PDF langsung dari fixture repository `fixtures/plhut/GAMBAR KERJA PLHUT SURAKARTA (1).pdf` (tidak bergantung pada path lokal `G:\paax-data`).
   - Validasi SHA-256 (`bf582e74951312cc6ccd305c2d48772ca27e7ffdf5b0fb1a0ef7104c19e9eb68`) dan jumlah 88 halaman dipastikan sebelum analisis. Pemotongan 5 halaman (`max_pages=5`) telah dihapus; seluruh 88 halaman dimasukkan ke `package-analysis.json`.

---

### Target C: Portable Signing Secret
1. **Kredensial Persisten Terisolasi:**
   - Script startup `scripts/portable/Start-PLHUT-Local.ps1` secara otomatis menggenerasi file `artifact-signing.key` di direktori runtime `service-credentials/` menggunakan acak kriptografik ([GUID] x2) jika belum ada.
   - ACL divalidasi dan dipaksa `user-only` melalui `Set-UserOnlyFileAcl`.
2. **Standard Memory-Only Injection:**
   - Raw secret disuntikkan sebagai `ARTIFACT_SIGNING_SECRET` hanya ke environment block memori proses `document-intelligence`.
   - Secret tidak pernah dicetak ke stdout/log maupun disimpan di manifest publik (`runtime-manifest.json`). Jika secret hilang atau tidak aman, startup langsung fail-closed.

---

### Target D: Gambar Asli Sheet Gallery & Performa
1. **Official Thumbnail Endpoint Mapping:**
   - Endpoint DB `list_project_dem_sheets` (`services/db/src/paax_db/main.py`) memperbarui `thumbnail_url` menunjuk ke endpoint thumbnail 320px resmi:
     `/drawings/dem/{run_id}/pages/{page_index}/thumbnail?width=320`
2. **Galeri Sheet Real Thumbnail & Error State:**
   - Component `SheetGallery` (`apps/web/src/components/drawing-intelligence/workspace/navigator/sheet-gallery.tsx`) mengganti ilustrasi sintetis `SheetPlanSvg elements=[]` dengan tag `<img loading="lazy" decoding="async" ... />` yang mengonsumsi real thumbnail.
   - Jika thumbnail gagal dimuat, UI menampilkan pesan error jujur ("Gambar sheet tidak dapat dimuat") dan menyediakan tombol "Coba lagi" (retry), tanpa merender ilustrasi palsu.
3. **Next.js Proxy Handler:**
   - Proxied route `apps/web/src/app/api/document-intelligence/[...path]/route.ts` kini mengekspor handler `DELETE` serta menangani header `Range`, `If-Range`, dan `If-None-Match` secara transparan.

---

## 3. Matriks Verifikasi & Pengujian

| Komponen / Test Suite | Hasil | Keterangan |
| :--- | :---: | :--- |
| **Document Intelligence Pytest** | `PASSED` | Unit & integration test otorisasi artifact, signing, & range streaming (`test_pdf_artifact_remediation.py`). |
| **PAAX DB Pytest** | `PASSED` | Test reparasi idempotent key reference PLHUT & RoleChecker service scope. |
| **Frontend Vitest Suite** | `195 PASSED` | Seluruh 29 file test (195 unit test) lulus 100%, termasuk `sheet-gallery.test.tsx`. |
| **Next.js Production Build** | `SUCCESS` | `pnpm --dir apps/web build` berhasil membuat bundle produksi tanpa error TypeScript / Linter. |

---

## 4. Rencana Langkah Selanjutnya (PR & Merge)

1. Branch `codex/pdf-artifact-viewer-remediation` siap disubmit sebagai Pull Request.
2. Tidak ada database yang dihapus, tidak ada data dummy yang dibuat, dan tidak ada kalkulasi RAB/kuantitas yang diubah oleh AI.
