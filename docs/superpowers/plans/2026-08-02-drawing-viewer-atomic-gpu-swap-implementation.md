# Drawing Viewer Atomic GPU Swap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate Gambar Kerja viewer flicker and right-edge gaps by committing complete tile generations atomically, compositing tiles through WebGL2 when available, fitting with document-correct metrics, and proving the behavior with deterministic per-frame tests.

**Architecture:** `PdfPageLayer` remains the owner of document lifecycle and tile requests, but delegates geometry readiness to pure coverage/generation helpers and presentation to a renderer-independent compositor. The preferred compositor uploads worker-produced `ImageBitmap` tiles to one page-aligned WebGL2 surface; a Canvas2D implementation provides deterministic fallback. `DrawingCanvas` keeps pan/zoom off the React hot path, uses the browser GPU compositor for the single page surface, and never reuses metrics from another `runId:pageIndex`.

**Tech Stack:** React 19, TypeScript 5.7, Next.js 15, `pdfjs-dist` 4.10, Web Workers, `OffscreenCanvas`, `ImageBitmap`, WebGL2, Canvas2D, Vitest 4, Testing Library, Playwright 1.62.

## Global Constraints

- Run `graphify query`, `graphify path`, or `graphify explain` before source navigation in every task.
- Follow `G:\paax-ai-contextual-integration\AGENTS.md`; do not touch RAB/BoQ/schedule/Core Engine calculations.
- Preserve all user-owned dirty files and never use reset/restore/checkout to discard them.
- Write and run a failing regression test before every production behavior change.
- Use `opencode-go/deepseek-v4-flash --variant max` for implementation.
- Use `opencode-go/glm-5.2 --variant max` for adversarial review after every independently testable task.
- Use `opencode-go/gpt-5.6-luna` to monitor an OpenCode session that produces no terminal output for more than two minutes; request status without deleting the session.
- Prefer WebGL2 for composition; parsing and PDF rasterization remain CPU work inside workers.
- Never perform synchronous `getImageData`/`readPixels` in normal production rendering.
- WebGL2 and Canvas2D must obey identical coordinate, coverage, atomic-swap, and cleanup invariants.
- `TileLru` remains the sole `ImageBitmap.close()` owner. A compositor may copy a bitmap into a GPU texture or draw it, but must never close it; candidate and committed bitmap keys stay protected from LRU eviction until the corresponding manifest retires.
- The matching thumbnail underlay is a correctness fallback, not just a first-load decoration: it becomes visible whenever the committed manifest covers less than 99% of the current clipped viewport and hides only after coverage is restored.
- Do not add a PAAX battery-saver mode.
- Commit only task-scoped files, push to `codex/sheet-navigation-gallery-viewer-performance`, update PR #49, and never merge it.

---

## File structure

**Create**

- `apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile-coverage.ts` — pure rectangle clipping, union-area coverage, and generation readiness.
- `apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile-coverage.test.ts` — manual anchors and generation readiness regressions.
- `apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile-compositor.ts` — shared renderer interfaces, diagnostics, and renderer factory.
- `apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile-compositor-webgl.ts` — WebGL2 texture ownership and atomic frame draw.
- `apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile-compositor-canvas2d.ts` — Canvas2D fallback using the same frames.
- `apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile-compositor.test.ts` — fake WebGL/2D tests, atomic commit, release, and context-loss fallback.
- `apps/web/src/components/drawing-intelligence/workspace/canvas/drawing-canvas-fit.ts` — pure document-keyed fit decision helpers.
- `apps/web/src/components/drawing-intelligence/workspace/canvas/drawing-canvas-fit.test.ts` — different-aspect first-visit and revisit regressions.
- `apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile-worker-queue.ts` — bounded render queue/cancellation bookkeeping independent of worker globals.
- `apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile-worker-queue.test.ts` — queued cancellation and close-run cleanup tests.

**Modify**

