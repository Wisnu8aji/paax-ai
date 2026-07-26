# Universal Sheet Classification and Indexing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide universal, evidence-backed level, classification and original-order sheet views with real lightweight thumbnails.

**Architecture:** Extend the existing `SheetSemanticProfile` rule classifier and derived navigator selector; preserve source page identity. AI is a validation-gated abstention fallback and never rewrites source page order.

**Tech Stack:** Python/Pydantic, React/TypeScript, Vitest, pytest, Playwright.

## Global Constraints

* Source PDF page order/page number is immutable.
* Classification rules remain project-agnostic; unknown is explicit, never fabricated.
* Human approval is required before a novel AI category becomes reusable metadata.
* Thumbnails are low-resolution derivatives, not viewer pages.
* The 53-page architecture PDF is used only for viewer/classification tests; it is not a quantity/engine fixture.

---

### Task 1: Canonical view-index contract

**Files:**
- Modify: `services/document-intelligence/app/drawing_intelligence/models.py`
- Modify: `services/document-intelligence/app/drawing_intelligence/sheet_identity.py`
- Create: `services/document-intelligence/app/drawing_intelligence/sheet_views.py`
- Create: `services/document-intelligence/tests/test_sheet_views.py`
- Modify: `apps/web/src/components/drawing-intelligence/drawing-intelligence-api.ts`
- Modify: `apps/web/src/components/drawing-intelligence/workspace/di-types.ts`
- Modify: `packages/schemas/src/index.ts`
- Modify: `packages/schemas/python/paax_schemas/measurement.py`
- Modify: `packages/schemas/src/__tests__/schemas.test.ts`
- Create: `packages/schemas/python/tests/test_sheet_view_schema.py`

**Interfaces:**
- Produces `build_sheet_views(pages: list[PageIntelligence]) -> SheetViews` containing `level`, `classification`, and `source` arrays of `SheetViewEntry { page_index, page_number, level_key, classification_key, evidence_refs, status }`.
- Zod/Pydantic schemas define the same enum keys and source-order invariant.

- [ ] Write failing Python tests for site, foundation, L1, L2, roof, detail, section, elevation and schedule ordering; write category tests for cover, drawing-list, site-plan, plan, elevation, section, detail, schedule, diagram and technical-note; write a source-order equality test.
- [ ] Run `cd services/document-intelligence; python -m pytest tests/test_sheet_views.py -q`; expected red because `build_sheet_views` is absent.
- [ ] Implement pure derived-index functions from existing semantic evidence without any project name/sheet-number special case.
- [ ] Write failing schema-parity tests serialising an identical `SheetViews` example in Zod and Pydantic.
- [ ] Implement matching schemas in the same commit and run focused Python/schema tests; expected green. Commit as `feat(di): add immutable sheet view indexes`.

### Task 2: Unknown review, bounded classification assist and thumbnails

**Files:**
- Modify: `services/document-intelligence/app/perception/ai_assist/client.py`
- Create: `services/document-intelligence/app/perception/ai_assist/sheet_classification_assist.py`
- Create: `services/document-intelligence/tests/test_sheet_classification_assist.py`
- Modify: `services/document-intelligence/app/api/dem_routes.py`
- Create: `services/document-intelligence/tests/test_dem_thumbnail_routes.py`

**Interfaces:**
- Produces `suggest_sheet_classification(context: SheetClassificationContext, client) -> SheetClassificationProposal | None` only when deterministic confidence is below its defined review threshold.
- Produces `GET /dem/{run_id}/pages/{page_index}/thumbnail?width=320` as an authorised cached derivative response.

- [ ] Write failing assist tests for fast-path no-call, proposal source-text/bbox validation, unknown-category `needs_review`, client failure, and denied auto-commit.
- [ ] Run the focused test; expected red because the assist module is absent.
- [ ] Implement bounded request payload (title, extracted text fragments, bbox/evidence IDs, allowed categories) and deterministic proposal validation/audit record.
- [ ] Write failing thumbnail tests for authorization, 320px maximum width, correct content type, ETag and non-equivalence to `/artifact` bytes.
- [ ] Implement the thumbnail derivative endpoint using existing artifact storage only after authorization. Run both focused suites; expected green. Commit as `feat(di): add reviewed sheet classification and thumbnails`.

### Task 3: Navigator views and real-browser verification

**Files:**
- Modify: `apps/web/src/components/drawing-intelligence/workspace/navigator/file-sheet-navigator.tsx`
- Modify: `apps/web/src/components/drawing-intelligence/workspace/navigator/sheet-gallery.tsx`
- Modify: `apps/web/src/components/drawing-intelligence/workspace/sheet-mapping.ts`
- Modify: `apps/web/src/components/drawing-intelligence/workspace/workspace-store.tsx`
- Create: `apps/web/src/components/drawing-intelligence/workspace/navigator/sheet-view-mode.test.tsx`
- Create: `apps/web/e2e/drawing-intelligence-sheet-views.spec.ts`

**Interfaces:**
- UI selector has exactly `Level`, `Classification`, and `Original order`; selection changes only the derived list.
- Rows expose `page_number`, status/reason, and thumbnail URL; unassigned is a review state with a manual classification action.

- [ ] Write failing UI tests for all three labels, classification-within-level ordering, immutable original order, unassigned explanation, and thumbnail `img` source.
- [ ] Run `pnpm --filter @paax/web test -- sheet-view-mode.test.tsx`; expected red.
- [ ] Implement selector and derived rendering; remove ambiguous â€œlevel treeâ€ terminology and keep page numbers visible.
- [ ] Run focused Vitest and `pnpm --filter @paax/web exec tsc --noEmit`; expected green.
- [ ] Run Playwright against the 53-page fixture and visually inspect each view; assert original mode page numbers equal API source order. Commit as `feat(di): expose universal sheet navigation`.


