# 🗺️ PAAX — MAP (di mana letak apa)

> Pakai ini untuk menemukan lokasi TANPA grep buta. Prinsip arsitektur lengkap:
> `CLAUDE.md` §3–§5. Monorepo: pnpm workspaces + Turborepo.

## Folder utama (tanggung jawab)
| Path | Tanggung jawab | Tidak boleh |
|---|---|---|
| `apps/web` | Next.js 15 — semua UI | Menghitung angka RAB |
| `services/core-engine` | FastAPI Python — **semua perhitungan deterministik** | Pakai LLM untuk aritmetika |
| `services/document-intelligence` | FastAPI Python — persepsi gambar (span/grid/tabel/elemen), TKG, work-items, AI-assist klasifikasi/binding, bridging ke core-engine | Menetapkan harga/biaya, menghitung volume sendiri |
| `services/ai-orchestrator` | Node/Express — tool-calling Gemini (REST manual, BUKAN Genkit) utk Engineering Chat, 7 tool | Mengarang angka final |
| `packages/schemas` | Zod + Pydantic = 1 sumber kebenaran tipe (`src/index.ts`) | Beda antara Zod & Pydantic |
| `data/` | AHSP + harga satuan (koefisien) | — |
| `docs/` | Rencana, ADR, aturan halaman, strategi | — |

## Document Intelligence — endpoint (`services/document-intelligence/app/main.py`)
```
/health
/upload  /pdf  /excel
/drawings/analyze/start  /drawings/analyze/status/{job_id}
/drawings/tkg/work-items
```
- Logika: `app/perception/` (span/merge-run, grammar, `zone_classifier.py`,
  `binding.py` §5, `consolidate.py`, `work_items.py`, `bridging_tanah.py`,
  `bridging_dinding.py`, `bridging_atap.py`, `bridging_kusen.py`,
  `bridging_mep.py`, `bridging_kuda_kuda.py`, `bridging_arsitektur_area.py`),
  `app/perception/vector/grid_geometry.py`, `app/perception/ocr/` (PaddleOCR
  raster, opsional/lazy).
- **`app/perception/ai_assist/`** (dibangun 2026-07-05, BUKAN lagi rencana):
  lapisan LLM fallback paralel utk klasifikasi/binding saat rule-based
  gagal (`CLAUDE.md` §1.1) — `client.py` (`GeminiAiAssistClient`),
  `dimension_assist.py`, `zone_assist.py`, `wall_assist.py`,
  `roof_frame_assist.py`, `kusen_assist.py`, `mep_assist.py`,
  `kuda_kuda_assist.py`, `arsitektur_area_assist.py`. Detail rencana asal:
  `docs/plans/PAAX_ANALISA_RAB_DARI_GAMBAR_BIG_PLAN_2026-07-13.md` §X2.
- Test: `services/document-intelligence/tests/` · jalankan `pytest -q`.

## AI Orchestrator — endpoint (`services/ai-orchestrator/src/index.ts`)
```
/health
/chat   (POST — message, project_id, context{rab_lines,schedule})
```
- Logika: `src/gemini/client.ts` (REST langsung ke Gemini), `src/gemini/
  tool-loop.ts` (loop multi-turn, guard `MAX_TOOL_TURNS`), `src/tools/*`
  (`lookup_ahsp`, `run_scenario`, `analyze_drawing`, `query_rab`,
  `query_schedule`, `query_progress` stub, `query_materials` stub).
- `apps/web` BELUM memanggil service ini (wiring frontend belum dikerjakan).
- Test: `services/ai-orchestrator/` · jalankan `pnpm --filter ai-orchestrator test`.
- Detail: `services/ai-orchestrator/README.md`.

## Engine — endpoint (`services/core-engine/app/main.py`)
```
/health  /ahsp  /ahsp/{code}  /regions
/rab/hsp  /rab/calculate  /rab/validate  /rab/build  /rab/export/excel
/schedule/s-curve  /schedule/cpm  /schedule/plan
/scenario/simulate            (knob params 9B → hasil .custom)
/geometry/volume  /geometry/elements  /wbs/sections
/tkg/validate  /tkg/render  /tkg/takeoff   (TKG brain v4.1 → skrip + takeoff)
```
- Logika: `app/rab/` (rab, schedule, sections, validate), `app/scenario/`, `app/geometry/`, `app/export/`, `app/tkg/` (models, validate, render, takeoff, params).
- Test: `services/core-engine/tests/` · jalankan `pytest -q`.

## Web — file kunci (`apps/web/src/`)
| File/Dir | Untuk |
|---|---|
| `lib/engine.ts` | Client typed ke engine (fetch) |
| `lib/core-engine-client.ts` | `CORE_ENGINE_URL`, `CoreEngineError` |
| `lib/ai/orchestrator.ts` | Gemini (`geminiText`/`geminiJson`) + fallback rule-based |
| `lib/ai/engineering-chat.ts` | Prompt + fallback Engineering Chat (+ context pack proyek) |
| `lib/ai/tkg-extractor.ts` | AI menyalin teks gambar → TkgDocument (usulan) |
| `lib/ai/project-context.ts` | Context pack chat: skrip TKG + draft RAB |
| `app/api/ai/*` | Route AI server-side (chat, extract, tkg, import-map, price-justification) |
| `lib/projects/rab-repository.ts` | Draft RAB client-side (**INPUT saja**, bukan hasil) |
| `lib/projects/tkg-repository.ts` | TKG per proyek (source: manual/ai_proposal + reviewed) |
| `components/drawings/tkg-workspace.tsx` | Workspace TKG: sumber→transkrip→skrip→takeoff→RAB |
| `components/rab/*` | Komponen RAB (s-curve, hsp-breakdown, smart-rab-*) |
| `app/(dashboard)/proyek/[projectId]/{rab,schedule,chat,gambar-kerja,site-agent}/page.tsx` | Halaman proyek |
- Test: `pnpm --dir apps/web test` (vitest).

## Verifikasi (perintah generic — path mesin lokal ada di memory Claude)
```
pytest -q                       # di services/core-engine
pnpm run test:schemas           # selaras Zod↔Pydantic
pnpm --dir apps/web test        # vitest
pnpm --dir apps/web build       # typecheck + build
```