- `apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-page-layer.tsx` — candidate/committed generations, coverage-ready callback, single compositor canvas, bounded timers, diagnostics.
- `apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-page-layer.test.tsx` — real-pyramid integration and atomic generation tests.
- `apps/web/src/components/drawing-intelligence/workspace/canvas/drawing-canvas.tsx` — document-keyed metrics, coverage-ready underlay, GPU-friendly transform.
- `apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile.worker.ts` — queue helper, cancellation cleanup, bounded close lifecycle.
- `apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile-pool.ts` — open-before-ready metrics sequencing, rejected-cache cleanup, request timeouts.
- `apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile-pool.test.ts` — open/close/reopen, concurrent page metrics, timeout regressions.
- `apps/web/src/components/drawing-intelligence/workspace/navigator/file-sheet-navigator.tsx` — stable `data-sheet-id` and `data-page-number` selectors.
- `apps/web/e2e/drawing-intelligence-canvas-coverage.spec.ts` — deterministic mode selection and per-animation-frame diagnostics.
- `docs/plans/2026-08-02-final-fix-viewer-flicker-right-crop.md` — correct overstated claims and append final evidence.

---

### Task 1: Pure viewport coverage and generation readiness

**Files:**

- Create: `apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile-coverage.ts`
- Create: `apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile-coverage.test.ts`

**Interfaces:**

- Produces:

```typescript
export interface LogicalRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GenerationCoverageInput {
  viewport: LogicalRect;
  page: LogicalRect;
  desiredVisibleTiles: readonly PdfTileRequest[];
  readyKeys: ReadonlySet<string>;
}

export function tileLogicalRect(tile: PdfTileRequest): LogicalRect;
export function clippedUnionCoverage(viewport: LogicalRect, page: LogicalRect, rects: readonly LogicalRect[]): number;
export function generationCoverage(input: GenerationCoverageInput): number;
export function isGenerationReady(input: GenerationCoverageInput, threshold?: number): boolean;
```

- Consumes: `PdfTileRequest` from `pdf-tile-pyramid.ts`.

- [ ] **Step 1: Run Graphify for the tile geometry path**

Run:

```powershell
graphify path "PdfPageLayer" "PdfTilePyramid"
graphify explain "PdfTileRequest"
```

- [ ] **Step 2: Write failing manual-anchor tests**

Add tests that prove:

```typescript
it('does not mark a four-tile viewport ready after only one tile', () => {
  const input = fourTileViewport();
  expect(generationCoverage({ ...input, readyKeys: new Set([input.desiredVisibleTiles[0].key]) })).toBeCloseTo(0.25, 5);
  expect(isGenerationReady({ ...input, readyKeys: new Set([input.desiredVisibleTiles[0].key]) })).toBe(false);
});

it('commits after clipped union coverage reaches 99 percent without double-counting overlap', () => {
  const input = rightEdgeViewportWithOverlappingTiles();
  expect(generationCoverage(input)).toBeGreaterThanOrEqual(0.99);
  expect(isGenerationReady(input)).toBe(true);
});

it('clips negative and beyond-page viewport coordinates to the page', () => {
  expect(clippedUnionCoverage(
    { x: -100, y: 0, width: 1300, height: 842 },
    { x: 0, y: 0, width: 1191, height: 842 },
    [{ x: 0, y: 0, width: 1191, height: 842 }],
  )).toBe(1);
});
```

- [ ] **Step 3: Run the new test and verify RED**

Run:

```powershell
pnpm --dir apps/web test -- src/components/drawing-intelligence/workspace/canvas/pdf-tile-coverage.test.ts
```

Expected: FAIL because `pdf-tile-coverage.ts` and its exports do not exist.

- [ ] **Step 4: Implement clipped rectangle-union coverage**

Use a deterministic x-sweep: convert raster tile coordinates to logical coordinates as `x / density`, `y / density`, `width / density`, and `height / density`; clip rectangles to `intersection(viewport, page)`; collect unique x boundaries; merge y intervals within every x strip; sum covered area; and divide by clipped viewport area. Return `0` for non-positive viewport area. `isGenerationReady` defaults to `0.99`. Keys absent from `desiredVisibleTiles` and desired keys absent from `readyKeys` contribute no area.

- [ ] **Step 5: Run Task 1 tests and existing pyramid tests**

```powershell
pnpm --dir apps/web test -- src/components/drawing-intelligence/workspace/canvas/pdf-tile-coverage.test.ts src/components/drawing-intelligence/workspace/canvas/pdf-tile-pyramid.test.ts
```

Expected: PASS.

- [ ] **Step 6: GLM 5.2 adversarial review**

