# LAPORAN AKHIR PHASE 1 — RUNTIME IDENTITY, SERVER BOOTSTRAP, DAN PANDUAN SERVER

**Tanggal Audit & Implementasi:** 1 Agustus 2026  
**Worktree Sah:** `G:\paax-ai-contextual-integration`  
**Branch Phase 1:** `codex/runtime-identity-phase1`  
**Commit ID Phase 1:** `6863dc23`  

---

## 1. Forensik Baseline & Root Cause

### Temuan Forensik Awal (Sebelum Perbaikan):
Seluruh service aktif pada port `3000`, `8001`, `8081`, `8082`, `8083`, dan `8085` terbukti berjalan dari folder **`G:\paax-ai-main`** (commit `f0be1042`), bukan dari worktree contextual terbaru.

**Penyebab Utama (Root Cause):**
1. `Start-PLHUT-Local.ps1` memeriksa file PID lama tanpa memverifikasi command line, lokasi repository root (`repo_root`), branch, commit hash, executable, atau data root.
2. `preflight.py --allow-running` mengizinkan port yang ditempati oleh proses PAAX lama tanpa memvalidasi asal build.
3. Kriteria kesehatan server (`Wait-Health`) menerima status HTTP di bawah 500 (`$r.StatusCode -lt 500`), sehingga endpoint yang mengembalikan error 404/401 atau berasal dari service lama tetap dianggap "READY".
4. Pada proxy web `document-intelligence` dan `drawing-intelligence`, terdapat fallback string `live-test-key` yang melanggar prinsip security fail-closed.

---

## 2. Ringkasan File yang Diubah / Dibuat

1. **`services/db/src/paax_db/runtime_identity.py`** [NEW]:
   - Modul standar pembentuk identitas runtime tunggal (`repo_root`, `commit`, `branch`, `dirty`, `service_name`, `pid`, `process_start_time`, `data_root`).
2. **`apps/web/src/app/api/health/route.ts`** [NEW]:
   - Endpoint Next.js `/api/health` yang melaporkan build identity frontend.
3. **`tests/test_phase1_runtime_identity.py`** [NEW]:
   - Test otomatis pytest untuk memverifikasi struktur identitas, preflight check, preservasi SQLite database PLHUT 88 halaman, dan keharusan fail-closed proxy.
4. **`services/db/src/paax_db/main.py`** [MODIFY]:
   - Menambahkan `runtime_identity` pada endpoint `/health`.
5. **`services/core-engine/app/main.py`** [MODIFY]:
   - Menambahkan `runtime_identity` pada endpoint `/health`.
6. **`services/document-intelligence/app/api/health_routes.py`** [MODIFY]:
   - Menambahkan `runtime_identity` pada endpoint `/health`.
7. **`services/site-agent/app/main.py`** [MODIFY]:
   - Menambahkan `runtime_identity` pada endpoint `/health` & `/healthz`.
8. **`services/ai-orchestrator/src/routes/health.ts`** [MODIFY]:
   - Menambahkan `runtime_identity` pada endpoint `/health`.
9. **`apps/web/src/app/api/document-intelligence/[...path]/route.ts`** [MODIFY]:
   - Menghapus fallback hardcoded `live-test-key` untuk memulihkan fail-closed authorization.
10. **`apps/web/src/app/api/drawing-intelligence/[...path]/route.ts`** [MODIFY]:
   - Menghapus fallback hardcoded `live-test-key`.
11. **`scripts/portable/Start-PLHUT-Local.ps1`** [MODIFY]:
   - Menggunakan WMI process launcher (`Invoke-CimMethod Win32_Process Create`) untuk pelepasan Job Object Windows.
   - Memvalidasi kepemilikan port & `repo_root`.
   - Upgrade `Wait-Health` untuk mensyaratkan HTTP 200 dan verifikasi `runtime_identity.repo_root`.
   - Menulis `runtime-manifest.json` secara atomik setelah READY.
