# PAAX AI — Civil Engineering AI Workspace

Workspace AI untuk insinyur sipil Indonesia. Mengubah data konstruksi menjadi
**RAB patuh AHSP**, **jadwal Kurva S**, dan simulasi skenario — dengan **setiap angka
yang dapat diaudit**.

> **Aturan emas:** engine yang **menghitung**, AI (nanti) yang **menjelaskan**.
> Semua angka berasal dari engine deterministik; LLM tidak pernah menghasilkan angka.

---

## Apa itu v0.6?

**Deterministic Foundation Release** — fondasi perhitungan yang benar & auditable
sebelum menyentuh ekstraksi gambar/AI. Engine Python menghitung HSP, RAB, dan Kurva S
berdasarkan koefisien AHSP × harga satuan.

### Fitur v0.6
- ✅ **Core Engine deterministik** (FastAPI): HSP, RAB (+ bobot), Kurva S
- ✅ **API REST**: 7 endpoint, termasuk rincian HSP per item yang auditable
- ✅ **Shared schemas**: Zod (TypeScript) selaras 1:1 dengan Pydantic (Python)
- ✅ **Seed data**: AHSP Cipta Karya + harga satuan Jawa Tengah (ILUSTRATIF)
- ✅ **Halaman web Uji RAB manual** (Next.js → engine → tampilan), tanpa kalkulasi di frontend
- ✅ **Test**: 8 unit engine + 20 integrasi API + 6 schema (Zod)

### Belum ada di v0.6 (rencana v0.7)
- ❌ Ekstraksi gambar → BoQ (Document Intelligence)
- ❌ AI Orchestrator, RAG, AI Engineering Chat
- ❌ Simulasi skenario lanjutan, Monitoring multi-proyek

---

## Tech Stack

| Lapisan | Teknologi |
| --- | --- |
| Frontend | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4, lucide-react |
| Core Engine | Python 3.11+, FastAPI, Pydantic v2 |
| Shared Types | Zod (TypeScript) ↔ Pydantic (Python) |
| Monorepo | pnpm + Turborepo |

---

## Struktur Repo

```text
paax-ai/
├── apps/web/                     # Next.js — UI & halaman /rab-tester
├── services/core-engine/         # FastAPI — SEMUA perhitungan deterministik (fokus v0.6)
├── packages/schemas/             # Zod schemas (selaras dengan Pydantic)
├── data/
│   ├── ahsp/                     # Koefisien AHSP per bidang
│   └── harga-satuan/             # Harga satuan per wilayah
├── docs/BUILD_v0.6.md            # Rencana build & daftar task
├── legacy/                       # Kode lama (v0.1–v0.5) yang diarsipkan
└── CLAUDE.md                     # Aturan emas untuk Claude Code
```

> Service lain (`ai-orchestrator`, `document-intelligence`, `site-agent`) ada di repo
> tetapi **di luar lingkup v0.6**. Engine FastAPI v0.5 lama diarsipkan di
> `legacy/core-engine-v0.5/`.

---

## Prasyarat
- Node.js 20+ dan **pnpm** (`corepack enable` atau `npm i -g pnpm`)
- Python 3.11+

## Quick Start

### 1. Install dependencies (Node)
```bash
pnpm install
```

### 2. Install Core Engine (Python)
```bash
cd services/core-engine
python -m venv .venv
# Windows:  .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -e ".[dev]"
```

### 3. Jalankan Engine (terminal 1)
```bash
pnpm run dev:core
# Engine: http://localhost:8081  •  API docs: http://localhost:8081/docs
```

### 4. Jalankan Web (terminal 2)
```bash
pnpm run dev:web
# Web: http://localhost:3000
# Halaman Uji RAB: http://localhost:3000/rab-tester
```

> Web membaca `NEXT_PUBLIC_CORE_ENGINE_URL` dari `apps/web/.env.local`
> (default `http://localhost:8081`). Salin dari `apps/web/.env.example`.

---

## Test

```bash
pnpm run test:core      # Engine (pytest): 8 unit + 20 integrasi API
pnpm run test:schemas   # Schemas (jest/Zod): 6 test
pnpm test               # test:core + test:schemas
```

## Demo Engine (tanpa server)
```bash
cd services/core-engine
python -m app.demo
# Windows: set UTF-8 dulu agar grafik Kurva S tampil →  $env:PYTHONUTF8=1; python -m app.demo
```

---

## API Endpoints

| Method | Endpoint | Fungsi |
| --- | --- | --- |
| GET | `/health` | Status engine |
| GET | `/ahsp` | Daftar item AHSP |
| GET | `/ahsp/{code}` | Detail item AHSP |
| GET | `/regions` | Daftar wilayah |
| POST | `/rab/hsp` | Hitung HSP satu item (auditable) |
| POST | `/rab/calculate` | Hitung RAB lengkap |
| POST | `/schedule/s-curve` | Bangun Kurva S |

Contoh request lengkap: [`services/core-engine/requests.http`](services/core-engine/requests.http).
Detail engine: [`services/core-engine/README.md`](services/core-engine/README.md).

---

## Data

Data di `data/` bersifat **ILUSTRATIF** untuk verifikasi engine. Sebelum produksi, ganti dengan:
- Koefisien AHSP resmi: **Permen PUPR No. 8/2023** & SE DJBK terbaru
- Harga satuan: **SHSD daerah** atau harga pasar resmi

## Kontribusi
Lihat [`CLAUDE.md`](CLAUDE.md) untuk aturan emas dan konvensi yang wajib diikuti, serta
[`docs/BUILD_v0.6.md`](docs/BUILD_v0.6.md) untuk rencana build.

## Lisensi
Proprietary — Do not distribute.
