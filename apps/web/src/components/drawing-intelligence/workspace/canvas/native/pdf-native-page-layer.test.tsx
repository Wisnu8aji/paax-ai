// @vitest-environment jsdom
/*
 * ORION-F4 — component test for the native page layer.
 *
 * Consumes the F2 mock adapter (createPdfRenderMockAdapter — real scheduler
 * surface, fake pixels) and the REAL F3 PdfCropCache (findCovering / set /
 * estimatedBytes contract). Assertions target the DoD items that belong to the
 * viewer component (Master Plan §5 F4, §8 DoD 1–9):
 *   - progressive base: base-first → base-upgrade into the SAME canvas,
 *     old base never cleared before the replacement is ready;
 *   - no render request while a gesture is active (settle gating);
 *   - exactly one foreground crop per settle;
 *   - cache-first: exact hit and coverage hit (findCovering) → 0 worker calls;
 *   - 2–4 overlapping cached crops mount as separate committed surfaces;
 *   - old pixels pinned: a committed crop canvas is never unmounted, cleared,
 *     display:none'd, or shrunk while a newer crop renders (no blank swap);
 *   - commit rule: stale generation / unregistered request / wrong page cannot
 *     commit (canCommit unit assertions).
 *
 * jsdom notes: canvas.getContext('2d') returns null, so paintBitmap sizes the
 * canvas and skips the raster — assertions use element identity, attributes,
 * and canvas width/height (the "pixels" contract is structural).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import React from 'react';
import {
  PdfNativePageLayer,
  NATIVE_LAYER_TESTID,
  NATIVE_BASE_TESTID,
  NATIVE_CROP_TESTID,
} from './pdf-native-page-layer';
import { createPdfRenderMockAdapter, type PdfRenderMockAdapter } from './pdf-render-mock-adapter';
import { PdfCropCache } from './pdf-crop-cache';
import { canCommit, type RenderRegion } from './pdf-native-contract';
import { computeRenderKey } from './pdf-render-geometry';

/* ------------------------------------------------------------------ *
 * Helpers                                                             *
 * ------------------------------------------------------------------ */

const PAGE = { width: 2000, height: 3000, numPages: 1 };

/** Normalized viewport helper (fractions of the page). */
const vp = (zoom: number, x = 0, y = 0, w = 1, h = 1) => ({ x, y, width: w, height: h, zoom, dpr: 1 });

const cropRequestCount = (adapter: PdfRenderMockAdapter): number =>
  adapter.requests.filter((request) => 'region' in request).length;

const fakeBitmap = () =>
  ({ width: 1, height: 1, close: vi.fn(), __mock: true as const }) as unknown as ImageBitmap;

function seedCrop(
  cache: PdfCropCache,
  store: { pageIndex: number; region: RenderRegion; density: number; darkMode?: boolean },
): string {
  const darkMode = store.darkMode ?? false;
  const widthPx = Math.max(1, Math.round(store.region.width * store.density));
  const heightPx = Math.max(1, Math.round(store.region.height * store.density));
  cache.set({
    pageIndex: store.pageIndex,
    region: store.region,
    density: store.density,
    darkMode,
    bitmap: fakeBitmap(),
    widthPx,
    heightPx,
  });
  return computeRenderKey(store.pageIndex, store.region, store.density, darkMode);
}

/** Drain microtasks so async open/base/crop continuations settle. */
async function flushAsync(times = 16): Promise<void> {
  await act(async () => {
    for (let i = 0; i < times; i += 1) await Promise.resolve();
  });
}

/** Advance the fake clock so a settle window expires, then drain microtasks. */
async function runSettle(ms = 200): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  await flushAsync();
}

/** Complete all pending mock renders (autoCommit: false drives completion). */
async function flushPendingAdapter(adapter: PdfRenderMockAdapter): Promise<void> {
  await act(async () => {
    const pending = adapter.flushPending();
    await vi.advanceTimersByTimeAsync(20);
    await pending;
  });
  await flushAsync();
}

const cropCanvas = (container: HTMLElement, key: string): HTMLCanvasElement | null =>
  container.querySelector<HTMLCanvasElement>(`[data-testid="${NATIVE_CROP_TESTID}"][data-crop-key="${key}"]`);

/* ------------------------------------------------------------------ *
 * Suite                                                               *
 * ------------------------------------------------------------------ */

