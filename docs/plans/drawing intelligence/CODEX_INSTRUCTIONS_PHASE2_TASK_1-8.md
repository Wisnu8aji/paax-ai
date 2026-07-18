> **STATUS: HISTORICAL/SUPERSEDED** -- lihat [DI_SOURCE_OF_TRUTH.md](file:///G:/paax-ai-main/docs/plans/drawing%20intelligence/DI_SOURCE_OF_TRUTH.md) untuk kondisi terkini

# Instruksi Codex — DEM Phase 2 (Job Orchestrator), Task 1 sampai 8

> Plan sumber: `docs/superpowers/plans/2026-07-14-dem-phase2-job-orchestrator.md`
> Spec sumber: `docs/superpowers/specs/2026-07-14-dem-phase2-job-orchestrator-design.md`
> Prasyarat: Fase 0+1 (skema DEM/PCKM) sudah selesai & terverifikasi —
> `docs/superpowers/plans/2026-07-14-dem-pckm-phase0-1-schemas.md`, commit
> terakhir `00b07fc` di branch `feat/command-room-model-overhaul`.
>
> File ini berisi instruksi lengkap untuk Task 1-8 Fase 2 — jalankan
> **berurutan**, jangan loncat. Setiap task memperluas file yang dibuat/diubah
> task sebelumnya (models Postgres → provider adapter → renderer/parser →
> db client → page loop → document loop + endpoint → resume + uji manual).

## Cara pakai

Untuk tiap task di bawah: copy blok prompt-nya (di dalam ```` ``` ````) ke
Codex — baik lewat `codex exec` non-interaktif maupun sesi interaktif biasa.
Contoh command non-interaktif (PowerShell, dari `G:\paax-ai-main`):

```powershell
# Ganti N dengan nomor task (1..8)
Get-Content "G:\paax-ai-main\docs\plans\drawing intelligence\codex-phase2-task-N-prompt.txt" -Raw | codex exec --dangerously-bypass-approvals-and-sandbox -C "G:\paax-ai-main" -c model_reasoning_effort=medium -o "G:\paax-ai-main\docs\plans\drawing intelligence\codex-phase2-task-N-output.md"
```

(Simpan tiap blok prompt di bawah ke file `.txt` terpisah dulu sebelum
dijalankan, atau paste langsung ke sesi Codex interaktif — dua-duanya valid.)

Setelah tiap task selesai, cek baris pertama laporannya:
- **`Status: DONE`** → lanjut ke task berikutnya.
- **`DONE_WITH_CONCERNS` / `BLOCKED` / `NEEDS_CONTEXT`** → **jangan lanjut**,
  tunjukkan isi laporannya dulu sebelum lanjut ke task berikutnya.

Task terakhir (Task 8) berisi langkah uji manual dengan Qwen3.7-Plus
sungguhan memakai fixture nyata (88 halaman PLHUT) — itu **TIDAK** dijalankan
otomatis oleh Codex sebagai bagian test suite, harus dijalankan manual setelah
`DEM_EXTRACTION_API_KEY` diisi di `.env.local`.

**Aturan git berlaku sama seperti Fase 0-1: commit lokal per task OK
(itu tugas Codex), TIDAK PERNAH push/PR/merge — itu keputusan owner.**

---

## Task 1 — `dem_runs`/`dem_pages` Alembic migration + SQLAlchemy models

```text
You are implementing Task 1 of an 8-task implementation plan (DEM Phase 2 — Job Orchestrator) in the PAAX AI monorepo (repo root: G:\paax-ai-main, branch: feat/command-room-model-overhaul — stay on this branch).

## Task Description

Read your task brief first: the full "Task 1: dem_runs/dem_pages Alembic migration + SQLAlchemy models" section in G:\paax-ai-main\docs\superpowers\plans\2026-07-14-dem-phase2-job-orchestrator.md. It contains complete, ready-to-use SQLAlchemy model code, Pydantic schema code, FastAPI endpoint code, and a full Alembic migration file — follow it precisely, do not redesign shapes, do not skip steps.

## Context

This is the FIRST task of DEM Phase 2 (job orchestrator that actually calls AI vision to fill DrawingEvidenceSheet, Fase 0+1's schema). Phase 0+1 already added DrawingEvidenceSheet/ProjectGraphSnapshot/etc to services/document-intelligence/app/transcription/models.py and app/project_graph/models.py, plus matching Zod in packages/schemas/src/index.ts — none of that is touched by this task. This task works entirely in services/db (a SEPARATE service with its own Postgres schema, SQLAlchemy models, Alembic migrations, and FastAPI app at services/db/src/paax_db/). Read services/db/src/paax_db/models.py's existing Conversation/Message classes and services/db/alembic/versions/0007_command_room_memory.py first to see the exact conventions this task's code follows (GUID() primary keys, String status columns not Postgres ENUM, JSONB payload columns).

## Codebase exploration — use graphify, not blind grep

Run `graphify query "<your question>"` before exploring — hard project convention (CLAUDE.md section 7). Note: this repo's graphify graph currently returns a lot of noise from bundled `.agents/skills/ui-main/` files on generic queries — if a query returns mostly unrelated shadcn/UI-library nodes, fall back to direct Read/Grep on `services/db/src/paax_db/` and `services/db/alembic/versions/` rather than retrying broader graphify queries.

## Git — commit locally when done, but do NOT push, do NOT open a PR, do NOT merge

Local commit only, message per the plan's Step 10 suggested message. No push, PR, or merge. Stay on feat/command-room-model-overhaul.

## Your job

1. Read Task 1's full text in the plan file.
2. Follow all 10 steps in order: failing test (services/db/tests/test_dem_runs.py), add SQLAlchemy models (DemRun, DemPage) to models.py, add Pydantic schemas to schemas.py, add the 5 endpoints to main.py (POST /dem/runs, GET /dem/runs/{id}, GET /dem/runs/{id}/status, POST /dem/pages, PUT /dem/pages/{id}), confirm the test passes, write the Alembic migration file 0008_dem_runs.py, run the full services/db suite, run test_alembic_migrations.py specifically, then commit.
3. Self-review: does status stay String (not Postgres ENUM)? Does the migration's revision/down_revision chain correctly from '0007'? Does dem_pages have the unique (run_id, page_index) index?

## Report format

- Status: DONE, DONE_WITH_CONCERNS, BLOCKED, or NEEDS_CONTEXT
- RED/GREEN commands and outcomes
- Full services/db suite result (pass count, zero failures)
- test_alembic_migrations.py result
- Commit SHA and message
- Files changed
- Any concerns
- Confirm: "No git push, PR, or merge was performed."
```

---

## Task 2 — Failure classification helper

```text
You are implementing Task 2 of an 8-task implementation plan (DEM Phase 2 — Job Orchestrator) in the PAAX AI monorepo (repo root: G:\paax-ai-main, branch: feat/command-room-model-overhaul — stay on this branch).

## Task Description

Read your task brief first: the full "Task 2: Failure classification helper" section in G:\paax-ai-main\docs\superpowers\plans\2026-07-14-dem-phase2-job-orchestrator.md. It contains complete, ready-to-use Python code. This is a small, self-contained, pure-logic task (no I/O, no database) — follow it precisely.

## Context

Task 1 (already complete) added dem_runs/dem_pages tables to services/db, a separate service. This task (Task 2) works in services/document-intelligence and is deliberately independent of Task 1 — it defines HOW failures get classified (transient/invalid_output/permanent) but does not itself call any provider or database. This is a core design decision from the spec (docs/superpowers/specs/2026-07-14-dem-phase2-job-orchestrator-design.md): DEM Phase 2 does NOT retry blindly N times on every failure — it classifies first, then decides retry-identically (transient only), one repair pass (invalid_output only), or fail immediately with no retry (permanent). Read that "Klasifikasi kegagalan" section of the spec for the full reasoning if anything in the brief is unclear.

## Codebase exploration — use graphify, not blind grep

Run `graphify query "<your question>"` before exploring — hard project convention (CLAUDE.md section 7). This task creates new files with no existing precedent to look up, so graphify exploration here is mostly a formality — a quick query is enough before proceeding to Read/Write.

## Git — commit locally when done, but do NOT push, do NOT open a PR, do NOT merge

Local commit only, message per the plan's Step 5 suggested message. No push, PR, or merge.

## Your job

1. Read Task 2's full text in the plan file.
2. Follow all 5 steps: failing test (services/document-intelligence/tests/test_failure_classification.py), implement app/transcription/failure_classification.py (FailureKind, DemProviderError, classify_http_error), confirm test passes, commit.
3. Self-review: does classify_http_error correctly bucket 429/5xx as transient, 400/401/403/404/422 as permanent, and everything else as invalid_output (not silently defaulting to something unsafe)?

## Report format

- Status: DONE, DONE_WITH_CONCERNS, BLOCKED, or NEEDS_CONTEXT
- RED/GREEN commands and outcomes
- Commit SHA and message
- Files changed
- Any concerns
- Confirm: "No git push, PR, or merge was performed."
```

---

## Task 3 — Provider adapter interface + Qwen adapter + mock adapter

```text
You are implementing Task 3 of an 8-task implementation plan (DEM Phase 2 — Job Orchestrator) in the PAAX AI monorepo (repo root: G:\paax-ai-main, branch: feat/command-room-model-overhaul — stay on this branch).

## Task Description

Read your task brief first: the full "Task 3: Provider adapter interface + Qwen adapter + mock adapter" section in G:\paax-ai-main\docs\superpowers\plans\2026-07-14-dem-phase2-job-orchestrator.md. It contains complete, ready-to-use Python code for four new files. Follow it precisely.

## Context

Task 2 (already complete) added DemProviderError/FailureKind/classify_http_error to app/transcription/failure_classification.py — this task imports and uses those. This task builds the vision-provider abstraction: a Protocol (DemVisionProvider), a PageContext dataclass, a real Qwen3.7-Plus/DashScope adapter (QwenDemAdapter), and a MockDemAdapter for tests. CRITICAL: QwenDemAdapter must read ONLY the DEM_EXTRACTION_API_KEY / DEM_EXTRACTION_BASE_URL / DEM_EXTRACTION_MODEL environment variables (already present, empty, in .env.example and .env.local as of 2026-07-14) — it must NEVER read DASHSCOPE_API_KEY, which belongs to Command Room's Arete model and must stay completely separate. Also note: reasoning_effort defaults to "xhigh" per an explicit owner instruction (maximum effort) — do not change this default.

Look at services/document-intelligence/app/perception/ai_assist/client.py's GeminiAiAssistClient class (dataclass + .from_env() classmethod pattern, urllib-based HTTP, no new dependency) before writing qwen.py — the brief's code already follows this pattern, but seeing the precedent will help you understand why it's structured this way.

## Codebase exploration — use graphify, not blind grep

Run `graphify query "<your question>"` before exploring — hard project convention (CLAUDE.md section 7). If a query returns mostly unrelated `.agents/skills/ui-main/` UI-library noise, fall back to direct Read on app/perception/ai_assist/client.py.

## Git — commit locally when done, but do NOT push, do NOT open a PR, do NOT merge

Local commit only, message per the plan's Step 7 suggested message. No push, PR, or merge.

## Your job

1. Read Task 3's full text in the plan file.
2. Follow all 7 steps: failing test (services/document-intelligence/tests/test_dem_providers.py), create app/transcription/providers/__init__.py + base.py (Protocol + PageContext), create providers/mock.py, create providers/qwen.py, confirm all 4 tests pass, commit.
3. Self-review: confirm QwenDemAdapter.from_env() reads DEM_EXTRACTION_* only (grep the file for "DASHSCOPE" to confirm zero matches), confirm reasoning_effort defaults to "xhigh".

## Report format

- Status: DONE, DONE_WITH_CONCERNS, BLOCKED, or NEEDS_CONTEXT
- RED/GREEN commands and outcomes
- Commit SHA and message
- Files changed
- Confirm: grep for "DASHSCOPE" in the new qwen.py file returned zero matches
- Any concerns
- Confirm: "No git push, PR, or merge was performed."
```

---

## Task 4 — Page renderer + strict-prompt parser/validator (with repair pass)

```text
You are implementing Task 4 of an 8-task implementation plan (DEM Phase 2 — Job Orchestrator) in the PAAX AI monorepo (repo root: G:\paax-ai-main, branch: feat/command-room-model-overhaul — stay on this branch).

## Task Description

Read your task brief first: the full "Task 4: Page renderer + strict-prompt parser/validator (with repair pass)" section in G:\paax-ai-main\docs\superpowers\plans\2026-07-14-dem-phase2-job-orchestrator.md. It contains complete, ready-to-use Python code for two new files (page_renderer.py, parser.py) and their tests. Follow it precisely.

## Context

Task 3 (already complete) added the DemVisionProvider Protocol, PageContext, QwenDemAdapter, MockDemAdapter. This task (Task 4) adds two things: (1) render_page_to_png, a small standalone PyMuPDF page-to-PNG renderer -- IMPORTANT: this is a NEW, independent function, NOT a call into app/perception/assemble.py::assemble_sheet_from_page (which is TKG-coupled and does much more than rendering). The brief's code deliberately duplicates the one-line `page.get_pixmap(dpi=200)` pattern rather than importing the TKG function, because DEM is architecturally a separate pipeline from TKG (app/tkg/ remains untouched, feeds compute_rab() -- see ADR 0005). Do not "simplify" by importing from assemble.py. (2) parse_and_validate, which validates raw JSON against the existing DrawingEvidenceSheet Pydantic model (from Phase 0+1, already exists in app/transcription/models.py) and does exactly ONE repair pass (re-calling the provider with the original error) if validation fails the first time -- per Task 2's failure classification design, this is NOT a retry loop.

## Codebase exploration — use graphify, not blind grep

Run `graphify query "<your question>"` before exploring — hard project convention (CLAUDE.md section 7). If querying about assemble.py or render patterns returns UI-library noise, fall back to direct Read on services/document-intelligence/app/perception/assemble.py lines 324-360 to see the precedent this task's renderer is modeled after (without importing it).

## Git — commit locally when done, but do NOT push, do NOT open a PR, do NOT merge

Local commit only, message per the plan's Step 9 suggested message. No push, PR, or merge.

## Your job

1. Read Task 4's full text in the plan file.
2. Follow all 9 steps: failing renderer test, implement page_renderer.py, confirm passes, failing parser test (3 test cases: valid-on-first-try, repaired-successfully, fails-after-repair-with-real-error), implement parser.py, confirm all pass, commit.
3. Self-review: confirm parser.py's DemProviderError message on repair failure contains the ACTUAL pydantic ValidationError text (not a generic message) -- the spec requires the real error preserved, not generalized.

## Report format

- Status: DONE, DONE_WITH_CONCERNS, BLOCKED, or NEEDS_CONTEXT
- RED/GREEN commands and outcomes for both test files
- Commit SHA and message
- Files changed
- Any concerns
- Confirm: "No git push, PR, or merge was performed."
```

---

## Task 5 — `services/db` HTTP client for document-intelligence

```text
You are implementing Task 5 of an 8-task implementation plan (DEM Phase 2 — Job Orchestrator) in the PAAX AI monorepo (repo root: G:\paax-ai-main, branch: feat/command-room-model-overhaul — stay on this branch).

## Task Description

Read your task brief first: the full "Task 5: services/db HTTP client for document-intelligence" section in G:\paax-ai-main\docs\superpowers\plans\2026-07-14-dem-phase2-job-orchestrator.md. It contains complete, ready-to-use Python code for db_client.py and its test, PLUS one additional endpoint (PUT /dem/runs/{id}) that must be added to services/db/src/paax_db/main.py (Task 1 did not add this one -- Task 5 needs it).

## Context

document-intelligence and services/db are separate FastAPI services -- they do NOT share a database connection. This task builds an HTTP client (DemDbClient) that document-intelligence uses to talk to services/db's /dem/runs and /dem/pages endpoints (from Task 1), following the exact pattern Command Room's apps/web/src/app/api/command-room/chat/tools.ts::logToolCallAudit already uses (X-Internal-Key header, JSON over HTTP, fire against a base_url). The test uses httpx's AsyncBaseTransport stub pattern (no real network, no real services/db process needed) -- read the brief's test code carefully, it shows exactly how to stub responses.

## Codebase exploration — use graphify, not blind grep

Run `graphify query "<your question>"` before exploring — hard project convention (CLAUDE.md section 7). If querying about the tools.ts audit pattern returns noise, fall back to direct Read on apps/web/src/app/api/command-room/chat/tools.ts (the logToolCallAudit function, roughly lines 131-163).

## Git — commit locally when done, but do NOT push, do NOT open a PR, do NOT merge

Local commit only, message per the plan's Step 6 suggested message. No push, PR, or merge.

## Your job

1. Read Task 5's full text in the plan file.
2. Follow all 6 steps: failing test (services/document-intelligence/tests/test_dem_db_client.py), implement app/transcription/db_client.py, ALSO add the PUT /dem/runs/{id} endpoint to services/db/src/paax_db/main.py (the brief shows this exact code -- do not skip it, later tasks depend on it), confirm the document-intelligence test passes, run the FULL services/db suite to confirm the new endpoint didn't break anything, commit.
3. Self-review: confirm DemDbClient reads DB_API_URL and INTERNAL_SERVICE_KEY from env with sensible defaults, confirm the added PUT endpoint follows the exact same pattern as the existing PUT /conversations/{id} endpoint in main.py.

## Report format

- Status: DONE, DONE_WITH_CONCERNS, BLOCKED, or NEEDS_CONTEXT
- RED/GREEN commands and outcomes
- Full services/db suite result after adding the PUT endpoint (pass count, zero failures)
- Commit SHA and message
- Files changed (note: this task touches BOTH services/document-intelligence AND services/db)
- Any concerns
- Confirm: "No git push, PR, or merge was performed."
```

---

## Task 6 — Page loop with failure classification + idempotency + continuation

```text
You are implementing Task 6 of an 8-task implementation plan (DEM Phase 2 — Job Orchestrator) in the PAAX AI monorepo (repo root: G:\paax-ai-main, branch: feat/command-room-model-overhaul — stay on this branch).

## Task Description

Read your task brief first: the full "Task 6: Page loop with failure classification + idempotency + continuation" section in G:\paax-ai-main\docs\superpowers\plans\2026-07-14-dem-phase2-job-orchestrator.md. It contains complete, ready-to-use Python code for page_loop.py and its test (3 test cases: success persists result, permanent failure does not retry, idempotency skip when already complete with matching hash). Follow it precisely.

## Context

This task is the integration point for everything built so far: Task 2's failure classification, Task 3's provider adapters, Task 4's renderer/parser, Task 5's db_client. process_page() processes exactly ONE page end-to-end: check idempotency (skip if already complete with matching input_hash), render, call provider, classify any failure and act accordingly (transient retries with attempt_count increment up to MAX_TRANSIENT_ATTEMPTS=3, permanent fails immediately with attempt_count NOT incremented, invalid_output's repair pass already happened inside Task 4's parse_and_validate so a failure here means repair also failed), persist the final state via db_client.

## Codebase exploration — use graphify, not blind grep

Run `graphify query "<your question>"` before exploring — hard project convention (CLAUDE.md section 7).

## Git — commit locally when done, but do NOT push, do NOT open a PR, do NOT merge

Local commit only, message per the plan's Step 5 suggested message. No push, PR, or merge.

## Your job

1. Read Task 6's full text in the plan file.
2. Follow all 5 steps: failing test (services/document-intelligence/tests/test_page_loop.py), implement app/transcription/page_loop.py, confirm all 3 tests pass, commit.
3. Self-review: trace through the permanent-failure test case manually -- confirm attempt_count stays 0 (not incremented) for permanent failures, per the spec's explicit rule that permanent failures never retry and therefore the attempt counter is meaningless for them.

## Report format

- Status: DONE, DONE_WITH_CONCERNS, BLOCKED, or NEEDS_CONTEXT
- RED/GREEN commands and outcomes
- Commit SHA and message
- Files changed
- Any concerns
- Confirm: "No git push, PR, or merge was performed."
```

---

## Task 7 — Document loop (concurrency, resume) + `POST /drawings/dem/start` + `GET /drawings/dem/{run_id}/status`

```text
You are implementing Task 7 of an 8-task implementation plan (DEM Phase 2 — Job Orchestrator) in the PAAX AI monorepo (repo root: G:\paax-ai-main, branch: feat/command-room-model-overhaul — stay on this branch).

## Task Description

Read your task brief first: the full "Task 7: Document loop (concurrency, resume) + POST /drawings/dem/start + GET /drawings/dem/{run_id}/status" section in G:\paax-ai-main\docs\superpowers\plans\2026-07-14-dem-phase2-job-orchestrator.md. It contains complete, ready-to-use Python code for document_loop.py, dem_routes.py, a main.py modification, and their tests. Follow it precisely.

## Context

Task 6 (already complete) built process_page() for a single page. This task builds process_document(), which creates dem_pages rows for ALL pages of a document and drives process_page() for each with bounded concurrency (asyncio.Semaphore, default 2 concurrent workers per the spec's §7.5 -- pages are independent, safe to parallelize), then marks the run dem_complete or partially_failed. It also adds the actual HTTP endpoints (POST /drawings/dem/start accepting a PDF upload, GET /drawings/dem/{run_id}/status). IMPORTANT: this new dem_routes.py is a brand-new file, NOT a restoration of the archived services/document-intelligence/app/api/drawing_routes.py (that file was archived 2026-07-14 to G:\paax-cleanup-archive\2026-07-14-tkg-drawing-analysis-legacy\ and removed from main.py -- do not resurrect it or copy its code; this task's dem_routes.py is a clean, new implementation using only Tasks 1-6's building blocks).

## Codebase exploration — use graphify, not blind grep

Run `graphify query "<your question>"` before exploring — hard project convention (CLAUDE.md section 7).

## Git — commit locally when done, but do NOT push, do NOT open a PR, do NOT merge

Local commit only, message per the plan's Step 11 suggested message. No push, PR, or merge.

## Your job

1. Read Task 7's full text in the plan file.
2. Follow all 11 steps: failing document_loop test (2 cases: all pages succeed -> dem_complete, one page fails -> partially_failed), implement document_loop.py, confirm passes, failing routes test, implement app/api/dem_routes.py, register it in app/main.py (add dem_routes to the import line and app.include_router call -- do NOT remove or alter the existing tkg_routes registration), confirm the routes test passes, run the FULL document-intelligence suite (confirms zero regressions across everything from Fase 0+1 AND Tasks 1-6 of this phase), commit.
3. Self-review: confirm main.py's import line change is additive (adds dem_routes, does not remove tkg_routes or any other existing router), confirm the endpoint uses BackgroundTasks so the upload response returns immediately rather than blocking until all pages finish.

## Report format

- Status: DONE, DONE_WITH_CONCERNS, BLOCKED, or NEEDS_CONTEXT
- RED/GREEN commands and outcomes for both test files
- Full document-intelligence suite result (pass count, zero failures)
- Commit SHA and message
- Files changed
- Any concerns
- Confirm: "No git push, PR, or merge was performed."
```

---

## Task 8 — Resume behavior + full-suite verification + manual real-fixture run

```text
You are implementing Task 8 (the final task) of an 8-task implementation plan (DEM Phase 2 — Job Orchestrator) in the PAAX AI monorepo (repo root: G:\paax-ai-main, branch: feat/command-room-model-overhaul — stay on this branch).

## Task Description

Read your task brief first: the full "Task 8: Resume behavior + full-suite verification + manual real-fixture run" section in G:\paax-ai-main\docs\superpowers\plans\2026-07-14-dem-phase2-job-orchestrator.md. It contains complete, ready-to-use Python code (a resume=True parameter added to process_document) and a detailed manual-verification runbook using the real 88-page PLHUT fixture.

## Context

This is the LAST automated-code task of Phase 2. Tasks 1-7 built the full pipeline assuming a fresh run; this task adds resume support per the plan's §7.7: when process_document is called with resume=True, it fetches existing page rows first (via db_client.get_run_status) and reuses page rows already marked complete instead of creating duplicates or reprocessing them -- process_page's own idempotency check (Task 6) is what actually skips the provider call; this task's job is making sure the document loop doesn't even attempt to recreate/reprocess pages that are already done.

Step 7 of this task (manual verification with real Qwen3.7-Plus against the 88-page PLHUT fixture at "docs/plans/drawing intelligence/Gambar kerja/GAMBAR KERJA PLHUT SURAKARTA (1).pdf") requires DEM_EXTRACTION_API_KEY to be filled in .env.local with a real DashScope key -- if it is NOT filled in, do NOT attempt this step; report DONE_WITH_CONCERNS noting Step 7 was skipped because no API key was available, and stop there. Do not fabricate or guess at results for Step 7.

If DEM_EXTRACTION_API_KEY IS filled in: run Step 7 exactly as written in the brief. If real failures occur during this manual run, diagnose whether they are a bug in Tasks 1-8's code (fix it now, in this task, and re-run) versus an expected/reasonable Qwen response quirk (report it precisely, do not treat it as blocking) -- this follows the user's explicit instruction from the original design session: "kalau mengalami kegagalan langsung kita perbaiki sehingga user pengguna tidak looping terus menerus" (fix root causes during our own testing so the eventual real user never hits a retry loop).

## Codebase exploration — use graphify, not blind grep

Run `graphify query "<your question>"` before exploring — hard project convention (CLAUDE.md section 7).

## Git — commit locally when done, but do NOT push, do NOT open a PR, do NOT merge

Local commit only, message per the plan's Step 8 suggested message (for the code change; the manual verification in Step 7 is not itself committed, it's a runtime activity). No push, PR, or merge.

## Your job

1. Read Task 8's full text in the plan file.
2. Follow Steps 1-6: failing resume test (services/document-intelligence/tests/test_document_loop_resume.py), add resume=True support to document_loop.py's process_document, confirm the resume test passes, run the FULL document-intelligence suite, run the FULL services/db suite, commit the code change.
3. Then attempt Step 7 (manual real-fixture run) per the conditional instructions above.
4. Self-review: confirm the resume test proves NO duplicate page row is created for an already-complete page (check page_0_rows count == 1 in the test, as the brief specifies).

## Report format

- Status: DONE, DONE_WITH_CONCERNS, BLOCKED, or NEEDS_CONTEXT
- RED/GREEN commands and outcomes for the resume test
- Full document-intelligence suite result (pass count, zero failures)
- Full services/db suite result (pass count, zero failures)
- Commit SHA and message (for the code change)
- Step 7 outcome: SKIPPED (no API key) with reason, OR full results (X/88 pages complete, Y/88 failed with their failure_kind/error, resume verification outcome)
- If Step 7 ran and found real bugs: what was fixed, and confirmation the fix was re-tested
- Any concerns
- Confirm: "No git push, PR, or merge was performed."
```

---

## Setelah Task 8 selesai

Jika Task 8 melapor `DONE` (dengan Step 7 sukses berjalan atau sengaja
di-skip karena API key belum diisi), seluruh 8 task Fase 2 (job orchestrator)
selesai. Kembali ke Claude untuk:

1. Audit komprehensif satu-kali mencakup Task 1-8 Fase 2 (pola sama seperti
   audit Fase 0+1 sebelumnya) — verifikasi independen (jalankan ulang test,
   baca kode asli), bukan sekadar percaya laporan Codex.
2. Kalau Step 7 (uji manual PLHUT) sudah dijalankan dengan hasil nyata,
   itu jadi masukan penting untuk mendesain Fase 3 (PCKM synthesis) —
   bentuk `DrawingEvidenceSheet` hasil ekstraksi Qwen sungguhan (bukan
   skema kosong) akan mempengaruhi bagaimana PCKM menggabungkan halaman
   jadi satu project graph.
