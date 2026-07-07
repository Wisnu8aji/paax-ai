# PROMPT CODEX — Task R2: Job Store Persisten + Antrian Analisa Gambar

> Ditulis Claude, 2026-07-07, reasoning tinggi. Bagian dari
> `docs/prompts/PAAX_CODEX_ROADMAP_10_TASKS_NON_UI_2026-07-07.md` (Task 2).
> **Mandiri** — tidak butuh Task R1 (arsitektur sisa) selesai dulu, boleh
> dikerjakan di branch baru dari `main` kapan saja.

---

## 0. Konteks — masalah nyata yang harus diperbaiki

`services/document-intelligence/app/api/drawing_routes.py` baris 244-304
punya job store **in-memory** (`_ANALYZE_JOBS: dict[str, AnalyzeJobStatus]`
+ `threading.Lock`) untuk `/drawings/analyze/start` +
`/drawings/analyze/status/{job_id}`. Komentar di kode SENDIRI mengakui
batasan ini (baris 245-248):

```python
# Belum ada job-queue di repo (dikonfirmasi riset rencana besar) — memakai
# FastAPI BackgroundTasks + dict in-memory, selaras kematangan app saat ini
# (belum ada DB proyek sungguhan). BATASAN JUJUR: status job hilang kalau
# service di-restart — cukup utk tahap ini, dicatat bukan disembunyikan.
```