Ask GLM to verify overlap is not double-counted, page clipping is correct, zero-area inputs fail closed, and the 99% threshold cannot be satisfied by stale/non-ready keys.

- [ ] **Step 7: Commit Task 1**

```powershell
git add -- apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile-coverage.ts apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile-coverage.test.ts
git commit -m "test(canvas): define deterministic tile generation coverage"
```

---

### Task 2: Renderer contract, WebGL2 compositor, and Canvas2D fallback

**Files:**

- Create: `apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile-compositor.ts`
- Create: `apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile-compositor-webgl.ts`
- Create: `apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile-compositor-canvas2d.ts`
- Create: `apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile-compositor.test.ts`

**Interfaces:**

```typescript
export type PdfTileRendererKind = 'webgl2' | 'canvas2d';

export interface CompositorTile {
  key: string;
  revision: number;
  bitmap: ImageBitmap;
  rect: LogicalRect;
}

export interface CompositorFrame {
  documentKey: string;
  generation: number;
  pageWidth: number;
  pageHeight: number;
  tiles: readonly CompositorTile[];
}

export interface CompositorDiagnostics {
  renderer: PdfTileRendererKind;
  committedGeneration: number | null;
  textureCount: number;
  estimatedTextureBytes: number;
  contextLost: boolean;
}

export interface PdfTileCompositor {
  readonly kind: PdfTileRendererKind;
  upload(tile: CompositorTile): void;
  commit(frame: CompositorFrame): void;
  render(): void;
  release(keys: Iterable<string>): void;
  diagnostics(): CompositorDiagnostics;
  dispose(): void;
}

export function createPdfTileCompositor(canvas: HTMLCanvasElement): PdfTileCompositor;
```

The factory returns one stable failover wrapper. The wrapper owns the current WebGL2 or Canvas2D backend and retains non-owning `CompositorTile` descriptors for uploaded/committed manifests so it can re-upload or redraw after context restoration. `TileLru` protects those keys, owns every supplied bitmap, and owns every call to `ImageBitmap.close()`; the wrapper must drop descriptors on `release`/`dispose` and never close a bitmap. The wrapper can replace the WebGL2 backend after repeated context loss without changing the object held by React.

- [ ] **Step 1: Run Graphify for cache and bitmap ownership**

```powershell
graphify path "PdfPageLayer" "TileLru"
graphify path "PdfTileDelivery" "TileLru"
```

- [ ] **Step 2: Write failing compositor contract tests**

Test with fake WebGL2 and fake Canvas2D contexts:

```typescript
it('prefers WebGL2 and atomically replaces the committed manifest', () => {
  const compositor = createWithFakeWebGl();
  compositor.upload(tile('a'));
  compositor.upload(tile('b'));
  compositor.commit(frame(1, ['a', 'b']));
  expect(compositor.diagnostics()).toMatchObject({ renderer: 'webgl2', committedGeneration: 1, textureCount: 2 });
});

it('does not expose a partially uploaded candidate before commit', () => {
  const compositor = createWithFakeWebGl();
  compositor.commit(frame(1, ['old']));
  compositor.upload(tile('new-left'));
  expect(lastDrawnKeys()).toEqual(['old']);
});

it('falls back to Canvas2D when WebGL2 creation fails', () => {
  expect(createWithNoWebGl().kind).toBe('canvas2d');
});

it('releases retired textures and resets byte accounting on dispose', () => {
  const compositor = createWithFakeWebGl();
  compositor.upload(tile('a', 512, 512));
  compositor.release(['a']);
  expect(compositor.diagnostics()).toMatchObject({ textureCount: 0, estimatedTextureBytes: 0 });
});
```

- [ ] **Step 3: Run compositor tests and verify RED**

```powershell
pnpm --dir apps/web test -- src/components/drawing-intelligence/workspace/canvas/pdf-tile-compositor.test.ts
```

Expected: FAIL because compositor modules do not exist.

- [ ] **Step 4: Implement the shared factory and Canvas2D fallback**

The factory requests `canvas.getContext('webgl2', { alpha: true, antialias: false, premultipliedAlpha: true })`; if it returns `null`, construct Canvas2D. Canvas2D draws only during `commit`/explicit render and never calls `getImageData`.