describe('PdfNativePageLayer (F2 mock adapter + F3 PdfCropCache)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // jsdom has no canvas raster; return null ctx quietly (paintBitmap sizes
    // the canvas and skips the raster — assertions are structural).
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('renders progressive base: base-first then base-upgrade into the SAME canvas, never cleared', async () => {
    const onBaseReady = vi.fn();
    const adapter = createPdfRenderMockAdapter({ metrics: PAGE });
    const view = render(
      <PdfNativePageLayer runId="run-a" pageIndex={0} viewport={vp(1)} renderClient={adapter} onBaseReady={onBaseReady} settleMs={150} />,
    );
    await flushAsync();
    await flushAsync();

    const priorities = adapter.requests.map((request) => request.priority);
    expect(priorities.filter((p) => p === 'base-first')).toHaveLength(1);
    expect(priorities.filter((p) => p === 'base-upgrade')).toHaveLength(1);
    // base-first must come before base-upgrade.
    expect(priorities.indexOf('base-first')).toBeLessThan(priorities.indexOf('base-upgrade'));

    const base = view.container.querySelector(`[data-testid="${NATIVE_BASE_TESTID}"]`) as HTMLCanvasElement;
    expect(base).toBeTruthy();
    // base-first density 1 → 2000×3000; base-upgrade density ≈2.16 → 4320×6480.
    expect(base.width).toBeGreaterThan(2000);
    expect(base.height).toBeGreaterThan(3000);
    expect(onBaseReady).toHaveBeenCalledTimes(1);
    expect(onBaseReady).toHaveBeenCalledWith('run-a:0');
    // Progressive invariant: only ONE base canvas element ever existed.
    expect(view.container.querySelectorAll(`[data-testid="${NATIVE_BASE_TESTID}"]`)).toHaveLength(1);
    expect(view.getByTestId(NATIVE_LAYER_TESTID).dataset.firstPaintMs).toBeTruthy();
    expect(view.getByTestId(NATIVE_LAYER_TESTID).dataset.basePaintMs).toBeTruthy();
  });

  it('issues exactly ONE foreground crop after a settle on a cold cache', async () => {
    const adapter = createPdfRenderMockAdapter({ metrics: PAGE });
    render(
      <PdfNativePageLayer runId="run-a" pageIndex={0} viewport={vp(2)} renderClient={adapter} settleMs={150} />,
    );
    await flushAsync();
    await flushAsync();
    expect(cropRequestCount(adapter)).toBe(0);

    await runSettle();

    expect(cropRequestCount(adapter)).toBe(1);
    const crop = adapter.requests.find((request) => 'region' in request);
    expect(crop && 'priority' in crop ? crop.priority : null).toBe('foreground');
  });

  it('issues NO render request while the gesture is active (settle gating)', async () => {
    const adapter = createPdfRenderMockAdapter({ metrics: PAGE });
    const { rerender } = render(
      <PdfNativePageLayer runId="run-a" pageIndex={0} viewport={vp(2)} renderClient={adapter} settleMs={150} />,
    );
    await flushAsync();
    await flushAsync();

    // Gesture burst: viewport keeps changing; each change re-arms the settle
    // window, so no evaluation may run while the burst is active (DoD 1).
    for (let i = 1; i <= 5; i += 1) {
      act(() => {
        rerender(
          <PdfNativePageLayer runId="run-a" pageIndex={0} viewport={vp(2, 0, i * 0.02)} renderClient={adapter} settleMs={150} />,
        );
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });
    }
    expect(cropRequestCount(adapter)).toBe(0);

    // After the last change + settle window, exactly one crop is requested.
    await runSettle();
    expect(cropRequestCount(adapter)).toBe(1);
  });

  it('exact cache hit → 0 worker calls and a mounted committed crop surface', async () => {
    const adapter = createPdfRenderMockAdapter({ metrics: PAGE });
    const cache = new PdfCropCache(512 * 1024 * 1024);
    // Same region+density the settle will request (zoom 2, quarter viewport).
    const region: RenderRegion = { x: 250, y: 375, width: 1500, height: 2250 };
    const key = seedCrop(cache, { pageIndex: 0, region, density: 2 });

    const view = render(
      <PdfNativePageLayer runId="run-a" pageIndex={0} viewport={vp(2, 0.25, 0.25, 0.5, 0.5)} renderClient={adapter} cropCache={cache} settleMs={150} />,
    );
    await flushAsync();
    await flushAsync();
    expect(cropRequestCount(adapter)).toBe(0);

    await runSettle();

    expect(cropRequestCount(adapter)).toBe(0); // cache served the viewport
    expect(view.getByTestId(NATIVE_LAYER_TESTID).dataset.cropCacheHit).toBe('1');
    const canvas = cropCanvas(view.container, key);
    expect(canvas).toBeTruthy();
    expect(canvas?.dataset.cropCommitted).toBe('true');
    expect(Number(canvas?.width)).toBeGreaterThan(0);
  });

  it('coverage hit via findCovering (non-exact key) → 0 worker calls', async () => {
    const adapter = createPdfRenderMockAdapter({ metrics: PAGE });
    const cache = new PdfCropCache(512 * 1024 * 1024);
    // A LARGER cached crop that fully contains the requested viewport but has
    // a different render key → getExact misses, findCovering must hit.
    const covering: RenderRegion = { x: 0, y: 0, width: 2000, height: 3000 };
    const key = seedCrop(cache, { pageIndex: 0, region: covering, density: 2 });
    const viewport: RenderRegion = { x: 250, y: 375, width: 1500, height: 2250 };
    expect(computeRenderKey(0, covering, 2, false)).not.toBe(computeRenderKey(0, viewport, 2, false));

    const view = render(
      <PdfNativePageLayer runId="run-a" pageIndex={0} viewport={vp(2, 0.25, 0.25, 0.5, 0.5)} renderClient={adapter} cropCache={cache} settleMs={150} />,
    );
    await flushAsync();
    await flushAsync();
    await runSettle();

    expect(cropRequestCount(adapter)).toBe(0);
    expect(view.getByTestId(NATIVE_LAYER_TESTID).dataset.cropCacheHit).toBe('1');
    expect(cropCanvas(view.container, key)).toBeTruthy();
  });

  it('mounts 2–4 overlapping cached crops as committed surfaces without rendering', async () => {
    const adapter = createPdfRenderMockAdapter({ metrics: PAGE });
    const cache = new PdfCropCache(512 * 1024 * 1024);
    const covering = seedCrop(cache, { pageIndex: 0, region: { x: 0, y: 0, width: 2000, height: 3000 }, density: 2 });
    const second = seedCrop(cache, { pageIndex: 0, region: { x: 0, y: 0, width: 1000, height: 1500 }, density: 2 });
    const third = seedCrop(cache, { pageIndex: 0, region: { x: 1000, y: 1500, width: 1000, height: 1500 }, density: 2 });

    const view = render(
      <PdfNativePageLayer runId="run-a" pageIndex={0} viewport={vp(2, 0.25, 0.25, 0.5, 0.5)} renderClient={adapter} cropCache={cache} settleMs={150} />,
    );
    await flushAsync();
    await flushAsync();
    await runSettle();

    expect(cropRequestCount(adapter)).toBe(0);
    const mounted = view.container.querySelectorAll(`[data-testid="${NATIVE_CROP_TESTID}"]`);
    // covering + both intersecting crops (Master Plan: 2–4 surfaces).
    expect(mounted.length).toBeGreaterThanOrEqual(3);
    expect(mounted.length).toBeLessThanOrEqual(4);
    for (const key of [covering, second, third]) {
      const canvas = cropCanvas(view.container, key);
      expect(canvas).toBeTruthy();
      expect(canvas?.dataset.cropCommitted).toBe('true');
    }
  });

  it('keeps old pinned pixels visible while a new crop renders — no blank swap', async () => {
    const adapter = createPdfRenderMockAdapter({ metrics: PAGE, autoCommit: false });
    const cache = new PdfCropCache(512 * 1024 * 1024);
    const onReport = vi.fn();
    const view = render(
      <PdfNativePageLayer runId="run-a" pageIndex={0} viewport={vp(2)} renderClient={adapter} cropCache={cache} onCropReport={onReport} settleMs={150} />,
    );
    const { rerender } = view;
    await flushAsync();
    await flushAsync();

    // First settle → crop A (full page @ zoom 2) submitted, then completed.
    await runSettle();
    expect(cropRequestCount(adapter)).toBe(1);
    await flushPendingAdapter(adapter);
    expect(cropRequestCount(adapter)).toBe(1);

    const keyA = computeRenderKey(0, { x: 0, y: 0, width: 2000, height: 3000 }, 2, false);
    const canvasA = cropCanvas(view.container, keyA);
    expect(canvasA).toBeTruthy();
    expect(canvasA?.dataset.cropCommitted).toBe('true');
    const widthA = canvasA?.width ?? 0;
    expect(widthA).toBeGreaterThan(0);

    // Gesture to a region/density the cache cannot cover (zoom 2.4, right
    // half) → a NEW crop renders while the old one must stay pinned.
    act(() => {
      rerender(
        <PdfNativePageLayer runId="run-a" pageIndex={0} viewport={vp(2.4, 0.5, 0, 0.5, 1)} renderClient={adapter} cropCache={cache} onCropReport={onReport} settleMs={150} />,
      );
    });
    await runSettle();
    expect(cropRequestCount(adapter)).toBe(2); // B is now pending

    // WHILE B is in flight: A is still mounted, same node, same size,
    // committed, and no crop canvas is display:none or blank.
    const canvasAPending = cropCanvas(view.container, keyA);
    expect(canvasAPending).toBe(canvasA);
    expect(canvasAPending?.width).toBe(widthA);
    expect(canvasAPending?.dataset.cropCommitted).toBe('true');
    for (const el of view.container.querySelectorAll(`[data-testid="${NATIVE_CROP_TESTID}"]`)) {
      expect((el as HTMLElement).style.display).not.toBe('none');
      expect((el as HTMLCanvasElement).width).toBeGreaterThan(0);
    }

    // Complete B → B mounts as a new surface; A is STILL present (pinned),
    // same node, same size. No blank frame ever.
    await flushPendingAdapter(adapter);
    const keyB = computeRenderKey(0, { x: 750, y: 0, width: 1250, height: 3000 }, 2.4, false);
    const canvasB = cropCanvas(view.container, keyB);
    expect(canvasB).toBeTruthy();
    expect(canvasB?.dataset.cropCommitted).toBe('true');
    expect(cropCanvas(view.container, keyA)).toBe(canvasA);
    expect(canvasA?.width).toBe(widthA);
    for (const el of view.container.querySelectorAll(`[data-testid="${NATIVE_CROP_TESTID}"]`)) {
      expect((el as HTMLElement).style.display).not.toBe('none');
      expect((el as HTMLCanvasElement).width).toBeGreaterThan(0);
    }
    // The swap was atomic: a committed crop surface never went blank.
    expect(onReport.mock.calls.some((call) => call[0].kind === 'crop-cache-miss')).toBe(true);
  });

  it('commit rule: stale generation, unregistered request, and wrong page cannot commit', () => {
    const registered = new Set(['r1']);
    expect(canCommit({ generation: 1, requestId: 'r1', pageIndex: 0 }, 2, registered, 0)).toBe(false); // stale gen
    expect(canCommit({ generation: 1, requestId: 'unknown', pageIndex: 0 }, 1, registered, 0)).toBe(false); // not registered
    expect(canCommit({ generation: 1, requestId: 'r1', pageIndex: 1 }, 1, registered, 0)).toBe(false); // wrong page
    expect(canCommit({ generation: 1, requestId: 'r1', pageIndex: 0 }, 1, registered, 0)).toBe(true);
  });

  it('exposes lightweight diagnostics for F5 (data-* attributes + reports)', async () => {
    const adapter = createPdfRenderMockAdapter({ metrics: PAGE });
    const cache = new PdfCropCache(512 * 1024 * 1024);
    seedCrop(cache, { pageIndex: 0, region: { x: 0, y: 0, width: 2000, height: 3000 }, density: 2 });

    const view = render(
      <PdfNativePageLayer runId="run-a" pageIndex={0} viewport={vp(2)} renderClient={adapter} cropCache={cache} documentKey="doc-x" settleMs={150} />,
    );
    await flushAsync();
    await flushAsync();

    const root = view.getByTestId(NATIVE_LAYER_TESTID);
    expect(root.dataset.viewerMode).toBe('native');
    expect(root.dataset.documentKey).toBe('doc-x');

    await runSettle();
    // Covered viewport → cache hit diagnostics.
    expect(root.dataset.cropCacheHit).toBe('1');
    expect(cropRequestCount(adapter)).toBe(0);
  });

  it('flows dark mode into base + crop requests and separates cache keys', async () => {
    const adapter = createPdfRenderMockAdapter({ metrics: PAGE });
    const view = render(
      <PdfNativePageLayer runId="run-a" pageIndex={0} viewport={vp(2)} dark renderClient={adapter} settleMs={150} />,
    );
    await flushAsync();
    await flushAsync();
    await runSettle();

    // Every base request (base-first + base-upgrade) carries darkMode: true.
    const baseRequests = adapter.requests.filter((request) => !('region' in request));
    expect(baseRequests.length).toBeGreaterThanOrEqual(2);
    for (const req of baseRequests) expect(req.darkMode).toBe(true);
    // The foreground crop carries darkMode: true too.
    const crop = adapter.requests.find((request) => 'region' in request);
    expect(crop && 'darkMode' in crop ? crop.darkMode : null).toBe(true);
    // The layer reports its raster mode for F5.
    expect(view.getByTestId(NATIVE_LAYER_TESTID).dataset.nativeDark).toBe('true');

    // F3 render key separates dark: same region+density, different dark.
    const region: RenderRegion = { x: 0, y: 0, width: 2000, height: 3000 };
    expect(computeRenderKey(0, region, 2, false)).not.toBe(computeRenderKey(0, region, 2, true));
  });

  it('surfaces the full F5 diagnostics contract (data-native-* attributes)', async () => {
    const adapter = createPdfRenderMockAdapter({ metrics: PAGE });
    const cache = new PdfCropCache(512 * 1024 * 1024);
    const view = render(
      <PdfNativePageLayer runId="run-a" pageIndex={0} viewport={vp(2)} renderClient={adapter} cropCache={cache} settleMs={150} />,
    );
    await flushAsync();
    await flushAsync();
    const root = view.getByTestId(NATIVE_LAYER_TESTID);

    // After base renders: worker counters live, base timings present, base
    // ready, crop not yet.
    expect(Number(root.dataset.nativeWorkerRequests)).toBeGreaterThanOrEqual(2);
    expect(Number(root.dataset.nativeWorkerCalls)).toBeGreaterThanOrEqual(2);
    expect(Number(root.dataset.nativeActiveGeneration)).toBeGreaterThanOrEqual(1);
    expect(Number(root.dataset.nativeCommittedGeneration)).toBeGreaterThanOrEqual(1);
    // Durations are present (may be 0 under fake timers — performance.now
    // does not advance without timer progress).
    expect(root.dataset.nativeBaseFirstMs).not.toBe('');
    expect(root.dataset.nativeBaseUpgradeMs).not.toBe('');
    expect(root.dataset.nativeDocumentKey).toBe('run-a:0');
    expect(root.dataset.nativePageIndex).toBe('0');
    expect(root.dataset.nativeBaseReady).toBe('true');
    expect(root.dataset.nativeCropReady).toBe('false');
    expect(root.dataset.nativeForegroundPending).toBe('0');
    expect(root.dataset.nativePixelsPinned).toBe('true');
    expect(root.dataset.nativeStaleCommit).toBe('false');
    expect(root.dataset.nativeRenderDuringGesture).toBe('0');
    expect(root.dataset.nativeDark).toBe('false');

    // Cold cache settle → exactly one crop miss, one foreground render.
    await runSettle();
    expect(root.dataset.nativeCacheMisses).toBe('1');
    expect(root.dataset.nativeCacheExactHits).toBe('0');
    expect(root.dataset.nativeCacheCoverageHits).toBe('0');
    expect(Number(root.dataset.nativeCropRenderMs)).toBeGreaterThanOrEqual(0);
    expect(root.dataset.nativeCropReady).toBe('true');
    expect(root.dataset.nativeCropsPerSettle).toBe('1');
    expect(Number(root.dataset.nativeCacheBytes)).toBeGreaterThan(0);

    // Re-settle at a lower zoom whose cached-crop key differs (density 1.5
    // vs cached 2.0 → exact miss) but is still covered by the cached full
    // page within density tolerance → coverage hit, ZERO new worker
    // requests, revisit = 0.
    const requestsBefore = Number(root.dataset.nativeWorkerRequests);
    const callsBefore = Number(root.dataset.nativeWorkerCalls);
    act(() => {
      view.rerender(
        <PdfNativePageLayer runId="run-a" pageIndex={0} viewport={vp(1.5)} renderClient={adapter} cropCache={cache} settleMs={150} />,
      );
    });
    await runSettle();
    expect(root.dataset.nativeCacheCoverageHits).toBe('1');
    expect(Number(root.dataset.nativeWorkerRequests)).toBe(requestsBefore);
    expect(Number(root.dataset.nativeWorkerCalls)).toBe(callsBefore);
    expect(root.dataset.nativeRevisitWorkerCalls).toBe('0');
  });

  it('reports foreground pending while a foreground crop is in flight', async () => {
    const adapter = createPdfRenderMockAdapter({ metrics: PAGE, autoCommit: false });
    const view = render(
      <PdfNativePageLayer runId="run-a" pageIndex={0} viewport={vp(2)} renderClient={adapter} settleMs={150} />,
    );
    await flushAsync();
    await flushAsync();
    await runSettle();
    expect(cropRequestCount(adapter)).toBe(1);
    const root = view.getByTestId(NATIVE_LAYER_TESTID);
    expect(root.dataset.nativeForegroundPending).toBe('1');

    await flushPendingAdapter(adapter);
    expect(root.dataset.nativeForegroundPending).toBe('0');
  });
});
