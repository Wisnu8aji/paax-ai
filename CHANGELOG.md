# Changelog

All notable changes to the PAAX AI project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v0.6.0] - Current — Deterministic Foundation Release
### Added
- **Core Engine deterministik** (`services/core-engine`): perhitungan HSP, RAB (+ bobot), dan Kurva S yang sepenuhnya auditable, berbasis koefisien AHSP × harga satuan. Tidak ada LLM di jalur perhitungan.
- **Endpoint API** (FastAPI): `GET /health`, `GET /ahsp`, `GET /ahsp/{code}`, `GET /regions`, `POST /rab/hsp`, `POST /rab/calculate`, `POST /schedule/s-curve`.
- **Seed data AHSP** ilustratif (bidang Cipta Karya) + harga satuan regional (`jateng`) di `data/ahsp/` dan `data/harga-satuan/`.
- **Skema bersama** v0.6 di `packages/schemas` (Zod) yang selaras 1:1 dengan model Pydantic engine (`Category`, `AHSPItem`, `HSPBreakdown`, `RABLineInput`, `RABResult`, `SCurveResult`, dst).
- **8 unit test deterministik** (`tests/test_rab.py`) dengan nilai acuan dihitung manual + demo CLI (`python -m app.demo`).
- Dokumen `docs/BUILD_v0.6.md` (rencana build) dan `CLAUDE.md` (aturan wajib repo).

### Changed
- **Hapus output berbasis template.** Engine v0.5 berbasis template Excel diarsipkan ke `legacy/core-engine-v0.5/`; inti perhitungan kini engine deterministik baru.
- **Sinkronisasi versi ke `0.6.0`** (root `package.json`, `services/core-engine/pyproject.toml`).
- Skema `packages/schemas` diperluas dengan blok engine v0.6 (skema v0.5 dipertahankan agar `apps/web` tetap berfungsi).
- Skrip root: tambah `test:core`, sesuaikan `dev:core`/`dev:web`.

### Notes
- **Aturan emas:** engine yang menghitung, AI (nanti) yang menjelaskan. Tidak ada LLM di jalur perhitungan; AHSP adalah sumber koefisien, bukan template output.
- Data di `data/` bersifat **ILUSTRATIF** — ganti dengan koefisien AHSP resmi (Permen PUPR No. 8/2023 & SE DJBK) dan SHSD daerah sebelum produksi.
- **Rencana v0.7:** mulai Document Intelligence (gambar → BoQ) yang mengirim `{kode AHSP, volume}` ke engine v0.6 ini sebagai tujuan akhir pipeline.

## [v0.3.0]
### Added
- **Monorepo Migration**: Transitioned to a pnpm/Python monorepo structure.
- **Next.js Dashboard**: Complete rewrite of the frontend using Next.js App Router with project-centric routing (`/dashboard/[projectId]`).
- **FastAPI Core Engine**: New deterministic calculation backend for precise, auditable RAB and schedule math.
- **AI Orchestrator**: Integrated Firebase Genkit for robust agent routing and tool execution.
- **Document Intelligence Pipeline**: Python-based PDF processing, OCR, and vision analysis.
- **Site Agent Integration**: Initial API endpoints for field reporting and log analysis.
- **Shared Packages**: Unified data models across frontend and backend using `shared-schemas`.
- **Comprehensive Documentation**: Added architecture decision records (ADRs), system overviews, API docs, and data models.

## [v0.2.0-demo] - Previous Release
### Added
- Vite + Express demo application.
- Basic interactive tabs: RAB, Assistant, Drawing, Schedule, Rates.
- Deterministic RAB calculation proof-of-concept.
- Direct Gemini API integration for natural language queries.
- Mock AHSP database loaded from static JSON files.

## [v0.1.0] - Prototype
### Added
- Streamlit-based prototype interface.
- Basic chatbot interacting with a hardcoded civil engineering prompt.
- Simple CSV export functionality.