- [ ] **Step 5: Implement minimal WebGL2 compositor**

Use one program, one position buffer, one texture-coordinate buffer, and one texture per ready tile. The vertex shader converts page-normalized coordinates to clip space; the fragment shader samples one RGBA texture. `commit` replaces the manifest reference then schedules one `requestAnimationFrame` draw. Do not delete textures still referenced by the committed manifest.

Context loss behavior:

```typescript
canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  state.contextLost = true;
});
canvas.addEventListener('webglcontextrestored', rebuildOnce);
```

On the first loss, freeze the matching thumbnail/committed fallback, rebuild once after restoration from still-protected cache bitmaps, and request any missing visible tiles again. After a second loss, the stable wrapper replaces its backend with Canvas2D. Upload/commit methods receive cache-valid bitmaps again during the deterministic rebuild; the compositor does not privately retain or close bitmap objects.

- [ ] **Step 6: Run compositor tests and TypeScript**

```powershell
pnpm --dir apps/web test -- src/components/drawing-intelligence/workspace/canvas/pdf-tile-compositor.test.ts
pnpm --dir apps/web exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: GLM 5.2 review**

Require review of texture ownership, bitmap ownership, context loss, shader coordinate orientation, alpha seams, byte accounting, and the guarantee that upload alone cannot alter the visible frame.

- [ ] **Step 8: Commit Task 2**

```powershell
git add -- apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile-compositor.ts apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile-compositor-webgl.ts apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile-compositor-canvas2d.ts apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile-compositor.test.ts
git commit -m "feat(canvas): add atomic WebGL2 tile compositor"
```

---

### Task 3: Integrate atomic generations into PdfPageLayer

**Files:**

- Modify: `apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-page-layer.tsx`
- Modify: `apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-page-layer.test.tsx`

**Interfaces:**

- Consumes `generationCoverage`, `isGenerationReady`, `createPdfTileCompositor`, and `CompositorFrame` from Tasks 1–2.
- Changes callback from first-tile semantics to a bidirectional viewport-coverage signal:

```typescript
onCoverageChange?: (event: {
  documentKey: string;
  generation: number;
  ready: boolean;
  coverage: number;
  renderer: PdfTileRendererKind;
}) => void;
```

- Exposes diagnostics on the layer DOM:

```text
data-document-key
data-renderer-kind
data-committed-generation
data-coverage-ready
data-coverage-ratio
data-texture-count
data-context-lost
```

- [ ] **Step 1: Graphify the layer lifecycle**

```powershell
graphify explain "PdfPageLayer"
graphify path "PdfPageLayer" "PdfTilePool"
```

- [ ] **Step 2: Write failing layer regressions using the real tile pyramid**

Add tests without spying on `visibleTiles`:

```typescript
it('keeps the committed generation until every visible candidate tile is ready', async () => {
  const pool = controlledPoolForTwoColumns();
  renderNormalizedFitLayer(pool);
  resolveOnlyLeftTile(pool);
  expect(layer()).toHaveAttribute('data-committed-generation', '0');
  expect(layer()).toHaveAttribute('data-coverage-ready', 'false');
  resolveRightTile(pool);
  expect(layer()).toHaveAttribute('data-coverage-ready', 'true');
});

it('normalizes a viewport with width and height above one through the production wiring', async () => {
  renderNormalizedFitLayer(controlledPool());
  expect(requestedTileColumns()).toEqual(expect.arrayContaining([0, 1]));
});

