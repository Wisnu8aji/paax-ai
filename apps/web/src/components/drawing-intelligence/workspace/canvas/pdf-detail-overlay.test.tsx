// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import React from 'react';
import {
  PdfDetailOverlay,
  DETAIL_OVERLAY_TESTID,
  detailDensityFor,
  isDetailEngaged,
  detailRegionFor,
  detailTargetDensity,
  detailCanvasGeometry,
  detailRenderKeyFor,
  type DetailCanvasGeometry,
  type DetailRegion,
  type DetailRenderDelivery,
  type DetailRenderPool,
  type DetailViewport,
} from './pdf-detail-overlay';
import {
  DETAIL_ENGAGE_PAAX,
  DETAIL_MARGIN_PAAX,
  DETAIL_STALL_MS_PAAX,
  GESTURE_MS_PAAX,
} from './pdf-render-constants';
import { cropDensityCapPAAX } from './pdf-scale-math';
import type { DetailRenderRequest } from './pdf-tile-protocol';

/* ---------------------------------------------------------------------------
 * Test double: controlled pool + canvas 2d context mock.
 * ------------------------------------------------------------------------ */

type Resolver = (delivery: DetailRenderDelivery) => void;
type Rejecter = (error: Error) => void;

interface RequestEntry {
  request: DetailRenderRequest;
  resolve: Resolver;
  reject: Rejecter;
  cancel: ReturnType<typeof vi.fn>;
}

function makePool(opts: { cancelRejects?: boolean } = {}) {
  const cancelRejects = opts.cancelRejects ?? true;
  const requests: RequestEntry[] = [];
  const pool: DetailRenderPool = {
    request: vi.fn().mockImplementation((request: DetailRenderRequest) => {
      let resolve!: Resolver;
      let reject!: Rejecter;
      const promise = new Promise<DetailRenderDelivery>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      const cancel = vi.fn(() => {
        if (cancelRejects) {
          const error = new Error('PDF tile request cancelled');
          error.name = 'AbortError';
          reject(error);
        }
      });
      requests.push({ request, resolve, reject, cancel });
      return { promise, cancel };
    }),
  };
  return { pool, requests };
}

function makeBitmap(width = 100, height = 80) {
  return { width, height, close: vi.fn() };
}

