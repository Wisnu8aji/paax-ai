# PAAX Site Agent

FastAPI service (port 8085) — laporan harian lapangan + perbandingan
rencana-vs-realisasi (deviasi progres). Scaffold (R14), bukan implementasi
penuh v2.0 dari `docs/MASTER_PLAN.md` §9-10 (foto disimpan sebagai referensi
saja, analisa AI atas foto belum dibangun).

## Endpoint (`app/main.py`)

| Path | Fungsi |
| --- | --- |
| `GET /healthz` | Status service |
| `POST /site-logs` | Simpan log progres harian |
| `GET /site-logs` | Daftar log |
| `GET /site-logs/{project_id}/deviation` | Deviasi rencana vs realisasi (`ON_TRACK_THRESHOLD_PCT = 2.0`) — coba ambil RAB nyata dari `services/db` + Kurva S dari `services/core-engine` (`/schedule/s-curve`), fallback ke estimasi linear kalau service itu tidak tersedia |

## Menjalankan lokal

```bash
cd services/site-agent
pip install -e .
uvicorn app.main:app --port 8085
```

Env: `CORE_ENGINE_URL` (default `http://127.0.0.1:8081`), `DB_API_URL` (default
`http://127.0.0.1:8084`), `INTERNAL_SERVICE_KEY`.

## Test

```bash
python -m pytest -q
# 2026-07-10: 17 passed
```

## Batasan jujur

Scaffold modest (`app/main.py` ~243 baris, `app/store.py` sebagian in-memory) —
belum integrasi penuh ke DB produksi. `apps/web` punya halaman
`proyek/[projectId]/site-agent` tapi belum diverifikasi memanggil service ini
end-to-end.
