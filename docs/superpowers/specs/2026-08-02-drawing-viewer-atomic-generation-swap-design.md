# Drawing Viewer Atomic Generation Swap Design

**Date:** 2026-08-02

**Status:** Approved design, pending written-spec review

**Repository:** `G:\paax-ai-contextual-integration`

**Branch:** `codex/sheet-navigation-gallery-viewer-performance`

**Related PR:** `#49`

## 1. Problem statement

The Gambar Kerja PDF viewer can still flicker, expose temporarily blank areas, or fit a newly selected sheet with the previous sheet's aspect ratio. Commit `82190eb9` correctly replaced the ambiguous viewport-coordinate heuristic with an explicit `viewportSpace` contract, but its generation transition is not atomic: one new tile is currently treated as sufficient replacement coverage for an older generation.

The current end-to-end test also cannot prove the absence of flicker. It depends on persisted workspace mode, samples only after 300 ms delays, counts canvas DOM nodes rather than painted pixels, and can count stale canvases as valid right-edge coverage.

## 2. Goals

1. Never expose a blank viewport region during initial PDF paint, pan, zoom, resize, fit, or sheet navigation when a thumbnail or previous generation is available.
2. Swap tile generations only after the current visible viewport is covered by ready base-density tiles.
3. Preserve the explicit normalized/logical viewport contract and at least 99% right-edge coverage.
4. Fit each sheet using metrics belonging to that exact `runId:pageIndex`; never use metrics from the previously active sheet.
5. Make Playwright tests deterministic and capable of observing transient blank frames.
6. Keep worker queues, cancellation records, timers, PDF documents, image bitmaps, cache entries, and canvas nodes bounded.
7. Favor smoothness over minimal CPU/GPU usage. No PAAX battery-saver mode is introduced.
8. Use GPU compositing for tile presentation, pan, zoom, scaling, and generation swap whenever WebGL2 is available; keep CPU work off the browser main thread where practical.

## 3. Non-goals

- No changes to quantity, RAB, BoQ, schedule, Core Engine, or AI calculation paths.
- No redesign of the Drawing Intelligence workspace navigation.
- No database or schema migration.
- No replacement of `pdfjs-dist` or the existing tile pyramid.
- No automatic merge to `main`.

## 4. Chosen architecture

Use an **atomic generation swap with a persistent fallback layer and a GPU-first compositor**.

Each viewport change creates a render generation with four explicit sets:

- `desiredBaseKeys`: base-density tiles required to cover the visible viewport plus configured overscan.
- `readyBaseKeys`: desired base tiles whose bitmap is present and paintable.
- `desiredDetailKeys`: optional settled high-detail tiles; these never gate base readiness.
- `retainedKeys`: tiles from the currently committed generation kept until the candidate generation is ready.

A candidate generation becomes committable only when every visible, non-overscan base tile is ready, or when deterministic rectangle-union coverage proves at least 99% of the logical visible viewport is covered. Tile existence alone is not readiness, and one tile from the candidate generation is never treated as full coverage.

The previous committed generation and/or thumbnail remains visible until the candidate is committed. The swap occurs in one state transition and one compositor frame. Detail tiles may replace base tiles progressively after the atomic base swap without hiding base coverage.

PDF parsing and vector-to-raster execution inside `pdf.js` remain CPU work and run in Web Workers. The browser main thread does not synchronously rasterize PDF pages. Completed `ImageBitmap` tiles are transferred to the presentation layer, where WebGL2 is preferred for texture upload, transforms, clipping, scaling, and generation composition. The design does not claim that `pdf.js` rasterization itself becomes GPU-native.

When WebGL2 is unavailable, context creation fails, or the context is lost repeatedly, the viewer falls back to Canvas2D presentation without changing coordinate, coverage, or generation invariants.

## 5. Generation state and data flow

1. `DrawingCanvas` calculates a normalized viewport and sends `viewportSpace="normalized"`.
2. `PdfPageLayer` converts it once to logical PDF coordinates.
3. The tile pyramid returns visible base tiles and optional overscan tiles.
4. `PdfPageLayer` creates a monotonically increasing candidate generation.
5. Cached tiles are marked ready only when a valid bitmap exists.
6. Missing tiles are requested through the pool with generation identity and document identity.
7. Stale deliveries are claimed/released safely but cannot mutate the active candidate.
8. Coverage is evaluated against the clipped logical viewport, not the whole page and not canvas CSS style alone.
9. When the readiness invariant passes, the candidate becomes the committed generation atomically.
10. Retained tiles are removed according to an absolute eviction deadline; continuous viewport updates do not indefinitely reset their lifetime.

### 5.1 GPU compositor

The preferred presentation path uses one page-aligned WebGL2 canvas clipped by the viewer viewport instead of one DOM canvas per visible tile.

