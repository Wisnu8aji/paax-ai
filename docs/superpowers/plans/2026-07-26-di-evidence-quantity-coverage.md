# Evidence-to-Quantity Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route evidence-backed work-item candidates to the existing Core Engine contracts and expose truthful coverage, review, quantities and handoff.

**Architecture:** Inventory the existing bridge registry first, normalize candidate eligibility into an explicit dispatch record, call only an existing Core Engine endpoint, and preserve blocked/review states where inputs/contracts are incomplete. The web app displays final numbers only when server result authority is `core_engine`.

**Tech Stack:** FastAPI/httpx/Pydantic, Core Engine Python, Zod, React, pytest/Vitest/Playwright.

## Global Constraints

* No new formula, derived quantity, dummy row, default zero or TypeScript arithmetic.
* Existing routes are `/tkg/takeoff` (beton/bekisting/besi) and `/takeoff/{tanah,dinding,arsitektur,baja,atap,kusen,mep,mep-advanced,smkk}`; unsupported combinations are blocked/review.
* Pydantic and Zod changes ship and test together.
* Final `sourceAuthority` must be `core_engine`; AI proposals and raw occurrence counts are not final quantities.
* `/api/drawing-intelligence` is the DB/PCKM/coverage proxy; `/api/document-intelligence` owns DEM package intelligence. Do not mix their responsibilities.
* PLHUT PDF plus existing DEM/PCKM artifacts are read-only integration fixtures here; no transcription, extraction, or new 88-page AI analysis may be started.

---

### Task 1: Lossless candidate inventory and lazy active-sheet context

**Files:**
- Modify: `services/document-intelligence/app/drawing_intelligence/human_delivery.py`
- Modify: `services/document-intelligence/app/api/dem_routes.py`
- Modify: `services/db/src/paax_db/main.py`
- Create: `services/db/src/paax_db/project_graph_sheet_context.py`
- Create: `services/document-intelligence/tests/test_human_delivery_candidate_inventory.py`
- Create: `services/db/tests/test_project_graph_sheet_context.py`
- Modify: `apps/web/src/components/drawing-intelligence/drawing-intelligence-api.ts`
- Modify: `apps/web/src/components/drawing-intelligence/workspace/use-backend-sync.ts`
- Modify: `apps/web/src/components/drawing-intelligence/workspace/workspace-store.tsx`
- Create: `apps/web/src/components/drawing-intelligence/workspace/use-backend-sync.test.tsx`

**Interfaces:**
- Produces a lossless `CandidateInventoryRow { candidate_id, origin: 'dem'|'pckm'|'consolidated_registry', work_item_id?, page_index, evidence_refs, category, coverage_status, dropped_reason?: never }` for every input candidate; `coverage_status` is one of `ready`, `calculated`, `needs_review`, or `blocked`.
- Produces `GET /api/drawing-intelligence/projects/{projectId}/project-graph/sheets/{pageIndex}/context` with only active-sheet nodes, edges, evidence references and review rows; no whole graph is returned.
- `fetchActiveSheetContext(projectId, pageIndex)` is called by `useBackendSync`/workspace selection and updates only that sheet's overlays/review data.

- [ ] Write failing document-intelligence tests with DEM, PCKM and consolidated-registry candidates that assert identical input/output ID sets, including unsupported candidates represented as `blocked` and no silent drop.
- [ ] Run `cd services/document-intelligence; python -m pytest tests/test_human_delivery_candidate_inventory.py -q`; expected red because delivery does not expose a lossless inventory.
- [ ] Implement inventory preservation in `human_delivery.py` and return it from the existing document-intelligence package route without calculating any value.
- [ ] Write failing DB route tests for project isolation, active-sheet-only node/evidence scope, missing page, and a guard that rejects unbounded graph payloads.
- [ ] Implement the DB context query/route and API client; retain `/api/drawing-intelligence` as its proxy.
- [ ] Write failing `use-backend-sync` tests: workspace open makes no graph-context call; selecting sheet 7 makes exactly one page-7 call; selection change replaces overlays; `graphData` is no longer permanently null.
- [ ] Implement active-sheet effect/cache in store/sync; run focused pytest/Vitest and `tsc --noEmit`; expected green. Commit as `feat(di): load lossless coverage and lazy sheet context`.

### Task 2: Deterministic capability registry and coverage report

**Files:**
- Create: `services/document-intelligence/app/perception/takeoff_capability_registry.py`
- Modify: `services/document-intelligence/app/perception/work_items.py`
- Create: `services/document-intelligence/tests/test_takeoff_capability_registry.py`
- Modify: `services/document-intelligence/tests/test_perception_work_items.py`
- Modify: `services/core-engine/app/main.py`
- Modify: `services/core-engine/tests/test_takeoff.py`

**Interfaces:**
- Produces `resolve_takeoff_capability(category: str, work_type: str | None) -> TakeoffCapability { endpoint, required_fields, source_authority, status }`.
- Produces `CoverageRow { work_id, category, evidence_refs, required_fields, missing_fields, endpoint, readiness, source_authority }`; no `endpoint` means `blocked`.

- [ ] Write failing registry tests covering TKG `beton/bekisting/besi`, registered tanah/dinding/arsitektur/baja/atap/kusen/mep bridges, an unknown category, and missing required evidence.
- [ ] Run `cd services/document-intelligence; python -m pytest tests/test_takeoff_capability_registry.py tests/test_perception_work_items.py -q`; expected red.
- [ ] Implement registry entries by reusing bridge request field names and Core Engine route contracts; do not duplicate formula strings or formula code.
- [ ] Add Core Engine contract tests that assert accepted known request shapes and reject missing/extra-incompatible inputs before calculation.
- [ ] Run focused document-intelligence/Core Engine suites; expected green. Commit as `feat(di): inventory deterministic takeoff capability`.

