# PAAX AI — Civil Engineering AI Workspace

Workspace AI untuk insinyur sipil Indonesia. Mengubah data konstruksi menjadi
**RAB patuh AHSP**, **jadwal Kurva S**, dan simulasi skenario — dengan **setiap
angka yang dapat diaudit**.

> **Aturan emas:** engine yang **menghitung**, AI yang **menjelaskan**. Semua
> angka RAB/HSP/Kurva-S/skenario berasal dari `services/core-engine`
> (deterministik); LLM tidak pernah menghasilkan angka final. Detail lengkap:
> `CLAUDE.md` / `AGENTS.md`.

> Status kerja aktif, blocker, dan langkah berikutnya: `docs/ai-map/STATE_CURRENT.md`.
> Indeks dokumentasi lengkap (baca on-demand, bukan wajib tiap sesi): `docs/INDEX.md`.
> Navigasi kode/dependency/endpoint: pakai Graphify (`graphify query`/`path`/`explain`),
> bukan grep manual — lihat `CLAUDE.md` §7.

---

## Arsitektur — 6 service

Roadmap awal (`docs/MASTER_PLAN.md`) menandai beberapa service ini "mulai v0.8/v1.0/v2.0",
tapi semuanya **sudah ada kode nyata di `main`** sekarang, dengan kematangan
yang tidak merata (lihat catatan jujur per service di bawah).

| Service | Port | Bahasa | Tanggung jawab | Kematangan |
| --- | --- | --- | --- | --- |
| `apps/web` | 3000 | Next.js 15 / React 19 | Seluruh UI (dashboard, RAB, jadwal, Command Room, gambar kerja) | Aktif dikembangkan |
| `services/core-engine` | 8081 | FastAPI/Python | **Semua perhitungan deterministik** (HSP, RAB, Kurva S, CPM, skenario, takeoff, TKG) | Matang, 43 endpoint |
| `services/document-intelligence` | 8083 | FastAPI/Python | Persepsi gambar kerja (PDF/Excel → elemen → TKG → bridging ke engine); OCR NVIDIA/Gemini | Matang, PLHUT 88 halaman teruji |
| `services/ai-orchestrator` | 8082 | Express/TypeScript | Tool-calling Engineering Chat (Gemini): `lookup_ahsp`, `search_knowledge` (RAG), `run_scenario`, `analyze_drawing`, `query_rab/schedule` | Jalan, **belum dipanggil `apps/web`** |
| `services/db` | 8084 | FastAPI/Python | CRUD proyek/RAB/TKG, RAG knowledge (pgvector), audit log, metering, laporan pagi | Jalan, **belum diuji ke Postgres nyata** (fallback SQLite untuk test) |
| `services/site-agent` | 8085 | FastAPI/Python | Laporan harian lapangan + deviasi rencana-vs-realisasi | Scaffold modest (R14) |

**Command Room** (`apps/web/src/app/(dashboard)/command-room/`) adalah chat AI
utama dashboard — model routing Lucent/Solace via **NVIDIA NIM/DeepSeek**
(bukan `services/ai-orchestrator`, yang masih pakai Gemini dan belum
tersambung ke frontend). Chat per-proyek lama (`proyek/[projectId]/chat/`)
masih ada terpisah, pakai Gemini langsung. Lihat proteksi file Command Room di
`CLAUDE.md` §6 sebelum menyentuh area ini.

---

## Tech Stack

| Lapisan | Teknologi |
| --- | --- |
| Frontend | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS |
| Engine & persepsi | Python 3.11+, FastAPI, Pydantic v2 |
| AI Orchestrator | Node/Express + TypeScript |
| AI Chat (Command Room) | NVIDIA NIM (Lucent/DeepSeek-chat, Solace/DeepSeek-reasoner) |
| AI Chat (per-proyek, AI-assist gambar) | Gemini |
| Data | PostgreSQL + pgvector (fallback SQLite untuk test) |
| Shared Types | Zod (TypeScript) ↔ Pydantic (Python), `packages/schemas` |
| Monorepo | pnpm + Turborepo |
| Navigasi kode | Graphify (`graphify query`/`path`/`explain`) |

---

## Struktur Repo