function deliver(entry: RequestEntry, bmp = makeBitmap()): DetailRenderDelivery {
  const delivery: DetailRenderDelivery = {
    width: bmp.width,
    height: bmp.height,
    claim: vi.fn().mockReturnValue(bmp),
  };
  entry.resolve(delivery);
  return delivery;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

/* ---------------------------------------------------------------------------
 * Shared fixtures.
 * ------------------------------------------------------------------------ */

const METRICS = { width: 1000, height: 800 };
// Zoom 8 × dpr 2 → effective 16 device px/pt: deep zoom, well past engage.
const DEEP = { x: 0.25, y: 0.25, width: 0.5, height: 0.5, zoom: 8, dpr: 2 } as const;
// Same visible window, panned right by 5% — a distinct crop.
const DEEP_PAN = { x: 0.3, y: 0.25, width: 0.5, height: 0.5, zoom: 8, dpr: 2 } as const;
const FIT = { x: 0, y: 0, width: 1, height: 1, zoom: 1, dpr: 1 } as const;

function expectedRegion(viewport: DetailViewport, metrics = METRICS): DetailRegion {
  const left = viewport.x * metrics.width;
  const top = viewport.y * metrics.height;
  const right = (viewport.x + viewport.width) * metrics.width;
  const bottom = (viewport.y + viewport.height) * metrics.height;
  const mw = (right - left) * DETAIL_MARGIN_PAAX;
  const mh = (bottom - top) * DETAIL_MARGIN_PAAX;
  return {
    x0: Math.max(0, left - mw),
    y0: Math.max(0, top - mh),
    x1: Math.min(metrics.width, right + mw),
    y1: Math.min(metrics.height, bottom + mh),
  };
}

function geometryFor(viewport: DetailViewport, metrics = METRICS): DetailCanvasGeometry {
  const region = detailRegionFor(viewport, metrics)!;
  const density = detailTargetDensity(region, detailDensityFor(viewport.zoom, viewport.dpr));
  return detailCanvasGeometry(region, density);
}

let drawImageSpy: ReturnType<typeof vi.fn>;
let getContextSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers();
  drawImageSpy = vi.fn();
  getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((contextId: string) => {
    if (contextId === '2d') {
      return { drawImage: drawImageSpy, clearRect: vi.fn() } as unknown as CanvasRenderingContext2D;
    }
    return null;
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function canvasFor() {
  return document.querySelector(`[data-testid="${DETAIL_OVERLAY_TESTID}"]`) as HTMLCanvasElement | null;
}

/* ---------------------------------------------------------------------------
 * Pure math: region, density, engagement boundary, cap, geometry, key.
 * ------------------------------------------------------------------------ */

describe('detailRegionFor — positioning math', () => {
  it('expands the visible viewport by DETAIL_MARGIN_PAAX on every side', () => {
    const region = detailRegionFor(DEEP, METRICS);
    // Visible 250..750 × 200..600 pt; margin 0.25 × size = 125 × 100.
    expect(region).toEqual({ x0: 125, y0: 100, x1: 875, y1: 700 });
  });

  it('clamps the region to page bounds at the edges', () => {
    const region = detailRegionFor({ x: 0, y: 0, width: 0.5, height: 0.5, zoom: 8, dpr: 2 }, METRICS);
    expect(region).toEqual({ x0: 0, y0: 0, x1: 625, y1: 500 });
  });

  it('returns null for a viewport fully outside the page', () => {
    const region = detailRegionFor({ x: 1.5, y: 1.5, width: 0.2, height: 0.2, zoom: 8, dpr: 2 }, METRICS);
    expect(region).toBeNull();
  });

  it('returns null for a degenerate (zero-size) viewport', () => {
    const region = detailRegionFor({ x: 0.25, y: 0.25, width: 0, height: 0.5, zoom: 8, dpr: 2 }, METRICS);
    expect(region).toBeNull();
  });

  it('returns null for non-positive page metrics', () => {
    expect(detailRegionFor(DEEP, { width: 0, height: 800 })).toBeNull();
  });
});

describe('detailDensityFor + engagement gate boundary (1.15)', () => {
  it('computes effective density as zoom × dpr', () => {
    expect(detailDensityFor(8, 2)).toBe(16);
    expect(detailDensityFor(4, 2)).toBe(8);
    expect(detailDensityFor(1, 1)).toBe(1);
  });

  it('guards non-finite zoom/dpr', () => {
    expect(detailDensityFor(Number.NaN, 2)).toBe(2);
    expect(detailDensityFor(4, Number.NaN)).toBe(4);
    expect(detailDensityFor(Number.POSITIVE_INFINITY, 2)).toBe(2);
  });

  it('is NOT engaged at exactly DETAIL_ENGAGE_PAAX (strictly greater)', () => {
    expect(DETAIL_ENGAGE_PAAX).toBe(1.15);
    expect(isDetailEngaged(1.15, 1)).toBe(false);
    expect(isDetailEngaged(0.575, 2)).toBe(false); // 0.575 × 2 === 1.15 exactly
    expect(detailDensityFor(0.575, 2)).toBe(DETAIL_ENGAGE_PAAX);
  });

  it('engages just above the boundary and at every realistic deep zoom', () => {
    expect(isDetailEngaged(1.16, 1)).toBe(true);
    expect(isDetailEngaged(0.58, 2)).toBe(true);
    expect(isDetailEngaged(8, 2)).toBe(true); // zoom 8 dpr 2 → 16 px/pt
    expect(isDetailEngaged(32, 2)).toBe(true); // zoom 32 dpr 2 → 64 px/pt
    expect(isDetailEngaged(1, 1)).toBe(false); // fit view
    expect(isDetailEngaged(0.5, 2)).toBe(false); // 1.0 — shallow zoom
  });
});

describe('detailTargetDensity + cropDensityCapPAAX — the ONLY density ceiling', () => {
  it('passes arbitrary requested density through when the cap does not bind', () => {
    // Viewport-sized region: cap(750,600) ≈ 21.8 — never binds at 16.
    const region = detailRegionFor(DEEP, METRICS)!;
    expect(cropDensityCapPAAX(region.x1 - region.x0, region.y1 - region.y0)).toBeGreaterThan(16);
    expect(detailTargetDensity(region, 16)).toBe(16);
    // 3 px/pt is NOT a pyramid level — proves no pyramid quantization.
    expect(detailTargetDensity(region, 3)).toBe(3);
  });

  it('caps density only by cropDensityCapPAAX for oversized regions', () => {
    // Whole-page region 1000×800: cap = min(16384/1000, 16384/800, sqrt(area-cap/area)).
    const cap = cropDensityCapPAAX(1000, 800);
    expect(cap).toBeCloseTo(16.384, 3);
    expect(detailTargetDensity({ x0: 0, y0: 0, x1: 1000, y1: 800 }, 64)).toBeCloseTo(16.384, 3);
    // Sanity cross-check against F1's verified value.
    expect(cropDensityCapPAAX(1600, 900)).toBeCloseTo(10.24, 2);
  });
});

describe('detailCanvasGeometry — 1:1 compositing math', () => {
  it('sizes the bitmap at region × density and the CSS box at region (page px)', () => {
    const geometry = geometryFor(DEEP);
    expect(geometry).toEqual({
      bw: 12000, // 750 pt × 16 px/pt
      bh: 9600, // 600 pt × 16 px/pt
      left: 125,
      top: 100,
      width: 750,
      height: 600,
      density: 16,
    });
    // 1:1 invariant: bitmap device px / CSS page px === applied density.
    expect(geometry.bw / geometry.width).toBe(geometry.density);
    expect(geometry.bh / geometry.height).toBe(geometry.density);
  });

  it('keeps density intact at 64 px/pt when the region cap does not bind (no pyramid ceiling)', () => {
    // Small region (150×120 pt): cap(150,120) ≈ 109 > 64 → nothing binds,
    // and 64 exceeds even the old MAX_DETAIL_TILE_DENSITY (32) — proof that
    // NO density ceiling except cropDensityCapPAAX applies.
    const geometry = geometryFor({ x: 0.45, y: 0.45, width: 0.1, height: 0.1, zoom: 32, dpr: 2 } as DetailViewport);
    expect(geometry.density).toBe(64);
    expect(geometry.width).toBe(150);
    expect(geometry.bw).toBe(9600);
    expect(geometry.bw / geometry.width).toBe(64); // 1:1 survives at 64 px/pt
  });

  it('applies the crop cap when it binds (dimension cap)', () => {
    const region = { x0: 0, y0: 0, x1: 1000, y1: 800 };
    const geometry = detailCanvasGeometry(region, 64);
    expect(geometry.density).toBeCloseTo(16.384, 3);
    expect(geometry.bw).toBe(16384); // MAX_CANVAS_DIM_PAAX binds
    expect(geometry.bh).toBe(13107);
  });

  it('never produces a zero-sized buffer', () => {
    const geometry = detailCanvasGeometry({ x0: 0, y0: 0, x1: 0.01, y1: 0.01 }, 1);
    expect(geometry.bw).toBeGreaterThanOrEqual(1);
    expect(geometry.bh).toBeGreaterThanOrEqual(1);
  });
});

describe('detailRenderKeyFor — dedup identity', () => {
  it('is stable for identical crops and distinct for changed crops', () => {
    const regionA = detailRegionFor(DEEP, METRICS)!;
    const regionB = detailRegionFor(DEEP_PAN, METRICS)!;
    const keyA1 = detailRenderKeyFor('run:0', regionA, 16, false);
    const keyA2 = detailRenderKeyFor('run:0', regionA, 16, false);
    const keyA3 = detailRenderKeyFor('run:0', regionA, 16, true); // dark flips the key
    const keyB = detailRenderKeyFor('run:0', regionB, 16, false);
    expect(keyA1).toBe(keyA2);
    expect(keyA1).not.toBe(keyA3);
    expect(keyA1).not.toBe(keyB);
  });
});

/* ---------------------------------------------------------------------------
 * Component: engaged render, exact arbitrary density, 1:1 application.
 * ------------------------------------------------------------------------ */

function renderOverlay(
  pool: DetailRenderPool,
  viewport: DetailViewport = DEEP as DetailViewport,
  props: Partial<{ documentKey: string; pageNumber: number; dark: boolean; onRendered: (r: unknown) => void }> = {},
) {
  return render(
    <PdfDetailOverlay
      documentKey={props.documentKey ?? 'run:0'}
      pageNumber={props.pageNumber ?? 7}
      metrics={METRICS}
      viewport={viewport}
      pool={pool}
      dark={props.dark}
      onRendered={props.onRendered}
    />,
  );
}

describe('PdfDetailOverlay — engaged rendering', () => {
  it('issues one render at the EXACT density zoom × dpr (no pyramid quantization)', async () => {
    const { pool, requests } = makePool();
    renderOverlay(pool, { x: 0.25, y: 0.25, width: 0.5, height: 0.5, zoom: 3, dpr: 1 } as DetailViewport);
    expect(requests).toHaveLength(1);
    const request = requests[0].request;
    expect(request.documentKey).toBe('run:0');
    expect(request.pageNumber).toBe(7);
    // 3 px/pt is NOT a pyramid level (0.25,0.5,1,2,4,8) — proves no snapping.
    expect(request.scale).toBe(3);
    expect(request.region).toEqual({ x: 125, y: 100, width: 750, height: 600 });
    expect(request.dark).toBeFalsy();
  });

  it('composites 1:1: bitmap = region × density, CSS box = region in page px', async () => {
    const { pool, requests } = makePool();
    renderOverlay(pool);
    const geometry = geometryFor(DEEP);
    deliver(requests[0]);
    await flush();

    const canvas = canvasFor()!;
    expect(canvas.width).toBe(geometry.bw); // 12000 device px
    expect(canvas.height).toBe(geometry.bh); // 9600 device px
    expect(canvas.style.left).toBe('125px');
    expect(canvas.style.top).toBe('100px');
    expect(canvas.style.width).toBe('750px');
    expect(canvas.style.height).toBe('600px');
    expect(canvas.style.display).toBe('block');
    expect(canvas.style.pointerEvents).toBe('none');
    expect(canvas.style.position).toBe('absolute');
    expect(drawImageSpy).toHaveBeenCalledTimes(1);
  });

  it('applies exactly one bitmap and closes it after painting', async () => {
    const { pool, requests } = makePool();
    renderOverlay(pool);
    const bmp = makeBitmap(12000, 9600);
    const delivery = deliver(requests[0], bmp);
    await flush();
    expect(delivery.claim).toHaveBeenCalledTimes(1);
    expect(bmp.close).toHaveBeenCalledTimes(1);
    expect(drawImageSpy).toHaveBeenCalledTimes(1);
  });

  it('forwards the dark flag to the extended protocol request', async () => {
    const { pool, requests } = makePool();
    renderOverlay(pool, DEEP as DetailViewport, { dark: true });
    expect(requests[0].request.dark).toBe(true);
  });

  it('exposes diagnostics data-* attributes for evidence capture', async () => {
    const { pool, requests } = makePool();
    const onRendered = vi.fn();
    renderOverlay(pool, DEEP as DetailViewport, { onRendered });
    deliver(requests[0]);
    await flush();

    const canvas = canvasFor()!;
    expect(canvas.getAttribute('data-detail-overlay')).toBe('true');
    expect(canvas.getAttribute('data-detail-engaged')).toBe('true');
    expect(canvas.getAttribute('data-detail-density')).toBe('16');
    expect(canvas.getAttribute('data-detail-region')).toBe('125.0,100.0,875.0,700.0');
    expect(canvas.getAttribute('data-detail-buffer')).toBe('12000x9600');
    expect(onRendered).toHaveBeenCalledWith(
      expect.objectContaining({ engaged: true, density: 16, bufferWidth: 12000, bufferHeight: 9600 }),
    );
  });

  it('applies the crop cap as the ONLY density ceiling at extreme zoom', async () => {
    const { pool, requests } = makePool();
    // Whole page at zoom 32 dpr 2 → 64 px/pt requested; region cap binds at 16.384.
    renderOverlay(pool, { x: 0, y: 0, width: 1, height: 1, zoom: 32, dpr: 2 } as DetailViewport);
    expect(requests).toHaveLength(1);
    expect(requests[0].request.scale).toBeCloseTo(16.384, 3);
    deliver(requests[0]);
    await flush();
    expect(canvasFor()!.width).toBe(16384); // MAX_CANVAS_DIM_PAAX
  });
});

describe('PdfDetailOverlay — engagement gate on the component', () => {
  it('stays hidden and issues no render below the gate', () => {
    const { pool, requests } = makePool();
    renderOverlay(pool, FIT as DetailViewport); // zoom 1 × dpr 1 = 1.0
    expect(requests).toHaveLength(0);
    const canvas = canvasFor()!;
    expect(canvas.style.display).toBe('none');
    expect(canvas.getAttribute('data-detail-engaged')).toBe('false');
  });

  it('is NOT engaged at exactly 1.15 (boundary)', () => {
    const { pool, requests } = makePool();
    renderOverlay(pool, { x: 0.25, y: 0.25, width: 0.5, height: 0.5, zoom: 0.575, dpr: 2 } as DetailViewport);
    expect(requests).toHaveLength(0);
    expect(canvasFor()!.getAttribute('data-detail-engaged')).toBe('false');
  });

  it('engages just past the boundary (1.16)', () => {
    const { pool, requests } = makePool();
    renderOverlay(pool, { x: 0.25, y: 0.25, width: 0.5, height: 0.5, zoom: 0.58, dpr: 2 } as DetailViewport);
    expect(requests).toHaveLength(1);
    expect(requests[0].request.scale).toBeCloseTo(1.16, 10);
  });

  it('re-engages after zooming back out and in (last key cleared on hide)', async () => {
    const { pool, requests } = makePool();
    const { rerender } = renderOverlay(pool);
    deliver(requests[0]);
    await flush();
    expect(requests).toHaveLength(1);

    // Zoom out below the gate → hidden, in-flight state reset.
    await act(async () => {
      rerender(
        <PdfDetailOverlay documentKey="run:0" pageNumber={7} metrics={METRICS} viewport={FIT as DetailViewport} pool={pool} />,
      );
      await Promise.resolve();
    });
    expect(canvasFor()!.style.display).toBe('none');
    expect(requests).toHaveLength(1);

    // Zoom back to the SAME deep viewport → re-renders (dedup key was cleared).
    await act(async () => {
      rerender(
        <PdfDetailOverlay documentKey="run:0" pageNumber={7} metrics={METRICS} viewport={DEEP as DetailViewport} pool={pool} />,
      );
      await Promise.resolve();
    });
    expect(requests).toHaveLength(2);
  });
});

describe('PdfDetailOverlay — dedup of identical crops', () => {
  it('does not re-request when the viewport object changes but the crop is identical', async () => {
    const { pool, requests } = makePool();
    const { rerender } = renderOverlay(pool);
    deliver(requests[0]);
    await flush();
    expect(requests).toHaveLength(1);

    await act(async () => {
      rerender(
        <PdfDetailOverlay
          documentKey="run:0"
          pageNumber={7}
          metrics={METRICS}
          viewport={{ ...DEEP } as DetailViewport}
          pool={pool}
        />,
      );
      await Promise.resolve();
    });
    expect(requests).toHaveLength(1); // same crop key → no new request
  });

  it('issues a new render when the crop changes (pan)', async () => {
    const { pool, requests } = makePool();
    const { rerender } = renderOverlay(pool);
    deliver(requests[0]);
    await flush();

    await act(async () => {
      rerender(
        <PdfDetailOverlay
          documentKey="run:0"
          pageNumber={7}
          metrics={METRICS}
          viewport={DEEP_PAN as DetailViewport}
          pool={pool}
        />,
      );
      await Promise.resolve();
    });
    expect(requests).toHaveLength(2);
    expect(requests[1].request.region).toEqual({ x: 175, y: 100, width: 750, height: 600 });
  });
});

/* ---------------------------------------------------------------------------
 * Component: gesture quiet (GESTURE_MS_PAAX), stall backstop, visibility
 * retry, supersede/stale handling, failure, unmount.
 * ------------------------------------------------------------------------ */

function fireWheel() {
  document.dispatchEvent(new WheelEvent('wheel', { deltaY: -100 }));
}

function firePointerDrag() {
  document.dispatchEvent(new MouseEvent('pointermove', { buttons: 1 }));
}

describe('PdfDetailOverlay — gesture quiet re-render (GESTURE_MS_PAAX=140)', () => {
  it('defers re-renders while a gesture is active and renders once it goes quiet', async () => {
    const { pool, requests } = makePool();
    const { rerender } = renderOverlay(pool);
    deliver(requests[0]);
    await flush();
    expect(requests).toHaveLength(1);

    // Gesture starts; viewport changes mid-gesture (live pan).
    await act(async () => {
      fireWheel();
      await Promise.resolve();
    });
    await act(async () => {
      rerender(
        <PdfDetailOverlay documentKey="run:0" pageNumber={7} metrics={METRICS} viewport={DEEP_PAN as DetailViewport} pool={pool} />,
      );
      await Promise.resolve();
    });
    // Still inside the 140ms window → no render yet.
    await act(async () => {
      vi.advanceTimersByTime(GESTURE_MS_PAAX - 1);
      await Promise.resolve();
    });
    expect(requests).toHaveLength(1);

    // Last event of the gesture re-arms the window; quiet fires after it.
    await act(async () => {
      fireWheel();
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(GESTURE_MS_PAAX - 1);
      await Promise.resolve();
    });
    expect(requests).toHaveLength(1);
    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(requests).toHaveLength(2);
    expect(requests[1].request.region).toEqual({ x: 175, y: 100, width: 750, height: 600 });
  });

  it('treats a pointer drag with a pressed button as a gesture', async () => {
    const { pool, requests } = makePool();
    const { rerender } = renderOverlay(pool);
    deliver(requests[0]);
    await flush();

    await act(async () => {
      firePointerDrag();
      await Promise.resolve();
    });
    await act(async () => {
      rerender(
        <PdfDetailOverlay documentKey="run:0" pageNumber={7} metrics={METRICS} viewport={DEEP_PAN as DetailViewport} pool={pool} />,
      );
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(GESTURE_MS_PAAX - 1);
      await Promise.resolve();
    });
    expect(requests).toHaveLength(1); // still quiet-waiting
    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(requests).toHaveLength(2);
  });

  it('does not treat hover (no buttons) as a gesture', async () => {
    const { pool, requests } = makePool();
    const { rerender } = renderOverlay(pool);
    deliver(requests[0]);
    await flush();

    await act(async () => {
      document.dispatchEvent(new MouseEvent('pointermove', { buttons: 0 }));
      await Promise.resolve();
    });
    await act(async () => {
      rerender(
        <PdfDetailOverlay documentKey="run:0" pageNumber={7} metrics={METRICS} viewport={DEEP_PAN as DetailViewport} pool={pool} />,
      );
      await Promise.resolve();
    });
    // No gesture window → render issued immediately on the prop change.
    expect(requests).toHaveLength(2);
  });
});

describe('PdfDetailOverlay — DETAIL_STALL_MS_PAAX backstop for wedged renders', () => {
  it('cancels a wedged render after 25s and re-issues a fresh one', async () => {
    const { pool, requests } = makePool();
    renderOverlay(pool);
    expect(requests).toHaveLength(1);

    await act(async () => {
      vi.advanceTimersByTime(DETAIL_STALL_MS_PAAX);
      await Promise.resolve();
    });
    expect(requests[0].cancel).toHaveBeenCalledTimes(1);
    expect(requests).toHaveLength(2); // re-issued with the same crop inputs

    deliver(requests[1]);
    await flush();
    expect(canvasFor()!.style.display).toBe('block');
    expect(drawImageSpy).toHaveBeenCalledTimes(1);
  });

  it('does not fire the backstop when the render resolves normally', async () => {
    const { pool, requests } = makePool();
    renderOverlay(pool);
    deliver(requests[0]);
    await flush();

    await act(async () => {
      vi.advanceTimersByTime(DETAIL_STALL_MS_PAAX + 1000);
      await Promise.resolve();
    });
    expect(requests[0].cancel).not.toHaveBeenCalled();
    expect(requests).toHaveLength(1);
  });
});

describe('PdfDetailOverlay — visibilitychange retry (hidden-tab wedge recovery)', () => {
  function setVisibility(state: 'visible' | 'hidden') {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => state,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }

  it('re-issues a stuck crop when the tab becomes visible again', async () => {
    const { pool, requests } = makePool();
    renderOverlay(pool);
    expect(requests).toHaveLength(1);

    await act(async () => {
      setVisibility('hidden');
      await Promise.resolve();
    });
    expect(requests).toHaveLength(1); // no action while hidden

    await act(async () => {
      setVisibility('visible');
      await Promise.resolve();
    });
    expect(requests[0].cancel).toHaveBeenCalledTimes(1);
    expect(requests).toHaveLength(2); // forced fresh render

    deliver(requests[1]);
    await flush();
    expect(canvasFor()!.style.display).toBe('block');
  });
});

describe('PdfDetailOverlay — supersede, stale and failed crops', () => {
  it('never paints a superseded (stale) bitmap over a newer crop', async () => {
    const { pool, requests } = makePool({ cancelRejects: false });
    const { rerender } = renderOverlay(pool);

    await act(async () => {
      rerender(
        <PdfDetailOverlay documentKey="run:0" pageNumber={7} metrics={METRICS} viewport={DEEP_PAN as DetailViewport} pool={pool} />,
      );
      await Promise.resolve();
    });
    expect(requests).toHaveLength(2);
    expect(requests[0].cancel).toHaveBeenCalledTimes(1);

    // The superseded crop resolves AFTER the new one was issued: must not paint.
    const staleDelivery = deliver(requests[0]);
    await flush();
    expect(staleDelivery.claim).not.toHaveBeenCalled();
    expect(drawImageSpy).not.toHaveBeenCalled();

    deliver(requests[1]);
    await flush();
    expect(drawImageSpy).toHaveBeenCalledTimes(1);
    expect(canvasFor()!.style.display).toBe('block');
  });

  it('keeps the last good crop when a new render fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { pool, requests } = makePool();
    const { rerender } = renderOverlay(pool);
    deliver(requests[0]);
    await flush();
    expect(canvasFor()!.style.display).toBe('block');

    await act(async () => {
      rerender(
        <PdfDetailOverlay documentKey="run:0" pageNumber={7} metrics={METRICS} viewport={DEEP_PAN as DetailViewport} pool={pool} />,
      );
      await Promise.resolve();
    });
    expect(requests).toHaveLength(2);
    await act(async () => {
      requests[1].reject(new Error('boom'));
      await Promise.resolve();
    });

    // Previous crop untouched: same buffer, same position, still visible.
    const canvas = canvasFor()!;
    expect(canvas.width).toBe(12000);
    expect(canvas.style.left).toBe('125px');
    expect(canvas.style.display).toBe('block');
    expect(drawImageSpy).toHaveBeenCalledTimes(1); // only the first crop painted
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('surfaces the failed crop in data-* and re-issues a retry on the next pass (lastKey reset)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { pool, requests } = makePool();
    const { rerender } = renderOverlay(pool);
    deliver(requests[0]);
    await flush();
    expect(canvasFor()!.style.display).toBe('block');
    // Failure markers cleared after a successful apply.
    expect(canvasFor()!.dataset.detailFailed).toBeUndefined();

    await act(async () => {
      rerender(
        <PdfDetailOverlay documentKey="run:0" pageNumber={7} metrics={METRICS} viewport={DEEP_PAN as DetailViewport} pool={pool} />,
      );
      await Promise.resolve();
    });
    expect(requests).toHaveLength(2);
    const failedKey = requests[1].request.documentKey + '|' + requests[1].request.region.x.toFixed(1);
    await act(async () => {
      requests[1].reject(new Error('boom'));
      await Promise.resolve();
    });

    // The failure is visible in diagnostics (reconciliation rec. 1+3):
    const canvas = canvasFor()!;
    expect(canvas.dataset.detailFailed).toBe('true');
    expect(canvas.dataset.detailRequestedDensity).toBe(String(requests[1].request.scale));
    expect(canvas.dataset.detailLastKey).toContain('run:0');

    // lastKeyRef was reset by the failure path: the NEXT pass with the SAME
    // logical inputs (new object identity, same key) must re-issue instead of
    // being swallowed by the dedup guard — the "frozen overlay" regression.
    await act(async () => {
      rerender(
        <PdfDetailOverlay
          documentKey="run:0"
          pageNumber={7}
          metrics={METRICS}
          viewport={{ x: DEEP_PAN.x, y: DEEP_PAN.y, width: DEEP_PAN.width, height: DEEP_PAN.height, zoom: DEEP_PAN.zoom, dpr: DEEP_PAN.dpr }}
          pool={pool}
        />,
      );
      await Promise.resolve();
    });
    expect(requests).toHaveLength(3);
    expect(failedKey).toBeTruthy(); // key distinctness sanity
    deliver(requests[2]);
    await flush();
    // Retry painted; failure markers cleared again.
    expect(canvas.dataset.detailFailed).toBeUndefined();
    expect(canvas.dataset.detailRequestedDensity).toBeUndefined();
    expect(canvas.style.display).toBe('block');
    expect(drawImageSpy).toHaveBeenCalledTimes(2);
    warnSpy.mockRestore();
  });

  it('cancels the in-flight render and clears timers on unmount', async () => {
    const { pool, requests } = makePool();
    const { unmount } = renderOverlay(pool);
    expect(requests).toHaveLength(1);

    unmount();
    expect(requests[0].cancel).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(100_000);
      await Promise.resolve();
    });
    // No timers left to fire — nothing crashes and nothing is painted.
    expect(drawImageSpy).not.toHaveBeenCalled();
  });
});
