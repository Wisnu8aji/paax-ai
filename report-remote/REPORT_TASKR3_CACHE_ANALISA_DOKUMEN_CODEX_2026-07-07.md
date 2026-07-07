# REPORT_TASKR3_CACHE_ANALISA_DOKUMEN_CODEX_2026-07-07.md

## 1. Skema `analysis_cache` Final
```sql
CREATE TABLE IF NOT EXISTS analysis_cache (
    cache_key TEXT PRIMARY KEY,
    pdf_hash TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    result_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    hit_count INTEGER NOT NULL DEFAULT 0
)
```

## 2. Nilai `AI_ASSIST_PROMPT_VERSION`
- Nilai: `"2026-07-05.1"`
- Lokasi definisi: `services/document-intelligence/app/perception/ai_assist/__init__.py`

## 3. Bukti Test "Panggilan LLM ke-2 = 0" Lulus
Di dalam `tests/test_analysis_cache.py`, endpoint disimulasikan dua kali. Pemanggilan kedua (`res2`) mendapatkan *cache hit* sehingga pipeline LLM tidak dijalankan (terbukti dengan assertion `fake_ai.call_count` tetap 1).
```python
    # Call 1 -> miss, call_count = 1
    res1 = routes._perform_analysis(req)
    assert fake_ai.call_count == 1
    assert res1.classification == "Plan"
    
    # Call 2 -> hit, call_count = 1
    res2 = routes._perform_analysis(req)
    assert fake_ai.call_count == 1 # LLM not called!
    assert res2.classification == "Plan"
```
Test ini diuji dan berhasil berlalu tanpa fail.

## 4. Hasil Test Lengkap Before/After
- **Before**: 281 passed, 5 skipped (dari test-run sebelumnya di level folder utama), namun setelah penyesuaian CWD menjadi `services/document-intelligence`, test sesungguhnya adalah ~302 passed baseline.
- **After**: 309 passed, 5 skipped.
```text
================= 309 passed, 5 skipped, 2 warnings in 16.62s =================
```

## 5. Daftar Commit & Link PR
- Branch: `feat/cache-analisa-dokumen`
- Commit: `feat(document-intelligence): implement AnalysisCache for drawing routes (Task R3)`
- PR berstatus draft, dibuat dari base branch yang sudah berisi perubahan Task R2.

## 6. Konfirmasi Kill-Switch & Cache-Invalidate
- **Kill-Switch**: Modifikasi environment variable `ANALYSIS_CACHE_ENABLED="0"` (teruji via `test_kill_switch` dan `test_drawing_routes_cache_hits_and_skips_llm`). Saat ini diset, panggilan berikutnya akan mengabaikan cache (return `None` untuk get, no-op untuk put) sehingga memicu panggilan LLM lagi.
- **Cache-Invalidate**: Endpoint `/analyze/cache-invalidate` bekerja dengan membersihkan tabel `analysis_cache` sepenuhnya. Test `test_invalidate_all` berhasil membuktikannya.
