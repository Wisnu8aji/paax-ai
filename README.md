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

### Belum ada di v0.6 (rencana v1.0+)
- ❌ Ekstraksi gambar → BoQ (Document Intelligence)
- ❌ AI Orchestrator, RAG, AI Engineering Chat
- ❌ Simulasi skenario lanjutan, Monitoring multi-proyek

---

## v0.7 — Workspace Hidup (sedang berjalan)

Membangun **workspace nyata** di atas engine v0.6. Tetap **tanpa AI** — semua angka
dari engine deterministik.

- ✅ **Multi-proyek + CRUD** tersimpan (Firestore, dengan fallback localStorage bila env Firebase kosong)
- ✅ **Editor RAB per-proyek** (`/proyek/[id]/rab`): pilih item AHSP + volume + durasi → RAB, bobot, Kurva S, rincian HSP — **semua dari engine**, input tersimpan per-proyek
- ✅ **Browser Database AHSP** (`/database-ahsp`): live dari engine, rincian koefisien × harga per-wilayah
- ✅ **Export RAB/BoQ** ke Excel (CSV) & PDF (print)
- ✅ **RAB Health Check** (`POST /rab/validate`): skor 0–100 + peringatan deterministik (duplikat, volume nol, bobot dominan, durasi hilang)
- ✅ **Scenario Simulator** (`POST /scenario/simulate`, tab Schedule): frontier **waktu-biaya** ala ALICE — durasi dari produktivitas AHSP, skenario crew/lembur/paralel — semua titik dihitung engine
- ⏳ Editor harga regional dari UI (butuh endpoint override harga di engine) — slice tambahan
- ⛔ **v0.8 (Smart Import + AI)** ditahan sampai keputusan vendor model & metering

> Jalankan engine (`pnpm run dev:core`) agar halaman workspace bisa menghitung.
> Tanpa engine, RAB/AHSP menampilkan pesan/contoh fallback.

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
├── docs/                         # ADR, arsitektur, API, produk, versi
└── legacy/                       # Kode lama (v0.1–v0.5) yang diarsipkan
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
| POST | `/rab/validate` | Health check RAB (skor + peringatan, deterministik) |
| POST | `/rab/build` | RAB tersektor (WBS I–VII) |
| GET | `/wbs/sections` | Template 7 seksi WBS |
| POST | `/geometry/volume` | Hitung volume/luas dari dimensi (dipanggil AI) |
| GET | `/geometry/elements` | Tipe elemen yang didukung kalkulator volume |
| POST | `/schedule/s-curve` | Bangun Kurva S |
| POST | `/scenario/simulate` | Simulasi what-if waktu-biaya (deterministik) |

Contoh request lengkap: [`services/core-engine/requests.http`](services/core-engine/requests.http).
Detail engine: [`services/core-engine/README.md`](services/core-engine/README.md).

---

## Data

Data di `data/` bersifat **ILUSTRATIF** untuk verifikasi engine. Sebelum produksi, ganti dengan:
- Koefisien AHSP resmi: **Permen PUPR No. 8/2023** & SE DJBK terbaru
- Harga satuan: **SHSD daerah** atau harga pasar resmi

## Kontribusi
**Aturan emas (wajib):** engine yang **menghitung**, AI yang **menjelaskan** — semua angka
RAB/HSP/Kurva-S berasal dari `services/core-engine` (deterministik), tidak pernah dari LLM.
Bangun dari koefisien AHSP (`data/ahsp`) × harga satuan (`data/harga-satuan`); jangan
hardcode hasil RAB. Skema `packages/schemas` (Zod) wajib selaras dengan Pydantic engine
(`services/core-engine/app/rab/models.py`). Commit mengikuti Conventional Commits
(`feat:`, `fix:`, `docs:`, `refactor:`, `test:`).

## Lisensi
Proprietary — Do not distribute.
