> **STATUS: HISTORICAL/SUPERSEDED** -- lihat [DI_SOURCE_OF_TRUTH.md](file:///G:/paax-ai-main/docs/plans/drawing%20intelligence/DI_SOURCE_OF_TRUTH.md) untuk kondisi terkini

# Instruksi Codex — Task 4 sampai 8 (DEM/PCKM Phase 0+1)

> Plan sumber: `docs/superpowers/plans/2026-07-14-dem-pckm-phase0-1-schemas.md`
> Task 1-3 sudah selesai (commit `6b18bb2`, `05ed95a`, `931893b` di branch
> `feat/command-room-model-overhaul`). File ini berisi instruksi lengkap untuk
> Task 4-8 — jalankan **berurutan**, jangan loncat, karena tiap task
> memperluas file yang sama dengan hasil task sebelumnya.

## Cara pakai

Untuk tiap task di bawah: copy blok prompt-nya (di dalam ```` ``` ````) ke
Codex — baik lewat `codex exec` non-interaktif maupun sesi interaktif biasa.
Contoh command non-interaktif (PowerShell, dari `G:\paax-ai-main`):

```powershell
# Ganti N dengan nomor task (4, 5, 6, 7, 8)
Get-Content "G:\paax-ai-main\.superpowers\sdd\codex-task-N-prompt.txt" -Raw | codex exec --dangerously-bypass-approvals-and-sandbox -C "G:\paax-ai-main" -c model_reasoning_effort=medium -o "G:\paax-ai-main\.superpowers\sdd\codex-task-N-output.md"
```

Setelah tiap task selesai, cek baris pertama file output-nya:
- **`Status: DONE`** → lanjut ke task berikutnya.
- **`DONE_WITH_CONCERNS` / `BLOCKED` / `NEEDS_CONTEXT`** → **jangan lanjut**,
  tunjukkan isi laporannya dulu sebelum lanjut ke task berikutnya.

Brief lengkap tiap task (kode Pydantic/Zod penuh, bukan ringkasan) sudah
diekstrak ke `G:\paax-ai-main\.superpowers\sdd\task-N-brief.md` (N = 4..8) —
setiap prompt di bawah merujuk ke file itu.

---

## Task 4 — PCKM graph node schema

```text
You are implementing Task 4 of an 8-task implementation plan in the PAAX AI monorepo (repo root: G:\paax-ai-main, branch: feat/command-room-model-overhaul — stay on this branch).

## Task Description

Read your task brief first: G:\paax-ai-main\.superpowers\sdd\task-4-brief.md

It contains the complete task text, including full, ready-to-use Pydantic and Zod/TypeScript code. This is a transcription + verification task — follow it precisely, do not redesign shapes, do not add fields the brief doesn't specify, do not skip any step.

## Context

Tasks 1-3 are already complete and committed. Task 2 created `services/document-intelligence/app/transcription/models.py` and appended a "DEM — Drawing Evidence Model" section to `packages/schemas/src/index.ts`. Task 3 extended both with manifest/continuation-patch schemas. This task (Task 4) starts a NEW, separate module for a different subsystem: `services/document-intelligence/app/project_graph/` (does not exist yet — you create it, following the exact same package-init pattern Task 2 used for `app/transcription/`), and appends a NEW "PCKM — Project Construction Knowledge Model graph" section to `packages/schemas/src/index.ts` (after the DEM section, not touching it).

## Codebase exploration — use graphify, not blind grep

Run `graphify query "<your question>"` before exploring — hard project convention (CLAUDE.md section 7). Example: `graphify query "packages/schemas index.ts DEM section end, where PCKM section should be appended"`.

## Git — commit locally when done, but do NOT push, do NOT open a PR, do NOT merge

`git add` exactly the files this task specifies, `git commit` with the brief's Step 9 suggested message. Local commit only — no push, PR, or merge. Stay on `feat/command-room-model-overhaul`.

## Known parity pitfall — read before writing any Zod code

A prior task in this same plan had a review find two Pydantic/Zod parity bugs: Zod `.nullable()` was used where Pydantic's `Optional[X] = None` needed `.nullish()` (nullable requires the key present; nullish allows omission too), and Zod numeric fields had extra `.nonnegative()`/`.positive()` bounds Pydantic's plain `int` fields didn't have. Both schemas must accept identical JSON shapes. Transcribe the brief's Zod code (Step 7) exactly as given — it has already been corrected for this issue — do not add your own extra strictness beyond what the brief specifies, and do not loosen anything the brief specifies either.

## Your job

1. Read the task brief in full.
2. Confirm `services/document-intelligence/app/project_graph/` does not exist yet (it shouldn't — this task creates it).
3. Follow the brief's 9 steps: write the failing Python test, confirm it fails for the stated reason (ModuleNotFoundError), create the `__init__.py` and `models.py`, confirm the test passes, write the failing jest test, confirm it fails, add the Zod schemas, confirm jest passes, then commit.
4. Self-review: field-by-field Pydantic/Zod parity check, no extra/missing fields, clean test output.

## Report format

- Status: DONE, DONE_WITH_CONCERNS, BLOCKED, or NEEDS_CONTEXT
- RED/GREEN commands and outcomes for both pytest and jest
- Commit SHA and message
- Files changed (note: this task creates the `app/project_graph/` directory)
- Any concerns
- Confirm: "No git push, PR, or merge was performed."
```

---

## Task 5 — PCKM graph edge schema + containment invariant

```text
You are implementing Task 5 of an 8-task implementation plan in the PAAX AI monorepo (repo root: G:\paax-ai-main, branch: feat/command-room-model-overhaul — stay on this branch).

## Task Description

Read your task brief first: G:\paax-ai-main\.superpowers\sdd\task-5-brief.md

It contains the complete task text, including full, ready-to-use Pydantic and Zod/TypeScript code. This is a transcription + verification task — follow it precisely, do not redesign shapes, do not add fields the brief doesn't specify, do not skip any step.

## Context

Task 4 (already complete and committed) created `services/document-intelligence/app/project_graph/models.py` with `ProjectGraphNode` and its nested models, plus a matching Zod "PCKM" section in `packages/schemas/src/index.ts`. This task (Task 5) EXTENDS the same two files: append `ProjectGraphEdge` and a standalone validator function `assert_single_located_on()` to `models.py`, and append `ProjectGraphEdgeSchema` to the Zod PCKM section. Check the current end-of-file state of both files first so you append correctly without duplicating Task 4's work.

`assert_single_located_on()` is a plain Python function (not a Pydantic method, not a class) that enforces an invariant: a node may have at most one active `LOCATED_ON` edge. It raises `ValueError` when violated. This is deliberately NOT enforced automatically on a single edge — it's checked against a full `list[ProjectGraphEdge]`, because the invariant is only checkable once you have every edge for a node. Task 6 (not this task) will call this function from a Pydantic model_validator on the full graph snapshot — this task only defines the function and tests it directly, it does not wire it into any model yet.

## Codebase exploration — use graphify, not blind grep

Run `graphify query "<your question>"` before exploring — hard project convention (CLAUDE.md section 7).

## Git — commit locally when done, but do NOT push, do NOT open a PR, do NOT merge

Local commit only, message per the brief's Step 9. No push, PR, or merge.

## Known parity pitfall — read before writing any Zod code

A prior task's review found Zod `.nullable()` used where Pydantic's `Optional[X] = None` needed `.nullish()`, and extra Zod numeric bounds Pydantic didn't have. Transcribe the brief's Zod code exactly as given (it's already correct) — do not add or remove strictness on your own judgment.

## Your job

1. Read the task brief in full.
2. Check the current end of `services/document-intelligence/app/project_graph/models.py` and the PCKM section of `packages/schemas/src/index.ts` to confirm where Task 4 left off.
3. Follow the brief's 9 steps: failing pytest (ImportError for `ProjectGraphEdge`), add `EdgeRelation`, `ConfidenceClass`, `EdgeResolver`, `ProjectGraphEdge`, and `assert_single_located_on`, confirm pytest passes (5 tests total including Task 4's 2), failing jest, add `EdgeRelationEnum`, `ConfidenceClassEnum`, `EdgeResolverSchema`, `ProjectGraphEdgeSchema`, confirm jest passes, then commit.
4. Self-review: does `assert_single_located_on` raise exactly the error message format the brief's test expects (`"{node_id} has {count} active LOCATED_ON edges"`)? Field parity check as usual.

## Report format

- Status: DONE, DONE_WITH_CONCERNS, BLOCKED, or NEEDS_CONTEXT
- RED/GREEN commands and outcomes
- Commit SHA and message
- Files changed
- Any concerns
- Confirm: "No git push, PR, or merge was performed."
```

---

## Task 6 — PCKM graph snapshot schema

```text
You are implementing Task 6 of an 8-task implementation plan in the PAAX AI monorepo (repo root: G:\paax-ai-main, branch: feat/command-room-model-overhaul — stay on this branch).

## Task Description

Read your task brief first: G:\paax-ai-main\.superpowers\sdd\task-6-brief.md

It contains the complete task text, including full, ready-to-use Pydantic and Zod/TypeScript code. Follow it precisely.

## Context

Tasks 4-5 (already complete and committed) built `ProjectGraphNode` and `ProjectGraphEdge` + `assert_single_located_on()` in `services/document-intelligence/app/project_graph/models.py`, with matching Zod schemas in `packages/schemas/src/index.ts`. This task (Task 6) adds the TOP-LEVEL `ProjectGraphSnapshot` Pydantic model that wraps lists of nodes/edges and calls `assert_single_located_on()` (from Task 5, already in the same file) via a Pydantic `@model_validator(mode="after")` — this requires you to add `model_validator` to the existing `from pydantic import BaseModel, Field` import line at the top of `models.py` (the brief's Step 3 shows the exact updated import line — replace the existing import line, do not add a second separate import line).

IMPORTANT — deliberate Pydantic/Zod asymmetry in THIS task only: the Zod side does NOT replicate the `assert_single_located_on` cross-field invariant check (Zod's plain `.object()` has no direct equivalent without `.superRefine()`, and this phase intentionally keeps the Zod schema a pure shape check — the invariant is authoritative on the Python/backend side only, since that's where snapshots are actually constructed). The brief's own jest test (Step 5) explicitly tests that the Zod side does NOT throw on a duplicate-LOCATED_ON payload, with a code comment explaining this is intentional, not a bug. Do not try to "fix" this by adding `.superRefine()` to the Zod schema — the brief does not ask for that, and the codebase's global constraints for this plan don't require it. Follow the brief exactly, including this asymmetry.

## Codebase exploration — use graphify, not blind grep

Run `graphify query "<your question>"` before exploring — hard project convention (CLAUDE.md section 7).

## Git — commit locally when done, but do NOT push, do NOT open a PR, do NOT merge

Local commit only, message per the brief's Step 9. No push, PR, or merge.

## Known parity pitfall — read before writing any Zod code

Prior tasks' reviews found Zod `.nullable()` used where `.nullish()` was needed, and extra Zod numeric bounds Pydantic didn't have. Transcribe the brief's code exactly as given.

## Your job

1. Read the task brief in full.
2. Check the current end of both files to confirm where Task 5 left off.
3. Follow the brief's 9 steps: failing pytest (ImportError for `ProjectGraphSnapshot`), update the pydantic import line to add `model_validator`, add `ProjectGraphSnapshot` with its `_check_located_on_invariant` validator calling `assert_single_located_on(self.edges)`, confirm pytest passes (7 tests total), failing jest, add `ProjectGraphSnapshotSchema` (no invariant enforcement, per the brief), confirm jest passes, then commit.
4. Self-review: confirm the Pydantic model actually raises `ValidationError` (not a bare `ValueError` escaping unwrapped — Pydantic v2 wraps a `model_validator`'s raised `ValueError` into a `ValidationError` automatically, so raising plain `ValueError` inside the validator, as the brief's code does, is correct) on the duplicate-LOCATED_ON test case.

## Report format

- Status: DONE, DONE_WITH_CONCERNS, BLOCKED, or NEEDS_CONTEXT
- RED/GREEN commands and outcomes
- Commit SHA and message
- Files changed
- Any concerns
- Confirm: "No git push, PR, or merge was performed."
```

---

## Task 7 — Command Room query plan + grounded answer schema

```text
You are implementing Task 7 of an 8-task implementation plan in the PAAX AI monorepo (repo root: G:\paax-ai-main, branch: feat/command-room-model-overhaul — stay on this branch).

## Task Description

Read your task brief first: G:\paax-ai-main\.superpowers\sdd\task-7-brief.md

It contains the complete task text, including full, ready-to-use Pydantic and Zod/TypeScript code. Follow it precisely. This is the LAST schema task in the plan (Task 8, which someone will run after you, is a small unrelated root `package.json` change, not a schema task).

## Context

Tasks 4-6 (already complete and committed) built the PCKM graph subsystem (`ProjectGraphNode`, `ProjectGraphEdge`, `ProjectGraphSnapshot`) in `services/document-intelligence/app/project_graph/models.py` and `packages/schemas/src/index.ts`. This task (Task 7) adds the LAST piece: `GraphQueryPlan` and `GroundedAnswer` (Command Room's query/answer contract) to the SAME two files — append at the end of both.

This task has two extra verification steps beyond the usual pattern (the brief's Step 5 and Step 10) — do not skip them:
- After the Python tests pass, run the FULL `services/document-intelligence` test suite (not just this task's new file) to confirm zero regressions across everything built in Tasks 2-7.
- After the jest tests pass, run the TypeScript typecheck for `packages/schemas` to confirm zero compile errors across everything built in Tasks 2-7.

## Codebase exploration — use graphify, not blind grep

Run `graphify query "<your question>"` before exploring — hard project convention (CLAUDE.md section 7).

## Git — commit locally when done, but do NOT push, do NOT open a PR, do NOT merge

Local commit only, message per the brief's Step 11. No push, PR, or merge.

## Known parity pitfall — read before writing any Zod code

Prior tasks' reviews found Zod `.nullable()` used where `.nullish()` was needed, and extra Zod numeric bounds Pydantic didn't have. Transcribe the brief's code exactly as given — it is already correct.

## Your job

1. Read the task brief in full.
2. Check the current end of both files to confirm where Task 6 left off.
3. Follow the brief's 11 steps in order: failing pytest (ImportError for `GraphQueryPlan`), add `QueryIntent`, `QueryEntity`, `GraphQueryPlan`, `Citation`, `RetrievalTrace`, `GroundedAnswer`, confirm pytest passes (9 tests total in this file), **run the FULL document-intelligence suite** (`cd services/document-intelligence && python -m pytest -q`) and confirm zero failures across everything, failing jest, add the matching Zod schemas, confirm jest passes, **run typecheck** (`cd packages/schemas && pnpm run typecheck`) and confirm zero errors, then commit.
4. Self-review: field parity, clean test output, confirm the two extra whole-suite/typecheck steps actually ran and passed (don't skip them even though the individual-file tests already passed — they check for regressions the single-file test can't see).

## Report format

- Status: DONE, DONE_WITH_CONCERNS, BLOCKED, or NEEDS_CONTEXT
- RED/GREEN commands and outcomes for pytest and jest
- Full-suite pytest result (pass count, zero failures)
- typecheck result (zero errors)
- Commit SHA and message
- Files changed
- Any concerns
- Confirm: "No git push, PR, or merge was performed."
```

---

## Task 8 — wiring root `pnpm test` (final task)

```text
You are implementing Task 8 (the final task) of an 8-task implementation plan in the PAAX AI monorepo (repo root: G:\paax-ai-main, branch: feat/command-room-model-overhaul — stay on this branch).

## Task Description

Read your task brief first: G:\paax-ai-main\.superpowers\sdd\task-8-brief.md

It is short — a single small change to the root `package.json`, unrelated to the schema work Tasks 2-7 did.

## Context

Tasks 1-7 are already complete and committed, adding DEM/PCKM Pydantic+Zod schemas across `services/document-intelligence` and `packages/schemas`. This final task closes a pre-existing gap: the root `pnpm test` script never ran `services/document-intelligence`'s pytest suite (it only ran `test:core` and `test:schemas`), even though Tasks 2-7 added real tests there. This task adds a `test:doc-intel` script and wires it into the root `test` script.

## Git — commit locally when done, but do NOT push, do NOT open a PR, do NOT merge

Local commit only, message per the brief's Step 3. No push, PR, or merge.

## Your job

1. Read the task brief in full.
2. Make exactly the two `package.json` edits it specifies (the `test` script line, and the new `test:doc-intel` line).
3. Run `pnpm test` from the repo root and confirm ALL THREE suites pass in order: `test:core` (core-engine pytest), `test:doc-intel` (document-intelligence pytest, includes everything Tasks 2-7 added), `test:schemas` (packages/schemas jest, includes everything Tasks 2-7 added). This is the final verification gate for the entire 8-task plan — if anything here fails, stop and report BLOCKED with the exact failure, do not attempt to fix code outside this task's scope (a failure here would mean an earlier task has an undiscovered bug — report it precisely, do not guess a fix).
4. Self-review: did you touch only `package.json`? Is the new script line exactly the sibling of the existing `test:core` pattern (same `cd <dir> && python -m pytest -q` shape)?
5. Commit.

## Report format

- Status: DONE, DONE_WITH_CONCERNS, BLOCKED, or NEEDS_CONTEXT
- Full `pnpm test` output summary (pass/fail count for all 3 suites)
- Commit SHA and message
- Confirm: "No git push, PR, or merge was performed."

If this task reports DONE cleanly, all 8 tasks of the plan `docs/superpowers/plans/2026-07-14-dem-pckm-phase0-1-schemas.md` are complete.
```

---

## Setelah Task 8 selesai

Kabari Claude (sesi ini atau sesi baru, tunjukkan file `.superpowers/sdd/progress.md`
dan `.superpowers/sdd/codex-task-*-output.md` sebagai bukti) untuk menjalankan
**satu audit komprehensif** mencakup seluruh branch (Task 1-8 sekaligus),
bukan per-task, sesuai kesepakatan menghemat usage sesi ini.