```text
paax-ai/
├── apps/web/                        # Next.js — seluruh UI
├── services/
│   ├── core-engine/                 # FastAPI — perhitungan deterministik
│   ├── document-intelligence/       # FastAPI — persepsi gambar kerja + TKG
│   ├── ai-orchestrator/             # Express — tool-calling Engineering Chat
│   ├── db/                          # FastAPI — CRUD, RAG, audit, metering
│   └── site-agent/                  # FastAPI — laporan lapangan
├── packages/schemas/                # Zod ↔ Pydantic, 1 sumber kebenaran tipe
├── data/{ahsp,harga-satuan}/        # Koefisien & harga regional
├── docs/                            # INDEX.md, MASTER_PLAN, ADR, spesifikasi
└── legacy/                          # Kode lama (v0.1–v0.5), diarsipkan
```

---

## Prasyarat
- Node.js 20+ dan **pnpm** (`corepack enable`)
- Python 3.11+
- PostgreSQL (opsional untuk dev — `services/db` fallback SQLite tanpa itu)

## Quick Start

```bash
pnpm install

# Shared Python schemas (dibutuhkan semua service Python)
python -m venv .venv && .venv\Scripts\activate   # Windows; source .venv/bin/activate di macOS/Linux
pip install -e packages/schemas/python

# Tiap service Python
pip install -e services/core-engine[dev]
pip install -e services/document-intelligence
pip install -e services/db
pip install -e services/site-agent
```

Jalankan tiap service (terminal terpisah):

```bash
pnpm run dev:core       # core-engine      :8081  http://localhost:8081/docs
pnpm run dev:doc-intel  # document-intelligence :8083
cd services/ai-orchestrator && pnpm dev    # :8082
cd services/db && uvicorn src.paax_db.main:app --port 8084
cd services/site-agent && uvicorn app.main:app --port 8085
pnpm run dev:web        # web :3000
```

> `pnpm run dev`/`test` (root Turborepo script) saat ini hanya mencakup
> `web`+`core-engine`+`schemas` — `document-intelligence`/`ai-orchestrator`/`db`/
> `site-agent` dijalankan & diuji manual per-service (lihat tabel di atas).

---

## Test (per workspace, 2026-07-10)

| Workspace | Hasil |
| --- | --- |
| `services/core-engine` | 246 passed, 35 failed* |
| `services/document-intelligence` | 296 passed, 5 skipped |
| `services/db` | 8 passed, 1 skipped |
| `services/site-agent` | 17 passed |
| `services/ai-orchestrator` | 32 passed |
| `packages/schemas` | 14 passed |
| `apps/web` | 53 passed, 1 failed* |

\* Kegagalan core-engine: test lama belum kirim header auth setelah Auth/RBAC
ditambahkan — bukan bug logika. Kegagalan web: 1 test `orchestrator.test.ts`
(Command Room, di luar scope perbaikan dokumentasi ini) — lihat
`docs/ai-map/STATE_CURRENT.md` untuk detail & rekomendasi.

```bash
cd services/core-engine && python -m pytest -q
cd services/document-intelligence && python -m pytest -q
cd services/db && python -m pytest -q
cd services/site-agent && python -m pytest -q
pnpm --filter ai-orchestrator test
pnpm run test:schemas
pnpm --filter @paax/web test
```

---

## Data

Data di `data/` bersifat **ILUSTRATIF** untuk verifikasi engine. Sebelum
produksi, ganti dengan koefisien AHSP resmi (Permen PUPR No. 8/2023 + SE DJBK)
dan harga satuan SHSD daerah/harga pasar resmi. Katalog AHSP lengkap
(2.542 item) ada di luar repo (`G:\paax-data`, via env `PAAX_DATA_DIR`).

## Kontribusi

**Aturan emas (wajib):** engine yang **menghitung**, AI yang **menjelaskan** —
lihat `CLAUDE.md`/`AGENTS.md` untuk aturan permanen lengkap (schema alignment,
testing wajib, keamanan, pembagian Claude/Codex, gerbang review branch→PR,
proteksi Command Room, workflow Graphify-first). Commit mengikuti Conventional
Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).

## Lisensi
Proprietary — Do not distribute.