### Task 3: Generalise calculation boundary and authority contract

**Files:**
- Modify: `services/document-intelligence/app/drawing_intelligence/calculation_bridge.py`
- Modify: `services/document-intelligence/app/api/dem_routes.py`
- Modify: `services/document-intelligence/app/drawing_intelligence/models.py`
- Create: `services/document-intelligence/tests/test_calculation_bridge_dispatch.py`
- Modify: `apps/web/src/components/drawing-intelligence/drawing-intelligence-api.ts`
- Modify: `apps/web/src/components/drawing-intelligence/workspace/di-types.ts`
- Modify: `apps/web/src/components/drawing-intelligence/workspace/quantity-authority.ts`
- Modify: `apps/web/src/components/drawing-intelligence/workspace/quantity-authority.test.ts`

**Interfaces:**
- Replaces column-only request construction with `build_calculation_request(item, capability, ...) -> EngineDispatch | CalculationNotReady`.
- `WorkItemCalculation` gains `source_authority: Literal['core_engine']` only after validated engine response; non-calculated candidates retain `none`.

- [ ] Write failing dispatch tests for column, beam, wall, foundation and MEP candidates with real evidence fixtures; assert route selection, no formula in the dispatch payload, no dispatch on open conflict/missing fields, and no source authority on failure.
- [ ] Run focused pytest; expected red because calculation bridge is column-only.
- [ ] Implement registry-driven dispatch and response mapping. Retain a detailed blocked reason and source page/evidence references.
- [ ] Write failing frontend tests rejecting `none`/`measurement_fact` as a final calculated total and accepting only `core_engine` calculation rows.
- [ ] Implement types and display guard; run Python/Vitest tests and `pnpm --filter @paax/web exec tsc --noEmit`; expected green. Commit as `feat(di): dispatch evidence to core engine only`.

### Task 4: Remove production dummy data and prove real coverage UI

**Files:**
- Modify: `apps/web/src/components/drawing-intelligence/workspace/workspace-store.tsx`
- Modify: `apps/web/src/components/drawing-intelligence/workspace/dock/quantity-dock.tsx`
- Modify: `apps/web/src/components/drawing-intelligence/workspace/inspector/processing-overlay.tsx`
- Modify: `apps/web/src/components/drawing-intelligence/workspace/di-mock-data.ts`
- Create: `apps/web/src/components/drawing-intelligence/workspace/__tests__/no-production-di-mock-imports.test.ts`
- Create: `scripts/quality/check_no_production_di_dummy.py`
- Create: `services/document-intelligence/tests/test_no_synthetic_delivery_claims.py`

**Interfaces:**
- Production workspace imports zero identifiers from `di-mock-data.ts`; that file is test-fixture-only or moved under a test fixture path.
- `check_no_production_di_dummy.py` rejects production imports, the literal `2.4MB`, synthetic thumbnail URLs, mock aggregate/100%-ready claims, and `replace-quantities` sources that are not real backend coverage/inventory responses.

- [ ] Write failing source-scan tests against the current production imports in workspace store, quantity dock and processing overlay; assert tests/fixtures remain allowed.
- [ ] Run `python scripts/quality/check_no_production_di_dummy.py`; expected red on the current workspace.
- [ ] Remove production imports/paths and replace each view value with either backend data or an honest empty/not-ready state; do not delete test fixtures required by tests.
- [ ] Write failing delivery tests rejecting synthetic page, thumbnail, item-count, ready-total and aggregate claims without provenance.
- [ ] Run source scan plus document-intelligence tests; expected green. Commit as `fix(di): remove production mock workspace data`.

### Task 5: Review, quantities, handoff and coverage browser gate

**Files:**
- Modify: `apps/web/src/components/drawing-intelligence/workspace/dock/quantity-dock.tsx`
- Modify: `apps/web/src/components/drawing-intelligence/workspace/dock/quantities-mode.tsx`
- Modify: `apps/web/src/components/drawing-intelligence/workspace/dock/handoff-mode.tsx`
- Modify: `apps/web/src/components/drawing-intelligence/workspace/inspector/intelligence-inspector.tsx`
- Create: `apps/web/src/components/drawing-intelligence/workspace/dock/quantity-coverage.test.tsx`
- Create: `apps/web/e2e/drawing-intelligence-quantity-authority.spec.ts`

**Interfaces:**
- Quantities display description, unit, engine-result quantity, source page label (`p.N`) and status; no formula string/full source blob is rendered.
- Handoff rejects any selected row where `sourceAuthority !== 'core_engine'` or status is `blocked/review`.

- [ ] Write failing UI tests for concise source page label, hidden formula, explicit review reason, non-selectable blocked row, and handoff rejection of non-engine rows.
- [ ] Run focused Vitest; expected red.
- [ ] Implement row states and review link to the evidence page/bbox; remove fake 100% readiness and dummy aggregate claims.
- [ ] Run Playwright against read-only PLHUT DEM/PCKM artifacts and a real local Core Engine process: assert every inventory candidate is shown once, unsupported candidates are blocked/review, and a supported approved candidate makes an actual Core Engine call whose response renders `sourceAuthority: core_engine`. Fake Engine is permitted only in lower-level contract tests.
- [ ] Visually inspect Quantity, Review and Handoff screens. Commit as `feat(di): make quantity coverage and handoff truthful`.


