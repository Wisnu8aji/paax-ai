# REPORT_TASKR2_JOB_STORE_PERSISTEN_CODEX_2026-07-07.md

## 1. Skema SQLite Final
```sql
CREATE TABLE IF NOT EXISTS analyze_jobs (
    job_id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    progress_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    result_json TEXT,
    error TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    request_json TEXT
)
```

## 2. Keputusan Desain
- **`request_json`**: Kolom ini ditambahkan ke skema SQLite dan diisi saat pemanggilan `create()`. Serialization dilakukan dengan `req.model_dump_json()`. Saat endpoint `/analyze/retry/{job_id}` dipanggil, data JSON dibaca, divalidasi balik ke objek `DrawingAnalyzeRequest`, lalu diteruskan ke `_run_analyze_job`. Ini memungkinkan endpoint untuk mereschedule job tanpa harus mengubah payload client.
- **Penempatan Model `AnalyzeJobStatus`**: Model `AnalyzeJobStatus` dan `DrawingAnalysisResponse` **tetap berada di `app/api/drawing_routes.py`**. Tidak ada model yang dipindahkan ke modul netral, melainkan impor model-model ini dilakukan secara lokal (local import) di dalam metode `JobStore.get()` di `app/jobs/store.py` untuk menghindari circular dependency. Ini menjaga perubahan seminimal mungkin.

## 3. Bukti Test Simulasi-Restart Lulus
Fungsi `test_job_store_restart_simulation` di `tests/test_jobs_store.py` mensimulasikan proses restart dengan melakukan instantiation ulang `JobStore` pada file DB yang sama:
```python
def test_job_store_restart_simulation(tmp_db_path):
    # Simulate first process
    store1 = JobStore(tmp_db_path)
    job_id = str(uuid.uuid4())
    store1.create(job_id)
    
    # Fake result
    result = DrawingAnalysisResponse(...)
    store1.update(job_id, status="COMPLETED", result=result)
    
    # Simulate restart
    store2 = JobStore(tmp_db_path)
    job = store2.get(job_id)
    
    assert job is not None
    assert job.status == "COMPLETED"
    assert job.result is not None
    assert job.result.classification == "Plan"
```
Test ini berhasil *passed* saat dijalankan.

## 4. Hasil Test Lengkap (Before/After)
- **Before**: 272 passed, 5 skipped (Baseline)
- **After**: 281 passed, 5 skipped (Menambahkan test suite untuk `JobStore` dan integration endpoint di `tests/test_jobs_store.py`). Tidak ada regresi di test lain.
```text
======================= 281 passed, 5 skipped, 1 warning in 10.63s =======================
```

## 5. Daftar Commit & Link PR
- Branch `feat/job-store-persisten`
- Commit: `feat(document-intelligence): implement persistent job store and retry/cleanup endpoints (Task R2)`
- PR dibuat as Draft sesuai aturan.

## 6. Konfirmasi Kontrak Endpoint Lama
Kontrak `AnalyzeJobStatus` tidak berubah untuk field lama. Model tidak dikurangi atribut apa pun, sehingga tidak ada *breaking change* bagi klien (termasuk `ai-orchestrator`). Perubahan internal hanyalah menggunakan `_job_store.get(job_id)` alih-alih `_ANALYZE_JOBS.get(job_id)`.
```diff
class AnalyzeJobStatus(BaseModel):
    job_id: str
    status: str  # PENDING | PROCESSING | COMPLETED | FAILED
    progress_message: Optional[str] = None
    created_at: str
    updated_at: str
    result: Optional[DrawingAnalysisResponse] = None
    error: Optional[str] = None
```
(Sama persis seperti sebelumnya).