it('continuous 100ms viewport churn cannot postpone retirement past the absolute deadline', async () => {
  vi.useFakeTimers();
  // change viewport twenty times, advancing 100ms each time
  expect(staleGenerationCount()).toBeLessThanOrEqual(1);
});
```

- [ ] **Step 3: Run layer tests and verify RED**

```powershell
pnpm --dir apps/web test -- src/components/drawing-intelligence/workspace/canvas/pdf-page-layer.test.tsx
```

Expected: FAIL because one tile currently triggers replacement semantics and no compositor diagnostics exist.

- [ ] **Step 4: Replace the painted-map transition with committed/candidate generation state**

Maintain refs/state for:

```typescript
interface RenderGeneration {
  id: number;
  documentKey: string;
  desiredVisibleTiles: PdfTileRequest[];
  desiredRequestTiles: PdfTileRequest[];
  desiredAllKeys: Set<string>;
  readyKeys: Set<string>;
  startedAt: number;
  retireDeadline: number;
}
```

Build `desiredVisibleTiles` with `pyramid.visibleTiles(logicalViewport, 0)` so overscan never gates readiness. Build `desiredRequestTiles` with `OVERSCAN_MARGIN_PCT` and request its superset. Cached valid bitmaps enter `readyKeys` immediately. Deliveries enter only when request identity, open generation, document key, and render generation still match. Compute readiness after every ready-key update. Commit one `CompositorFrame` only when `isGenerationReady` passes.

- [ ] **Step 5: Replace first-paint callback and timer recursion**

At candidate start, evaluate the currently committed manifest against the new clipped viewport and emit `onCoverageChange({ ready: false, ... })` only when it covers less than 99%; this makes `DrawingCanvas` reveal the matching thumbnail. After atomic commit, emit `ready: true` exactly once for that render generation. Ignore stale-document callbacks. Use an absolute `retireDeadline`; timeout callbacks compare `performance.now()` with the captured deadline and never recursively reschedule forever. Give tile requests a bounded abort deadline supplied by the pool.

- [ ] **Step 6: Render a single compositor canvas**

Replace per-tile `<TileCanvas>` elements with one `<canvas>` owned by the compositor. Keep the same page-relative layout for this task; `DrawingCanvas` supplies GPU-friendly parent transform in Task 4. Dispose compositor and release retired keys on document change/unmount.

- [ ] **Step 7: Run layer, coverage, compositor, and pool tests**

```powershell
pnpm --dir apps/web test -- src/components/drawing-intelligence/workspace/canvas/pdf-tile-coverage.test.ts src/components/drawing-intelligence/workspace/canvas/pdf-tile-compositor.test.ts src/components/drawing-intelligence/workspace/canvas/pdf-page-layer.test.tsx src/components/drawing-intelligence/workspace/canvas/pdf-tile-pool.test.ts
```

Expected: PASS.

- [ ] **Step 8: GLM 5.2 review**

Ask GLM to construct adversarial sequences: pan before first tile, zoom while detail tiles arrive, A→B stale delivery, one failed tile, cache eviction between upload and commit, continuous pan, unmount with pending request, and WebGL context loss.

- [ ] **Step 9: Commit Task 3**

```powershell
git add -- apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-page-layer.tsx apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-page-layer.test.tsx
git commit -m "fix(canvas): swap complete PDF tile generations atomically"
```

---

### Task 4: Document-correct fit and coverage-ready underlay

**Files:**

- Create: `apps/web/src/components/drawing-intelligence/workspace/canvas/drawing-canvas-fit.ts`
- Create: `apps/web/src/components/drawing-intelligence/workspace/canvas/drawing-canvas-fit.test.ts`
- Modify: `apps/web/src/components/drawing-intelligence/workspace/canvas/drawing-canvas.tsx`

**Interfaces:**

```typescript
export type FitAspectSource = 'pdf-cache' | 'pdf-metrics' | 'sheet-dimensions';

export interface FitRecord {
  documentKey: string;
  aspect: number;
  source: FitAspectSource;
}

export function documentKeyFor(runId: string, pageIndex: number): string;
export function shouldApplyFit(previous: FitRecord | null, next: FitRecord, epsilon?: number): boolean;
```

- [ ] **Step 1: Graphify DrawingCanvas fit dependencies**

```powershell
graphify explain "DrawingCanvas"
graphify path "DrawingCanvas" "PdfPageLayer"
```

- [ ] **Step 2: Write failing fit-decision tests**

```typescript
it('never treats previous-sheet PDF metrics as the new sheet fallback', () => {
  expect(documentKeyFor('run-a', 0)).not.toBe(documentKeyFor('run-a', 1));
  expect(shouldApplyFit(
    { documentKey: 'run-a:0', aspect: 0.7, source: 'pdf-metrics' },
    { documentKey: 'run-a:1', aspect: 1.4, source: 'sheet-dimensions' },
  )).toBe(true);
});