- Each ready `ImageBitmap` is uploaded to a texture associated with its tile key and revision.
- Logical tile rectangles are transformed to clip space in the vertex shader.
- Pan and zoom update the single page-surface transform; they do not redraw PDF vectors or recreate React tile elements.
- Committed and candidate generations have separate texture/key manifests.
- The candidate manifest becomes active only after the production coverage helper reports readiness.
- Generation swap occurs at an animation-frame boundary so a frame cannot contain a partially replaced manifest.
- Texture deletion follows the same bounded LRU and generation-retention rules as bitmap deletion.
- `webglcontextlost` freezes a valid fallback/committed frame and starts one bounded recovery attempt.
- `webglcontextrestored` rebuilds textures from retained bitmaps where possible and requests missing visible base tiles otherwise.
- Repeated context loss activates Canvas2D fallback for the session.

The compositor is isolated behind a renderer interface so correctness remains renderer-independent:

```typescript
interface PdfTileCompositor {
  upload(tileKey: string, revision: number, bitmap: ImageBitmap): void;
  commit(frame: CompositorFrame): void;
  render(transform: PageTransform): void;
  release(tileKeys: Iterable<string>): void;
  dispose(): void;
}
```

WebGL2 and Canvas2D implementations consume the same generation and geometry. Unit tests use a deterministic fake compositor without mocking the coverage calculation.

## 6. Coverage invariant

The production readiness rule and tests use the same pure geometry helper.

For every desired base tile:

- Convert its raster tile rectangle back to logical PDF coordinates using its density.
- Intersect it with the current logical viewport clipped to the page bounds.
- Compute union coverage without double-counting overlaps.

The candidate is ready when either:

- all non-overscan visible base keys are ready; or
- union coverage divided by clipped visible viewport area is at least `0.99`.

Overscan improves future pan smoothness but does not gate the initial atomic swap. Detail-density tiles never reduce readiness once base coverage is committed.

## 7. Fallback and first paint

`onFirstPaint` is replaced by a bidirectional coverage-change signal keyed by document and render generation. The thumbnail underlay must not disappear after only the first tile, and it must become visible again before a pan/zoom/resize candidate exposes an area not covered by the committed manifest.

Fallback priority:

1. Current committed tile generation.
2. Matching sheet thumbnail/low-resolution underlay.
3. Loading indicator only when neither is available.

The underlay stays mounted beneath the tile page and uses the same page aspect and positioning. Toggling its visibility must not change geometry. A short opacity transition is allowed only after coverage readiness and must respect reduced-motion preferences; correctness does not depend on the transition.

## 8. Sheet metrics and single-fit

Metrics are keyed by a `documentKey` derived from `runId:pageIndex`.

Rules:

- A sheet switch clears the active metrics reference before any fallback calculation can read metrics from the previous sheet.
- Cached metrics for the new document may be used immediately.
- If exact PDF metrics are not cached, the thumbnail dimensions may establish provisional geometry, but the code must explicitly record that the fit is provisional.
- Exact PDF metrics trigger at most one corrective fit for the active document, guarded by `lastFittedDocumentKey` and a recorded aspect source.
- The comparison must use the aspect that was actually used for the previous fit, not `baseH/baseW` recomputed from the newly received metrics.
- Metrics callbacks from stale documents are ignored.

## 9. Pan and zoom behavior

- Pointer movement remains an imperative CSS transform on each animation frame.
- On the WebGL2 path, tile geometry is transformed to clip space by the compositor, while pan and zoom move the single page-aligned surface through `translate3d(... ) scale(...)` at the animation-frame boundary so the browser GPU compositor handles interaction. The implementation must not create one compositor layer per tile or redraw PDF vectors on the main thread.
- React viewport synchronization may remain throttled, but it must not reset an absolute stale-tile deadline indefinitely.
- On pointer release, the committed canvas state and imperative transform must converge in the same event batch.
- Zoom creates a new candidate base generation while the committed generation or underlay stays visible.
- High-detail requests begin only after the base generation is committed and zoom has settled.
- Tile request priority is: visible missing base tiles, direction-of-travel overscan, remaining overscan, then detail.

## 10. Worker and pool lifecycle

Required safeguards:

- Remove cancelled request IDs when queued work is skipped, not only when a render function runs.
- Do not request another page's metrics from a worker until the run's document-open promise is ready.
- A rejected page-metrics promise must be removed from `pageMetricsCache` so reopen can retry.
- Every tile and metrics request has a bounded timeout and deterministic rejection path.
- Eviction retry timers stop when their generation is obsolete or their deadline expires.
- PDF document and source-buffer retention is bounded per run and released by `closeRun`/pool disposal.
- Concurrent rendering remains configurable. Concurrency two per worker is retained only if real-browser measurement shows improvement without instability.
- `ImageBitmap` transfer remains zero-copy where supported. Normal rendering must not call `getImageData`, because synchronous pixel readback stalls GPU compositing.
- WebGL texture memory is included in the viewer budget and released on LRU eviction, generation retirement, context loss, and disposal.
- Tests cover open-during-open, close-before-ready, close/reopen, queued cancellation, late delivery, worker error, and disposal.

