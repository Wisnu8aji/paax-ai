# Changelog

All notable changes to the PAAX AI project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v0.3.0] - Current
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