Ini juga dikonfirmasi jujur di `services/ai-orchestrator/README.md`
("Job store document-intelligence masih in-memory, sehingga status job
bisa hilang jika service restart"). Task ini menutup gap itu — job survive
restart, tanpa menambah service/infra baru (Task 6 nanti baru
memperkenalkan Postgres — task ini SENGAJA masih file-based/independen
supaya tidak bergantung pada keputusan itu).

---

## 1. Scope task ini

1. Ganti backing store `_ANALYZE_JOBS` dari `dict` in-memory ke **SQLite
   file** (`sqlite3` stdlib, TANPA dependency baru) — file DB di
   `os.getenv("JOB_STORE_PATH", "<tempdir>/paax_jobs.db")`, pola sama
   `UPLOAD_DIR` yang sudah ada (env-overridable, default lintas-platform).
2. Skema tabel `analyze_jobs`: `job_id TEXT PRIMARY KEY, status TEXT,
   progress_message TEXT, created_at TEXT, updated_at TEXT, result_json
   TEXT, error TEXT, attempts INTEGER DEFAULT 0`.
3. Modul baru `app/jobs/store.py` — `JobStore` class dengan method:
   `create(job_id) -> None`, `update(job_id, **fields) -> None`,
   `get(job_id) -> AnalyzeJobStatus | None`, `list_stale(older_than_minutes:
   int) -> list[str]` (untuk cleanup §4). Semua akses DB lewat satu
   connection per-call (`sqlite3.connect(path)`) + `WAL` mode
   (`PRAGMA journal_mode=WAL`) supaya baca/tulis konkuren aman tanpa lock
   Python tambahan.
4. **Retry otomatis**: kalau job berstatus `FAILED` dan `attempts < 2`,
   endpoint `POST /drawings/analyze/retry/{job_id}` (baru) menjadwalkan
   ulang via `BackgroundTasks`, increment `attempts`. Kalau `attempts >= 2`,
   retry ditolak (`409`) dengan pesan jujur "sudah dicoba 2x, perlu
   investigasi manual" — JANGAN retry tanpa batas.
5. **TTL/cleanup**: job `COMPLETED`/`FAILED` lebih tua dari
   `JOB_RETENTION_MINUTES` (env, default `1440` = 24 jam) dihapus oleh
   endpoint maintenance baru `POST /drawings/analyze/cleanup` (dipanggil
   manual/cron eksternal — JANGAN bikin scheduler in-process baru, itu
   di luar scope task ini).
6. Endpoint lama (`/analyze/start`, `/analyze/status/{job_id}`) TIDAK
   BOLEH berubah kontrak response — hanya ganti backing store di baliknya.
   `ai-orchestrator`'s `analyze_drawing` tool memanggil endpoint ini via
   HTTP, jadi breaking change di sini akan merusak tool itu.
7. Test lengkap (§4) termasuk **simulasi restart**: buat job → matikan
   "koneksi" (buat `JobStore` baru dari file yang sama, seolah proses baru)
   → job masih bisa di-`get()`.

**JANGAN**: menyentuh `apps/web/**`; menambah dependency Python baru
(Celery/Redis/RQ — semua di luar scope, task ini SENGAJA minimal); mengubah
kontrak `AnalyzeJobStatus` (field yang sudah ada harus tetap sama, boleh
menambah field baru seperti `attempts` tapi jangan hapus/ganti nama field
lama karena dibaca `ai-orchestrator`).

---

## 2. Verifikasi SEBELUM implementasi (WAJIB)

Baca persis `services/document-intelligence/app/api/drawing_routes.py`
baris 244-305 (job store lama) — pastikan model `AnalyzeJobStatus` (baris
249-256) dan alur `_run_analyze_job`/`start_analyze_job`/
`get_analyze_job_status` sesuai kutipan di §0/§1 sebelum menulis kode
(file bisa saja sedikit berubah sejak prompt ini ditulis).

Catatan penting: `AnalyzeJobStatus.result` bertipe
`Optional[DrawingAnalysisResponse]` (model Pydantic bersarang, termasuk
`tkg_document`/`consolidated` yang bisa besar). Untuk SQLite, serialisasi
via `result.model_dump_json()` saat simpan, `DrawingAnalysisResponse.model_
validate_json(...)` saat baca — JANGAN pakai `pickle` (tidak portable/rawan).

---

## 3. Implementasi

### 3.1 `app/jobs/store.py` (baru)

```python
import sqlite3
import os
import tempfile
from datetime import datetime, timedelta
from typing import Optional

DEFAULT_PATH = os.path.join(tempfile.gettempdir(), "paax_jobs.db")

class JobStore:
    def __init__(self, path: str | None = None):
        self.path = path or os.getenv("JOB_STORE_PATH", DEFAULT_PATH)
        self._init_schema()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path, timeout=10)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.row_factory = sqlite3.Row
        return conn

    def _init_schema(self) -> None:
        with self._connect() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS analyze_jobs (
                    job_id TEXT PRIMARY KEY,
                    status TEXT NOT NULL,
                    progress_message TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    result_json TEXT,
                    error TEXT,
                    attempts INTEGER NOT NULL DEFAULT 0
                )
            """)

    def create(self, job_id: str) -> None: ...
    def update(self, job_id: str, **fields) -> None: ...
    def get(self, job_id: str) -> Optional["AnalyzeJobStatus"]: ...
    def list_stale(self, older_than_minutes: int) -> list[str]: ...
    def increment_attempts(self, job_id: str) -> int: ...
```

Detail `update`: terima kwargs sembarang (`status`, `progress_message`,
`result` [objek Pydantic — serialize di sini], `error`), bangun
`UPDATE analyze_jobs SET ... WHERE job_id = ?`, selalu set
`updated_at = datetime.now().isoformat()`.

Detail `get`: baca row, kalau `result_json` tidak NULL, deserialize balik
ke `DrawingAnalysisResponse` (import lokal untuk hindari circular import —
`JobStore` di `app/jobs/`, model di `app/api/drawing_routes.py`; kalau
circular jadi masalah, pindahkan `AnalyzeJobStatus`/`DrawingAnalysisResponse`
ke modul netral seperti `app/api/drawing_models.py` dan import dari sana di
kedua tempat — putuskan sendiri mana yang lebih bersih, laporkan pilihanmu).

### 3.2 `drawing_routes.py` — ganti backing store

Ganti `_ANALYZE_JOBS`/`_ANALYZE_JOBS_LOCK` dengan instance `JobStore` module-level
(`_job_store = JobStore()`). `_run_analyze_job`, `start_analyze_job`,
`get_analyze_job_status` panggil method `_job_store.*` alih-alih dict
langsung. Hilangkan `threading.Lock` manual (SQLite+WAL sudah aman untuk
concurrent read, single-writer cukup untuk beban ini).

### 3.3 Endpoint baru

```python
@router.post("/analyze/retry/{job_id}")
async def retry_analyze_job(job_id: str, background_tasks: BackgroundTasks):
    job = _job_store.get(job_id)
    if job is None:
        raise HTTPException(404, "Job tidak ditemukan")
    if job.status != "FAILED":
        raise HTTPException(400, f"Job berstatus {job.status}, hanya job FAILED yang bisa di-retry")
    attempts = _job_store.increment_attempts(job_id)
    if attempts > 2:
        raise HTTPException(409, "Job sudah dicoba 2x, perlu investigasi manual sebelum retry lagi")
    _job_store.update(job_id, status="PENDING", error=None, progress_message="Menunggu diproses ulang...")
    background_tasks.add_task(_run_analyze_job, job_id, <request_tersimpan>)
    return {"job_id": job_id, "status": "PENDING", "attempts": attempts}

@router.post("/analyze/cleanup")
async def cleanup_old_jobs(older_than_minutes: int = None):
    minutes = older_than_minutes or int(os.getenv("JOB_RETENTION_MINUTES", "1440"))
    stale_ids = _job_store.list_stale(minutes)
    for jid in stale_ids:
        _job_store.delete(jid)
    return {"deleted": len(stale_ids), "job_ids": stale_ids}
```

**Masalah desain yang HARUS kamu selesaikan**: `retry` butuh
`DrawingAnalyzeRequest` asli untuk memanggil ulang `_run_analyze_job` —
request itu sekarang TIDAK disimpan sama sekali. Tambahkan kolom
`request_json TEXT` di skema `analyze_jobs`, simpan
`req.model_dump_json()` saat `create()`/`start_analyze_job`, baca balik
saat retry. Catat keputusan ini di report.

---

## 4. Test WAJIB (`tests/test_jobs_store.py`, baru)

- `create` + `get` round-trip: job baru berstatus `PENDING`.
- `update` mengubah field & `updated_at` berubah (bandingkan timestamp).
- **Simulasi restart** (test paling penting): buat `JobStore(path=tmp_path)`,
  `create` + `update(status="COMPLETED", result=<fixture>)`, lalu buat
  `JobStore` BARU dengan `path` yang SAMA (objek Python baru, mensimulasikan
  proses restart) → `get(job_id)` dari instance baru itu HARUS mengembalikan
  data yang sama persis termasuk `result` yang sudah di-deserialize benar.
- `list_stale`: job dengan `updated_at` > N menit lalu (manipulasi langsung
  di DB via SQL utk fixture, bukan lewat waktu asli) muncul di hasil; job
  baru tidak.
- Retry: job `FAILED` bisa di-retry (attempts naik ke 1); retry job yang
  BUKAN `FAILED` → `400`; retry job dengan `attempts` sudah 2 → `409`.
- Cleanup: job stale terhapus, job baru tidak tersentuh.
- Endpoint lama (`/analyze/start` → `/analyze/status/{job_id}`) tetap
  bekerja end-to-end lewat `TestClient` FastAPI (regresi kontrak).

Jalankan SEMUA test document-intelligence setelah selesai (baseline: 272
passed, 5 skipped — laporkan angka before/after).

---

## 5. Laporan WAJIB — `report-remote/`

Nama file baru: `report-remote/REPORT_TASKR2_JOB_STORE_PERSISTEN_CODEX_<tanggal>.md`.
Isi wajib: (1) skema SQLite final (kutip persis), (2) keputusan desain
`request_json` (§3.3) dan alasan penempatan `AnalyzeJobStatus` kalau
dipindah, (3) bukti test simulasi-restart lulus (kutip output), (4) hasil
test lengkap before/after, (5) daftar commit + link PR, (6) konfirmasi
kontrak endpoint lama tidak berubah (diff `AnalyzeJobStatus` response
sebelum/sesudah — harus identik utk field lama).

---

## 6. Pembagian kerja & larangan

- Branch baru dari `main`: `feat/job-store-persisten`.
- Commit tanpa `Co-Authored-By`/signature AI.
- PR draft, JANGAN self-merge.
- JANGAN sentuh `apps/web/**`.
- JANGAN tambah dependency baru (Celery/Redis/dsb) — SQLite stdlib saja.