it('does not refit the same document for equivalent exact metrics', () => {
  const record = { documentKey: 'run-a:1', aspect: 1.414, source: 'pdf-metrics' } as const;
  expect(shouldApplyFit(record, { ...record, aspect: 1.4141 }, 0.005)).toBe(false);
});
```

- [ ] **Step 3: Verify RED, then implement helpers**

```powershell
pnpm --dir apps/web test -- src/components/drawing-intelligence/workspace/canvas/drawing-canvas-fit.test.ts
```

Expected before implementation: FAIL because helper module does not exist. Expected after minimal implementation: PASS.

- [ ] **Step 4: Fix DrawingCanvas metrics ownership**

Replace `computeAspect(null)` fallback behavior with an explicit active `documentKey`. On sheet switch, look up only that key. `handleMetrics` captures the callback's document key and ignores it unless it still equals the active key. Record the aspect actually used by `fitSheetForRecord(record)`; never compare new metrics with `baseH/baseW` recomputed from those same metrics.

- [ ] **Step 5: Keep underlay until coverage-ready**

Replace `layerPainted`/`onFirstPaint` with `onCoverageChange` state keyed by document and render generation. `ready: false` reveals the matching underlay before a viewport transition can expose a transparent region; `ready: true` hides it only after atomic commit. A callback from another document or an older generation cannot change the current underlay. Keep the underlay mounted beneath the compositor so revealing it changes no geometry. Ensure underlay and compositor use identical aspect, absolute bounds, and z-order.

- [ ] **Step 6: Move pan/zoom to GPU-friendly transform**

Use `translate3d(${panX}px, ${panY}px, 0) scale(${zoom})` on the single page surface so the browser's compositor performs pan/zoom on the GPU; do not create one compositing layer per tile. Apply `will-change: transform` only while dragging/wheel settling, then remove it to release compositor memory. Do not add React state updates on every animation frame.

- [ ] **Step 7: Run fit and viewer tests**

```powershell
pnpm --dir apps/web test -- src/components/drawing-intelligence/workspace/canvas/drawing-canvas-fit.test.ts src/components/drawing-intelligence/workspace/canvas/pdf-page-layer.test.tsx
pnpm --dir apps/web exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 8: GLM 5.2 review and commit**

Review first visit/revisit, two different page ratios in one run, stale metrics callback, resize during loading, user zoom before metrics, and pointer-up transform convergence.

```powershell
git add -- apps/web/src/components/drawing-intelligence/workspace/canvas/drawing-canvas-fit.ts apps/web/src/components/drawing-intelligence/workspace/canvas/drawing-canvas-fit.test.ts apps/web/src/components/drawing-intelligence/workspace/canvas/drawing-canvas.tsx
git commit -m "fix(canvas): bind fit and underlay readiness to PDF document"
```

---

### Task 5: Worker and pool lifecycle hardening

**Files:**

- Create: `apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile-worker-queue.ts`
- Create: `apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile-worker-queue.test.ts`
- Modify: `apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile.worker.ts`
- Modify: `apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile-pool.ts`
- Modify: `apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile-pool.test.ts`

**Interfaces:**

```typescript
export class PdfTileWorkerQueue<T extends { requestId: number; documentKey: string }> {
  enqueue(message: T): void;
  cancel(requestId: number): void;
  take(): T | null;
  removeDocument(documentKey: string, runId: string): T[];
  complete(requestId: number): void;
  get pendingCount(): number;
  get cancelledCount(): number;
}
```

Extend pool options:

```typescript
export interface PdfTilePoolOptions {
  hardwareConcurrency?: number;
  workerFactory?: () => PdfTileWorker;
  now?: () => number;
  requestTimeoutMs?: number;
}
```

- [ ] **Step 1: Graphify worker/pool lifecycle**

```powershell
graphify path "createPdfTilePool" "pdf-tile.worker.ts"
graphify explain "PdfTilePoolOptions"
```

- [ ] **Step 2: Write failing queue and pool tests**