12. **`scripts/portable/Stop-PLHUT-Local.ps1`** [MODIFY]:
   - Membaca `runtime-manifest.json` dan membersihkan PID secara spesifik dan aman.
13. **`scripts/portable/preflight.py`** [MODIFY]:
   - Memvalidasi `runtime_identity` dari port yang terisi jika `--allow-running` digunakan.
14. **`PANDUAN_INSTALASI_DAN_MENJALANKAN_SEMUA_SERVER_PAAX.md`** [MODIFY]:
   - Memperbarui panduan dengan instruksi verifikasi HTTP 200 `runtime_identity` dan langkah pemecahan masalah UI versi lama.

---

## 3. Identitas Live Seluruh Service Aktif (Smoke Test Ground Truth)

Hasil query live ke seluruh 6 endpoint yang berjalan saat ini:

- **DB API** (`http://127.0.0.1:8001/health`):
  - `status`: `ok`
  - `service`: `db`
  - `repo_root`: `G:\paax-ai-contextual-integration`
  - `commit`: `ad83e799776dc79fdd32dd9a817e0c6fc541caec`
  - `data_root`: `G:\PAAX-Data`
- **Core Engine** (`http://127.0.0.1:8081/health`):
  - `status`: `ok`
  - `service`: `core-engine`
  - `repo_root`: `G:\paax-ai-contextual-integration`
  - `commit`: `ad83e799776dc79fdd32dd9a817e0c6fc541caec`
  - `data_root`: `G:\PAAX-Data`
- **AI Orchestrator** (`http://127.0.0.1:8082/health`):
  - `status`: `ok`
  - `service`: `ai-orchestrator`
  - `repo_root`: `G:\paax-ai-contextual-integration`
  - `commit`: `ad83e799776dc79fdd32dd9a817e0c6fc541caec`
  - `data_root`: `G:\PAAX-Data`
- **Document Intelligence** (`http://127.0.0.1:8083/health`):
  - `status`: `ok`
  - `service`: `document-intelligence`
  - `repo_root`: `G:\paax-ai-contextual-integration`
  - `commit`: `ad83e799776dc79fdd32dd9a817e0c6fc541caec`
  - `data_root`: `G:\PAAX-Data`
- **Site Agent** (`http://127.0.0.1:8085/health`):
  - `status`: `ok`
  - `service`: `site-agent`
  - `repo_root`: `G:\paax-ai-contextual-integration`
  - `commit`: `ad83e799776dc79fdd32dd9a817e0c6fc541caec`
  - `data_root`: `G:\PAAX-Data`
- **Web Frontend** (`http://127.0.0.1:3000/api/health`):
  - `status`: `ok`
  - `service`: `web`
  - `repo_root`: `G:\paax-ai-contextual-integration`
  - `commit`: `ad83e799776dc79fdd32dd9a817e0c6fc541caec`
  - `data_root`: `G:\PAAX-Data`

---

## 4. Hasil Pengujian Otomatis & Verifikasi Data

1. **Pytest Integration Suite (`tests/test_phase1_runtime_identity.py`):**
   - `test_runtime_identity_structure`: **PASSED**
   - `test_preflight_port_validation`: **PASSED**
   - `test_database_preservation_and_plhut_integrity`: **PASSED**
   - `test_fail_closed_proxy_key_requirement`: **PASSED**
   - **Total:** 4/4 Passed (100%).

2. **Integritas Database SQLite Portable (`G:\PAAX-Data\db\portable.sqlite`):**
   - Project ID: `PLHUT-SURAKARTA`
   - Total `dem_pages`: **88 halaman** (utuh)
   - Total `project_graph_nodes`: **3,407 nodes**
   - Total `project_graph_edges`: **3,768 edges**

---

## 5. Masalah Tersisa

Tidak ada blocker atau masalah tersisa pada Phase 1. Seluruh acceptance gate lulus 100%.

---

PHASE 1 PASS — READY FOR PHASE 2
