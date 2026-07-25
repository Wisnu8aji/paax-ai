# PAAX Database Schema & API

FastAPI service (port 8084) + Alembic migrations untuk PostgreSQL. Menyimpan
data proyek/RAB/TKG server-side, RAG knowledge store (pgvector), audit log
tool-call, usage/metering, dan laporan pagi otomatis.

## API (`src/paax_db/main.py`, auth + RBAC per role via `RoleChecker`)

| Path | Fungsi |
| --- | --- |
| `GET /health` | Status service |
| `GET/POST /projects`, `GET/PUT /projects/{id}` | CRUD proyek |
| `GET/PUT /projects/{id}/rab`, `/tkg` | Snapshot RAB & TKG per proyek |
| `POST /audit/tool-call` | Log panggilan tool dari `ai-orchestrator` |
| `POST /knowledge/index`, `POST /knowledge/search` | RAG — index & cari pengetahuan AHSP/proyek (pgvector cosine, fallback SQLite untuk test) |
| `POST /usage/log`, `GET /usage/summary`, `/usage/anomalies`, `/usage/quota/check` | Metering pemakaian AI (kill-switch `METERING_ENABLED=0`, fail-open saat kuota habis) |
| `POST /reports/morning/{project_id}/generate`, `GET /reports/morning/{project_id}` | Laporan pagi (narasi Gemini + fallback rule-based, anti-halusinasi: angka LLM divalidasi terhadap `metrics_snapshot`) |

## Local Development

Untuk test lokal, `pytest` otomatis fallback ke SQLite async (`aiosqlite`) bila
Postgres tidak terdeteksi — tidak butuh Docker untuk sekadar menjalankan test.

Untuk mode production/nyata pakai PostgreSQL + pgvector:

```bash
docker run --name paax-postgres -e POSTGRES_PASSWORD=secret -e POSTGRES_DB=paax -p 5432:5432 -d postgres:15
export DATABASE_URL="postgresql://postgres:secret@localhost:5432/paax"
cd services/db
alembic upgrade head
uvicorn src.paax_db.main:app --port 8084
```

> **Belum diverifikasi ke Postgres/pgvector nyata** — hanya diuji lewat
> fallback SQLite. Katalog AHSP asli juga belum di-index (indexer baca
> `G:/paax-data/ahsp.json` eksternal, di luar repo).

## Adding a new migration

```bash
alembic revision -m "description of changes"
```

Lalu edit file yang dihasilkan di `alembic/versions/`.

## Test

```bash
python -m pytest -q
# 2026-07-19: 8 passed, 1 skipped
```