## 11. Deterministic test design

### 11.1 Unit and integration tests

Tests must be written and observed failing before production changes.

Required regressions:

1. One ready tile from a multi-tile candidate does not commit the generation.
2. Candidate commits exactly once after visible base coverage reaches at least 99%.
3. Previous generation remains mounted until candidate commit.
4. Continuous viewport changes every 100 ms do not extend stale-tile lifetime beyond the documented absolute bound.
5. The underlay remains until viewport coverage is ready.
6. A first visit to a sheet with a different aspect never fits using the previous sheet's metrics.
7. Open page A, request page B before A is ready, then close/reopen both pages without a rejected-promise cache trap.
8. Cancelling queued worker requests leaves no cancelled-ID backlog.
9. An unresolved request reaches a bounded timeout and cannot keep an eviction timer alive forever.
10. WebGL2 compositor commits a complete generation in one frame and releases retired textures.
11. WebGL context loss preserves valid fallback coverage and either restores textures or selects Canvas2D deterministically.

### 11.2 Playwright E2E

The E2E setup must explicitly:

- Navigate to the Drawing Intelligence URL.
- Select the Review workspace tab, regardless of persisted session state.
- Select an exact sheet using stable identifiers, not partial text such as `p.1` that can match `p.10`.
- Wait for the expected `documentKey` and coverage-ready generation.

Flicker sampling runs inside the browser on every `requestAnimationFrame` during pan, zoom, fit, and A → B → A navigation. Each frame records:

- active document key;
- committed generation;
- visible viewport rectangle;
- painted current-generation tile rectangles;
- fallback visibility;
- uncovered viewport ratio;
- canvas count and stale-generation count.
- renderer kind (`webgl2` or `canvas2d`), committed texture count, and context-loss state.

A frame fails only when uncovered viewport area exceeds 1% **and** neither a valid committed generation nor the matching fallback covers it. DOM canvas count or CSS right edge alone is not accepted as painted coverage.

Playwright artifacts must be copied to a stable report directory before a later run can overwrite `test-results`.

## 12. Acceptance criteria

- Explicit `viewportSpace` remains in production and its integration path is tested without mocking the tile pyramid.
- Right-edge logical coverage is at least 99% at DPR 1 and DPR 2.
- No sampled animation frame has an uncovered viewport greater than 1% without valid fallback coverage.
- No generation commits after only one tile unless that tile truly covers at least 99% of the clipped viewport.
- First visit and revisit of different-aspect sheets use the correct document metrics and perform no wrong-aspect fit.
- Pan, zoom, fit, and A → B → A navigation pass on a fresh context and after deliberately setting persisted mode to Quantities.
- Worker queues, cancellation sets, timers, pending maps, canvas nodes, and retained generations return to documented bounds after interaction settles.
- A WebGL2-capable browser confirms the GPU compositor is active and pan/zoom do not perform Canvas2D pixel readback.
- Forced WebGL2 unavailability and context loss pass the same correctness tests through Canvas2D fallback.
- GPU texture count and estimated texture bytes return to documented bounds after generations retire.
- Relevant Vitest suites, full web suite, `tsc --noEmit`, production build, and deterministic Playwright spec pass.
- Existing user changes outside the viewer remain untouched.
- Work is pushed to a review branch and PR; it is not merged by the implementing agent.

## 13. Rollout and rollback

Implementation is split into independently reviewable commits:

1. Honest failing tests and deterministic E2E setup.
2. Pure coverage helper and atomic generation state.
3. Renderer interface, WebGL2 compositor, and deterministic Canvas2D fallback.
4. Underlay readiness and document-keyed fitting.
5. Worker/pool lifecycle hardening.
6. Final real-browser evidence, GPU/fallback benchmarks, and report corrections.

Rollback can revert these commits in reverse order. No data migration or backend rollback is required.

## 14. Agent roles

- `opencode-go/deepseek-v4-flash`: primary TDD implementation, always invoked with `--variant max` and Graphify first.
- `opencode-go/glm-5.2`: adversarial review of renderer correctness, worker lifecycle, race conditions, bounds, and test honesty, always invoked with `--variant max` and Graphify first.
- `opencode-go/gpt-5.6-luna`: monitor silent OpenCode sessions after two minutes and request status without terminating the conversation.
- Kimi K3: excluded from this implementation because its cost and timeout behavior were disproportionate for this task.

## 15. Spec self-review

- No placeholders or unresolved TODOs remain.
- Coordinate correctness, visual continuity, fit behavior, worker lifecycle, and test isolation have separate invariants.
- Overscan and worker concurrency are optimizations, not correctness mechanisms.
- GPU-first composition is explicit, while PDF parsing/rasterization remains worker CPU work; the spec does not promise unsupported GPU-native PDF rasterization.
- CPU/GPU economy is intentionally not a product requirement; bounded resources and absence of leaks remain requirements.
- The scope is limited to the Gambar Kerja PDF viewer and its tests.
