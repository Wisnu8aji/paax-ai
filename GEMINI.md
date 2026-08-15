# Audit Site Agent — Gemini

- Pemahaman alur:
`POST /site-logs` menerima `SiteLogInput` dan menyimpannya ke list `_logs` in-memory via `save_log()`. Saat `GET /site-logs/{project_id}/deviation` dipanggil, handler mengambil laporan harian via `get_log_by_date()`, mengambil `planned_progress_pct` (via `_planned_progress_from_services()` / `_estimate_planned_progress()`), lalu menghitung `deviation_pct = actual - planned` untuk menentukan status (`on_track`/`ahead`/`behind`).

- Temuan utama:
Risiko logika / data basi (stale data): `save_log()` selalu menambahkan (`append`) laporan baru ke list tanpa memperbarui entri untuk tanggal yang sama. `get_log_by_date()` melakukan iterasi dari depan dan mengembalikan laporan **pertama** yang ditemukan. Jika pengguna mengunggah revisi/koreksi laporan harian pada tanggal yang sama, `get_deviation` akan selalu mengambil `actual_progress_pct` lama dari entri pertama.

- Bukti:
1. [store.py:24](file:///g:/paax-ai-contextual-integration/services/site-agent/app/store.py#L24): `_logs.setdefault(inp.project_id, []).append(record)`
2. [store.py:41-45](file:///g:/paax-ai-contextual-integration/services/site-agent/app/store.py#L41-L45): `get_log_by_date()` mengembalikan match pertama (`return r`).
3. [main.py:114](file:///g:/paax-ai-contextual-integration/services/site-agent/app/main.py#L114): `log = get_log_by_date(project_id, date)` menggunakan entri pertama tersebut.

- Skenario gagal:
Input:
1. `POST /site-logs` -> `project_id="P1"`, `date="2026-08-01"`, `actual_progress_pct=10.0`
2. `POST /site-logs` (koreksi) -> `project_id="P1"`, `date="2026-08-01"`, `actual_progress_pct=25.0`
3. `GET /site-logs/P1/deviation?date=2026-08-01&planned_day=10&total_days=100`
Output: `actual_progress_pct = 10.0` (seharusnya `25.0`).

- Test verifikasi:
```python
def test_get_log_by_date_returns_latest():
    reset_store()
    save_log(SiteLogInput(project_id="P1", date="2026-08-01", actual_progress_pct=10.0))
    save_log(SiteLogInput(project_id="P1", date="2026-08-01", actual_progress_pct=25.0))
    log = get_log_by_date("P1", "2026-08-01")
    assert log is not None and log.actual_progress_pct == 25.0
```

- Tingkat keyakinan: tinggi