```typescript
it('removes a cancelled queued request when take skips it', () => {
  const queue = new PdfTileWorkerQueue<RenderMessage>();
  queue.enqueue(renderMessage(1));
  queue.cancel(1);
  expect(queue.take()).toBeNull();
  expect(queue.cancelledCount).toBe(0);
});

it('waits for initial document readiness before requesting another page metrics', async () => {
  const { pool, workers } = setupControlledPool();
  const pageOne = pool.open(source('run:0', 1));
  const pageTwo = pool.open(source('run:1', 2));
  expect(messagesOfType(workers[0], 'get-page-metrics')).toHaveLength(0);
  readyAllWorkers(workers, 'run:0');
  await pageOne;
  expect(messagesOfType(workers[0], 'get-page-metrics')).toHaveLength(1);
  await expect(pageTwo).resolves.toMatchObject({ width: expect.any(Number) });
});

it('removes rejected page metrics from cache so close and reopen can retry', async () => {
  // reject metrics, reopen same page, then emit successful metrics
});

it('times out a tile request and clears pending maps', async () => {
  vi.useFakeTimers();
  const handle = poolWithTimeout(1000).request(request);
  await vi.advanceTimersByTimeAsync(1001);
  await expect(handle.promise).rejects.toThrow('timed out');
});
```

- [ ] **Step 3: Run queue/pool tests and verify RED**

```powershell
pnpm --dir apps/web test -- src/components/drawing-intelligence/workspace/canvas/pdf-tile-worker-queue.test.ts src/components/drawing-intelligence/workspace/canvas/pdf-tile-pool.test.ts
```

- [ ] **Step 4: Implement queue cleanup and pool sequencing**

Use the queue helper in the worker; cancelling queued work is consumed/deleted by `take`. In the pool, a second page open chains `existing.promise.then(() => requestPageMetrics(...))`. Attach rejection cleanup that deletes the exact cached promise only if it is still current.

- [ ] **Step 5: Add bounded request timers**

Store timer handles in pending tile/metrics records. Clear them on success, cancellation, worker failure, close, and dispose. Timeout posts cancel to the worker and rejects all consumers deterministically.

- [ ] **Step 6: Bound document retention**

Keep reuse within one run, but make `closeRun` the only destructive PDF teardown and call it when no viewer consumer owns the run. Destroy worker PDF documents, clear pages/queues, and delete the source buffer. Do not destroy a run merely because the user changes page within that same run.

- [ ] **Step 7: Run worker/pool/layer tests and TypeScript**

```powershell
pnpm --dir apps/web test -- src/components/drawing-intelligence/workspace/canvas/pdf-tile-worker-queue.test.ts src/components/drawing-intelligence/workspace/canvas/pdf-tile-pool.test.ts src/components/drawing-intelligence/workspace/canvas/pdf-page-layer.test.tsx
pnpm --dir apps/web exec tsc --noEmit
```

- [ ] **Step 8: GLM 5.2 review and commit**

Review cancellation at every queue position, multiple consumers, late worker messages, timeout versus delivery race, page switch during open, close page versus close run, worker crash, context disposal, and request ID cleanup.

```powershell
git add -- apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile-worker-queue.ts apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile-worker-queue.test.ts apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile.worker.ts apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile-pool.ts apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile-pool.test.ts
git commit -m "fix(canvas): bound PDF worker queues and request lifecycle"
```

---

### Task 6: Deterministic real-browser flicker and GPU verification

**Files:**

- Modify: `apps/web/src/components/drawing-intelligence/workspace/navigator/file-sheet-navigator.tsx`
- Modify: `apps/web/e2e/drawing-intelligence-canvas-coverage.spec.ts`
- Modify: `docs/plans/2026-08-02-final-fix-viewer-flicker-right-crop.md`

**Interfaces:**

Production selectors:

```tsx
<article data-sheet-id={sheet.id} data-page-number={view.page_number} />
```

Per-frame diagnostic sample:

```typescript
interface ViewerFrameSample {
  timestamp: number;
  documentKey: string | null;
  renderer: 'webgl2' | 'canvas2d' | null;
  generation: number | null;
  coverageReady: boolean;
  coverageRatio: number;
  fallbackVisible: boolean;
  textureCount: number;
  contextLost: boolean;
}
```

- [ ] **Step 1: Graphify the workspace mode and navigator paths**

```powershell
graphify path "ModeTabs" "DrawingCanvas"
graphify path "FileSheetNavigator" "DrawingCanvas"
```

- [ ] **Step 2: Make E2E preconditions deterministic**

At the start of every test:

```typescript
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.getByRole('tab', { name: /^Review\b/ }).click();
await expect(page.getByRole('tab', { name: /^Review\b/ })).toHaveAttribute('aria-selected', 'true');
await page.locator('[data-page-number="1"]').first().click();
```

