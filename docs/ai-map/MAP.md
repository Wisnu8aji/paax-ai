# 🗺️ PAAX — MAP (di mana letak apa)

> Pakai ini untuk menemukan lokasi TANPA grep buta. Prinsip arsitektur lengkap:
> `CLAUDE.md` §3–§5. Monorepo: pnpm workspaces + Turborepo.

## Folder utama (tanggung jawab)
| Path | Tanggung jawab | Tidak boleh |
|---|---|---|
| `apps/web` | Next.js 14 — semua UI | Menghitung angka RAB |
| `services/core-engine` | FastAPI Python — **semua perhitungan deterministik** | Pakai LLM untuk aritmetika |
| `packages/schemas` | Zod + Pydantic = 1 sumber kebenaran tipe (`src/index.ts`) | Beda antara Zod & Pydantic |
| `data/` | AHSP + harga satuan (koefisien) | — |
| `docs/` | Rencana, ADR, aturan halaman, strategi | — |

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
