# Drawing Intelligence Viewer and Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the real authorized PDF viewer fast, sharp, responsive and safe while removing the P2-P4/P6/P61 workspace failures.

**Architecture:** Preserve the original artifact authorization path, add conditional/range transport, and render only visible page tiles in browser workers with a byte-bounded cache. Keep thumbnails on a distinct low-resolution endpoint and use existing workspace state as the UI integration point.

**Tech Stack:** FastAPI/httpx, Next.js 15/React 19, pdf.js, TypeScript, Vitest, Playwright.

## Global Constraints

* Quantities are never calculated in TypeScript or by an LLM.
* Original PDF authorization, project isolation and signed artifact checks survive every transport change.
* No full-document pre-render, dummy page image, remote AI call or secret is permitted in tests.
* OpenTakeoff is Apache-2.0 reference-only unless copied material is separately attributed and noticed.
* `/api/document-intelligence` is the sole browser proxy for original PDF, thumbnail and DEM operations; `/api/drawing-intelligence` remains the DB/PCKM proxy.
* Capture same-laptop baseline before changing renderer and enforce: cold first-page median <=70% baseline, warm <=50%, pan p95 <=16.7ms, long task <=50ms, tile LRU <=96MiB, heap delta <=96MiB.

---

### Task 1: Authorised progressive artifact transport

**Files:**
- Modify: `services/document-intelligence/app/api/dem_routes.py`
- Modify: `apps/web/src/app/api/document-intelligence/[...path]/route.ts`
- Create: `services/document-intelligence/tests/test_dem_artifact_range.py`
- Create: `apps/web/src/app/api/document-intelligence/[...path]/route.test.ts`

**Interfaces:**
- Produces `GET /dem/{run_id}/artifact` with `Range`, `If-None-Match`, `ETag`, `Accept-Ranges`, `Content-Length`, `206`, and `304` semantics while retaining current project/run authorization.
- Produces a Next proxy response that streams body and preserves those safe headers.

- [ ] Write failing FastAPI tests for a full authorised response, `bytes=0-1023`, suffix range, invalid range (`416`), matching ETag (`304`), denied project, and missing artifact.
- [ ] Run `cd services/document-intelligence; python -m pytest tests/test_dem_artifact_range.py -q`; expected red result because range/conditional handling is absent.
- [ ] Implement a small `parse_single_range(header, size) -> tuple[int, int] | None` helper with explicit malformed/unsatisfiable distinction; emit bytes only after current authorization succeeds.
- [ ] Write failing proxy tests that assert status/body streaming and only `content-type`, `content-length`, `content-range`, `accept-ranges`, `etag`, and `cache-control` forward.
- [ ] Implement proxy header forwarding without reading the upstream response into memory.
- [ ] Run both focused suites; expected green result. Commit only these files as `feat(di): stream authorized PDF ranges`.

### Task 2: Tile viewer, thumbnail contract and minimap controls

**Files:**
- Create: `apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile-pyramid.ts`
- Create: `apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile.worker.ts`
- Create: `apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile-pool.ts`
- Modify: `apps/web/src/components/drawing-intelligence/workspace/canvas/drawing-canvas.tsx`
- Modify: `apps/web/src/components/drawing-intelligence/workspace/canvas/minimap.tsx`
- Modify: `apps/web/src/components/drawing-intelligence/workspace/canvas/canvas-toolbar.tsx`
- Modify: `apps/web/src/components/drawing-intelligence/workspace/workspace-store.tsx`
- Create: `apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile-pyramid.test.ts`
- Create: `apps/web/src/components/drawing-intelligence/workspace/canvas/minimap.test.tsx`
- Modify: `apps/web/src/components/drawing-intelligence/workspace/canvas/real-page-svg.tsx`
- Modify: `apps/web/src/components/drawing-intelligence/workspace/canvas/real-page-svg.test.ts`
- Modify: `apps/web/src/components/drawing-intelligence/workspace/status-bar.tsx`
- Create: `apps/web/src/components/drawing-intelligence/workspace/status-bar.test.tsx`

**Interfaces:**
- Produces `TilePyramid.visibleTiles(viewport, density): TileRequest[]`, `TileLru.set(key, image, bytes): void`, and `createPdfTilePool(): { open; request; close; dispose }`.
- Extends workspace canvas state with `minimap: { visible: boolean; minimized: boolean; position: { x: number; y: number } }`.
- Replaces `RealPageSvg` main-page rendering with `PdfPageLayer { pageUrl, naturalWidth, naturalHeight, elements }`; its image and overlays use one aspect-preserving transform, never `preserveAspectRatio="none"`.
- Produces `normalizeStatusMessage(value: unknown): string` and makes `TechnicalStatusBar` consume only that total function.