First deliberately click Quantities and reload in one test, then prove setup still selects Review.

- [ ] **Step 3: Write the failing per-frame acceptance test**

Install an in-page `requestAnimationFrame` sampler before interaction. During 10 pans, six zoom-in/out steps, fit, and sheet A→B→A, fail if any sample has `coverageRatio < 0.99` while `fallbackVisible === false`. Require the WebGL2 renderer on the normal Chromium project and Canvas2D on a context-disabled project.

- [ ] **Step 4: Verify the E2E test fails against incomplete behavior**

Run the official stack exactly as documented in:

`G:\paax-ai-contextual-integration\PANDUAN_INSTALASI_DAN_MENJALANKAN_SEMUA_SERVER_PAAX.md`

Then run:

```powershell
pnpm --dir apps/web exec playwright test e2e/drawing-intelligence-canvas-coverage.spec.ts --project=chromium --reporter=line
```

Expected before all integration is complete: FAIL with a specific uncovered frame or missing diagnostics, not a timeout waiting in Quantities.

- [ ] **Step 5: Complete only the instrumentation needed by the test**

Do not read GPU pixels each frame. Read the production coverage/helper diagnostics and fallback visibility. At final stable checkpoints only, capture screenshots and optionally perform a one-time WebGL pixel readback in test code to detect an entirely transparent compositor surface.

- [ ] **Step 6: Persist artifacts outside Playwright's overwritten result folder**

Copy final screenshots, JSON frame samples, console errors, renderer diagnostics, and performance measurements to:

`apps/web/e2e/results/drawing-viewer-atomic-gpu/`

Include viewport, DPR, commit hash, renderer, worker count, p95 frame interval, maximum uncovered ratio, maximum texture count, and context-loss result.

- [ ] **Step 7: Run complete verification**

```powershell
pnpm --dir apps/web test
pnpm --dir apps/web exec tsc --noEmit
pnpm --dir apps/web build
pnpm --dir apps/web exec playwright test e2e/drawing-intelligence-canvas-coverage.spec.ts --project=chromium --reporter=line
```

Also run DPR 2 and forced Canvas2D fallback configurations. Every command must exit 0 before a completion claim.

- [ ] **Step 8: Update the final report honestly**

Correct the previous DB/session diagnosis, distinguish first-run historical evidence from fresh final evidence, list WebGL2 versus fallback results, record any CI failures outside this commit, and remove claims not supported by fresh artifacts.

- [ ] **Step 9: Final GLM 5.2 audit**

Provide GLM the spec, this plan, complete diff, test logs, E2E JSON samples, and screenshots. Require a severity-ranked verdict and explicit confirmation that tests cannot pass from stale canvases, persisted Quantities mode, or one-tile readiness.

- [ ] **Step 10: Update Graphify, commit, and push**

```powershell
graphify update .
git add -- apps/web/src/components/drawing-intelligence/workspace/navigator/file-sheet-navigator.tsx apps/web/e2e/drawing-intelligence-canvas-coverage.spec.ts apps/web/e2e/results/drawing-viewer-atomic-gpu docs/plans/2026-08-02-final-fix-viewer-flicker-right-crop.md docs/superpowers/plans/2026-08-02-drawing-viewer-atomic-gpu-swap-implementation.md
git commit -m "test(canvas): prove atomic GPU viewer continuity in browser"
git push origin codex/sheet-navigation-gallery-viewer-performance
```

Stop after updating PR #49. Do not merge.

---

## Plan self-review

- Every design requirement maps to a task: coverage and atomicity (Tasks 1/3), GPU/fallback (Task 2), underlay and fit (Task 4), bounded lifecycle (Task 5), deterministic real-browser proof (Task 6).
- Every production behavior change begins with a named failing test and an expected failure reason.
- Shared type names are consistent across tasks: `LogicalRect`, `CompositorTile`, `CompositorFrame`, `PdfTileCompositor`, `FitRecord`, and `PdfTileWorkerQueue`.
- No placeholder implementation steps remain.
- Overscan, concurrency, and GPU are not used to hide coordinate or coverage bugs.
- Work remains scoped to the viewer, navigator test selectors, tests, artifacts, and reports.