- [ ] Write failing tile tests for visible-first requests, fixed 512px tile bounds, device-density selection, byte-LRU eviction, protected visible tiles and bitmap release.
- [ ] Run `pnpm --filter @paax/web test -- pdf-tile-pyramid.test.ts`; expected red because the modules do not exist.
- [ ] Implement pure tile math and an OffscreenCanvas worker; use the authorized original PDF URL, not thumbnails, as the pdf.js source.
- [ ] Write failing minimap interaction tests for toolbar toggle, drag, minimise, close, reopening, and no viewport mutation from close.
- [ ] Implement those controls with keyboard labels and persisted workspace UI state.
- [ ] Write failing `real-page-svg.test.ts` assertions that reject `preserveAspectRatio="none"`, verify an intrinsic 4:3 page remains 4:3 inside a 16:9 viewport, and prove overlay bbox coordinates use the same `meet` transform.
- [ ] Replace/retire `RealPageSvg` from `drawing-canvas.tsx` main-page path; keep no stretched fallback image path.
- [ ] Write failing `status-bar.test.tsx` cases mounting `TechnicalStatusBar` in `takeoff`, `mission`, and `handoff` modes with `statusMessage: undefined as unknown`; assert a stable fallback label and no `pageerror`/TypeError.
- [ ] Implement `normalizeStatusMessage` and update all mode transitions to set a string status.
- [ ] Run focused Vitest tests and `pnpm --filter @paax/web exec tsc --noEmit`; expected green. Commit as `feat(di): add progressive tile viewer controls`.

### Task 3: Remove crash-prone placeholder actions and prove actual modes

**Files:**
- Modify: `apps/web/src/components/drawing-intelligence/workspace/takeoff/takeoff-inspector.tsx`
- Modify: `apps/web/src/components/drawing-intelligence/workspace/agentic/mission-control.tsx`
- Modify: `apps/web/src/components/drawing-intelligence/workspace/navigator/file-sheet-navigator.tsx`
- Create: `apps/web/src/components/drawing-intelligence/workspace/__tests__/workspace-mode-actions.test.tsx`
- Create: `apps/web/e2e/drawing-intelligence-real-viewer.spec.ts`
- Create: `scripts/live_test/run_drawing_intelligence_browser.ps1`

**Interfaces:**
- Takeoff and Mission buttons dispatch an explicit `loading | ready | error` state and render error recovery instead of throwing.
- Browser script accepts `-PdfPath 'G:\paax-data\gambar kerja\gambar-kerja-arsitektur-gedung-a.pdf'` and starts local services without any AI provider.

- [ ] Write failing component tests that click Takeoff and Mission with a rejected backend request and assert an error panel plus retry button.
- [ ] Run the focused test; expected red because current actions do not expose reliable recovery state.
- [ ] Implement backend-bound loading/retry state; remove â€œanalyzedâ€ noise and relabel the left navigation by its three view modes.
- [ ] Write Playwright tests that upload/open the 53-page fixture, wait for real initial page paint, pan/zoom, toggle/drag/minimise/close minimap, enter Takeoff and Mission, and assert no browser `pageerror`.
- [ ] Run `powershell -ExecutionPolicy Bypass -File scripts/live_test/run_drawing_intelligence_browser.ps1 -PdfPath 'G:\paax-data\gambar kerja\gambar-kerja-arsitektur-gedung-a.pdf'`; expected recorded HTML/trace/screenshots and green Playwright result.
- [ ] Visually inspect the six relevant screens at 1440px and 390px; record run IDs and timing, not a subjective â€œfastâ€ claim. Commit as `test(di): prove real viewer workspace modes`.

### Task 4: Same-laptop performance benchmark

**Files:**
- Create: `apps/web/e2e/fixtures/performance-baseline.json`
- Create: `apps/web/e2e/drawing-intelligence-performance.spec.ts`
- Create: `apps/web/e2e/performance-metrics.ts`
- Create: `scripts/live_test/record_drawing_intelligence_performance.ps1`
- Create: `report/report_drawing_intelligence/DI_VIEWER_PERFORMANCE_2026-07-26.md`

**Interfaces:**
- Produces `ViewerPerformanceSample { fixture_sha256, run_kind, first_contentful_page_ms, pan_frame_intervals_ms, long_tasks_ms, tile_cache_bytes, js_heap_delta_bytes, browser, viewport, dpr }`.
- Baseline JSON stores three cold and three warm samples before renderer changes; comparator rejects any missing provenance or threshold breach.

- [ ] Write failing comparator tests with a baseline-shaped fixture where each of cold paint, warm paint, p95 pan frame, long task, tile cache, and heap exceeds its stated limit.
- [ ] Run `pnpm --filter @paax/web test -- drawing-intelligence-performance`; expected red because instrumentation/baseline are absent.
- [ ] Record baseline on the same laptop/browser profile using the 53-page architecture file, then implement User Timing/PerformanceObserver and cache-byte reporting without analytics/network calls.
- [ ] Run three cold/three warm post-change samples; assert cold <=70% baseline, warm <=50%, p95 <=16.7ms, max long task <=50ms, LRU <=96MiB, heap delta <=96MiB; write raw results and comparison into the report.
- [ ] Commit as `test(di): gate viewer performance on measured baseline`.


