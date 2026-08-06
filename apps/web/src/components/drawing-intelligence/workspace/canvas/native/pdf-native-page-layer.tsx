'use client';

/*
 * PAAX native PDF page layer — progressive base + pinned crop + atomic swap.
 *
 * ORION-F4 ownership (Master Plan PAAX-2026-08-06-review-pdf-viewer-native §5):
 * the React native viewer shell. Consumes ORION-F2 (render client) and
 * ORION-F3 (crop cache) through narrow consumer interfaces so the real F2/F3
 * modules can be dropped in at Wave 2 without changing this component.
 *
 * Behavior (Master Plan §1, §8 DoD 1–13):
 *   1. Progressive base: base-first 4–8 MP → base-upgrade 16–28 MP in the
 *      background. The old base bitmap is NEVER cleared before the replacement
 *      is ready — the swap is one synchronous resize+draw of the new bitmap.
 *   2. Gesture → transform only: while viewport changes keep arriving, the
 *      layer issues NO render request; every change re-arms the settle window
 *      (120–160 ms, default GESTURE_MS_PAAX=140). Crop evaluation runs only
 *      after the window expires. In-flight crops are cancelled on new gesture.
 *   3. Cache first (F3 API) before render (F2 API): on settle, the layer asks
 *      the crop cache for exact/coverage hits; a covering cached crop means
 *      ZERO worker requests. On miss, exactly one foreground crop is issued.
 *   4. Pinned pixels: a valid crop canvas is never display:none'd, never
 *      cleared, never shrunk while a newer render is in flight. New bitmaps
 *      are swapped atomically into the SAME canvas element (resize + draw in
 *      one task → no blank frame, no sharp→blur→sharp transition).
 *   5. DOM order (caller places it inside the transformed page surface):
 *      underlay (thumbnail) → [this layer] base canvas → detail crop surfaces
 *      → SVG annotations/tools (rendered AFTER this layer by DrawingCanvas).
 *      No z-index is set so DOM order rules — later SVG paints above.
 *   6. Diagnostics: data-* attributes + onCropReport for ORION-F5.
 *
 * Wave-1 note: ORION-F2's final pool/worker and ORION-F3's crop cache are not
 * merged yet. This module consumes F2's OFFICIAL mock adapter
 * (pdf-render-mock-adapter.ts — same PdfRenderScheduler surface as the real
 * engine) and F3's REAL coverage cache (pdf-crop-cache.ts — findCovering /
 * set / estimatedBytes contract) so Wave 2 only swaps the mock scheduler for
 * the real pool, with zero component changes.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  canCommit,
  type PdfPageMetrics,
  type PdfRenderDelivery,
  type PdfRenderHandle,
  type PdfRenderScheduler,
  type RenderBaseRequest,
  type RenderCropRequest,
  type RenderRegion,
} from './pdf-native-contract';
import { createPdfRenderMockAdapter } from './pdf-render-mock-adapter';
import { PdfCropCache, type CachedCrop, type CropLookupRequest } from './pdf-crop-cache';
import {
  clampRegion,
  expandRegion,
  computeRenderKey,
  type PageBounds,
} from './pdf-render-geometry';
import { cropDensityCapPAAX } from '../pdf-scale-math';
import {
  DETAIL_ENGAGE_PAAX,
  DETAIL_MARGIN_PAAX,
  DETAIL_STALL_MS_PAAX,
  GESTURE_MS_PAAX,
  MAX_CANVAS_DIM_PAAX,
  QUALITY_CEILING_PAAX,
  RENDER_SCALE_PAAX,
} from '../pdf-render-constants';

/* ------------------------------------------------------------------ *
 * Constants                                                           *
 * ------------------------------------------------------------------ */

/** Base-first pixel budget: 4–8 MP band (Master Plan §5 F4.1). */
export const BASE_FIRST_PIXELS_PAAX = 6e6;
/** Base-upgrade pixel budget: 16–28 MP band (Master Plan §5 F4.1). */
export const BASE_UPGRADE_PIXELS_PAAX = 28e6;
/** Maximum crop surfaces mounted simultaneously (2–4 overlapping crops). */
export const MAX_CROP_SURFACES_PAAX = 4;

export const NATIVE_LAYER_TESTID = 'pdf-native-page-layer';
export const NATIVE_BASE_TESTID = 'pdf-native-base';
export const NATIVE_CROP_TESTID = 'pdf-native-crop';

/* ------------------------------------------------------------------ *
 * Types                                                               *
 * ------------------------------------------------------------------ */

/** Normalized viewport (fractions of the page) — same shape as the legacy
 *  PdfPageLayer receives from DrawingCanvas. */
export interface NativeViewport {
  x: number;
  y: number;
  width: number;
  height: number;
  zoom: number;
  dpr: number;
}

/** A crop currently mounted as a canvas surface (sheet space). */
export interface CropSurface {
  key: string;
  region: RenderRegion;
  density: number;
  /** True when this surface was committed from a foreground render (pinned). */
  committed: boolean;
}

/** Diagnostics report emitted to F5 (lightweight, no internals). */
export interface NativeCropReport {
  kind:
    | 'base-first'
    | 'base-upgrade'
    | 'crop-render'
    | 'crop-cache-hit'
    | 'crop-cache-miss'
    | 'crop-cancelled'
    | 'crop-error'
    | 'dispose';
  documentKey: string;
  pageIndex: number;
  region?: RenderRegion;
  density?: number;
  cacheHit?: boolean;
  renderMs?: number;
  swapMs?: number;
  generation?: number;
}

/** Consumer surface for the F2 render engine: the REAL scheduler contract
 *  (PdfRenderScheduler). Wave 1 runs the official mock adapter
 *  (createPdfRenderMockAdapter — identical surface); Wave 2 swaps in the
 *  real pool-backed scheduler with zero component changes. */
export type NativeRenderClient = PdfRenderScheduler;

/** Consumer surface for the F3 crop cache: the REAL coverage cache class
 *  (PdfCropCache — findCovering / lookupCrops / set / estimatedBytes). */
export type NativeCropCache = PdfCropCache;

export interface PdfNativePageLayerProps {
  runId: string;
  pageIndex: number;
  /** Normalized viewport (0..1 fractions of the page). */
  viewport: NativeViewport;
  /** Dark-mode raster flag; separated in cache keys. */
  dark?: boolean;
  onMetrics?: (metrics: { width: number; height: number }) => void;
  /** Fired once per document when the base-first bitmap is painted. */
  onBaseReady?: (documentKey: string) => void;
  onCropReport?: (report: NativeCropReport) => void;
  /** Wave-1 injectables: F2 mock adapter (PdfRenderScheduler) and F3 cache
   *  (PdfCropCache). Tests inject deterministic instances; defaults are
   *  createPdfRenderMockAdapter() + new PdfCropCache(). */
  renderClient?: NativeRenderClient;
  cropCache?: NativeCropCache;
  /** Quiet window before crop evaluation (120–160 ms). */
  settleMs?: number;
  /** Document key override (defaults to `${runId}:${pageIndex}`). */
  documentKey?: string;
  /** Test hook: surface refs for asserting painted pixels. */
  surfaceRef?: React.MutableRefObject<Map<string, HTMLCanvasElement> | null>;
}

/* ------------------------------------------------------------------ *
 * Pure math (F4-owned; unit-testable without DOM)                     *
 * ------------------------------------------------------------------ */

/**
 * Base raster density for a full-page bitmap that fits `budgetPx` device px.
 * Unlike fitDensityPAAX (which caps at 1.0 for screen-fit), this targets the
 * Master Plan's explicit pixel budgets: 4–8 MP first paint, 16–28 MP upgrade.
 * Clamped by canvas dimension and quality ceiling so no render exceeds the
 * platform limits.
 */
export function nativeBaseDensity(pageW: number, pageH: number, budgetPx: number): number {
  if (!(pageW > 0 && pageH > 0) || !(budgetPx > 0)) return RENDER_SCALE_PAAX;
  const area = pageW * pageH;
  const byBudget = Math.sqrt(budgetPx / area);
  const byDim = Math.min(MAX_CANVAS_DIM_PAAX / pageW, MAX_CANVAS_DIM_PAAX / pageH);
  const capped = Math.min(byBudget, byDim);
  return Math.max(0.1, Math.min(QUALITY_CEILING_PAAX, capped));
}

/** Effective device density the viewport asks for (zoom × dpr), finite-guarded. */
export function nativeCropDensityFor(zoom: number, dpr: number): number {
  const z = Number.isFinite(zoom) ? zoom : 1;
  const d = Number.isFinite(dpr) ? dpr : 1;
  return Math.max(0, z * d);
}

/** Engagement gate: crops only matter once effective zoom × dpr exceeds 1.15. */
export function isNativeDetailEngaged(zoom: number, dpr: number, engage = DETAIL_ENGAGE_PAAX): boolean {
  return nativeCropDensityFor(zoom, dpr) > engage;
}

/** Visible region (+ margin per side) in PDF-point space, clamped to the page. */
export function nativeCropRegionFor(
  viewport: NativeViewport,
  metrics: { width: number; height: number },
  margin = DETAIL_MARGIN_PAAX,
): RenderRegion | null {
  const pageW = metrics.width;
  const pageH = metrics.height;
  if (!(pageW > 0 && pageH > 0)) return null;
  const vx = Number.isFinite(viewport.x) ? viewport.x : 0;
  const vy = Number.isFinite(viewport.y) ? viewport.y : 0;
  const vw = Number.isFinite(viewport.width) ? viewport.width : 1;
  const vh = Number.isFinite(viewport.height) ? viewport.height : 1;
  const visible: RenderRegion = { x: vx * pageW, y: vy * pageH, width: vw * pageW, height: vh * pageH };
  const expanded = expandRegion(visible, margin, margin);
  const clamped = clampRegion(expanded, { width: pageW, height: pageH } as PageBounds);
  if (!(clamped.width > 0 && clamped.height > 0)) return null;
  return clamped;
}

/** Final crop density: zoom × dpr capped by the region-canvas cap. */
export function nativeCropDensity(region: RenderRegion, requested: number): number {
  const cap = cropDensityCapPAAX(region.width, region.height);
  return Math.min(Math.max(0, requested), cap);
}

/* ------------------------------------------------------------------ *
 * Component                                                           *
 * ------------------------------------------------------------------ */

const NATIVE_LAYER_STYLE: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  overflow: 'hidden',
};

const BASE_CANVAS_STYLE: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  top: 0,
  pointerEvents: 'none',
};

const CROP_CANVAS_STYLE: React.CSSProperties = {
  position: 'absolute',
  pointerEvents: 'none',
};

export function PdfNativePageLayer({
  runId,
  pageIndex,
  viewport,
  dark = false,
  onMetrics,
  onBaseReady,
  onCropReport,
  renderClient: renderClientProp,
  cropCache: cropCacheProp,
  settleMs = GESTURE_MS_PAAX,
  documentKey: documentKeyProp,
  surfaceRef,
}: PdfNativePageLayerProps) {
  const documentKey = documentKeyProp ?? `${runId}:${pageIndex}`;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cropCanvasesRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const metricsRef = useRef<PdfPageMetrics | null>(null);
  const [cropSurfaces, setCropSurfaces] = useState<CropSurface[]>([]);
  const pendingBitmapsRef = useRef<Map<string, { bitmap: ImageBitmap; widthPx: number; heightPx: number }>>(new Map());
  const paintedKeysRef = useRef<Set<string>>(new Set());

  // Generations: base and crop lanes are separate so a settle evaluation never
  // invalidates an in-flight background base-upgrade.
  const baseGenRef = useRef(0);
  const cropGenRef = useRef(0);
  const registeredRef = useRef<Set<string>>(new Set());
  const inFlightBaseRef = useRef<{ gen: number; handle: PdfRenderHandle } | null>(null);
  const inFlightCropRef = useRef<{ gen: number; key: string; handle: PdfRenderHandle; startedAt: number } | null>(null);
  const currentCropKeyRef = useRef<string | null>(null);
  const lastCommittedCropRef = useRef<string | null>(null);
  const baseDensityRef = useRef<number>(RENDER_SCALE_PAAX);
  const settleTimerRef = useRef<number | null>(null);
  const stallTimerRef = useRef<number | null>(null);
  const visibilityRetriedRef = useRef(false);
  const disposedRef = useRef(false);
  const baseReadyFiredRef = useRef<string | null>(null);

  const cacheRef = useRef<NativeCropCache | null>(cropCacheProp ?? null);
  if (!cacheRef.current) cacheRef.current = new PdfCropCache();
  const renderClientRef = useRef<NativeRenderClient | null>(renderClientProp ?? null);
  if (!renderClientRef.current) {
    // Wave 1: F2's OFFICIAL mock adapter — same PdfRenderScheduler surface as
    // the real engine (same priority ordering, generation guard, commit rule,
    // cancellation). Wave 2 replaces this with the real pool-backed scheduler
    // with zero component changes.
    renderClientRef.current = createPdfRenderMockAdapter();
  }

  // Latest props readable from any timer/callback (repo pattern).
  const propsRef = useRef({ dark, onMetrics, onBaseReady, onCropReport, settleMs });
  propsRef.current = { dark, onMetrics, onBaseReady, onCropReport, settleMs };

  /* ---------------- data-attribute diagnostics ---------------- */

  const setDiagnostics = (patch: Record<string, string | number | undefined>) => {
    const root = rootRef.current;
    if (!root) return;
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      root.dataset[key] = String(value);
    }
  };

  const report = (report: NativeCropReport) => {
    try {
      propsRef.current.onCropReport?.(report);
    } catch {
      // Diagnostics must never break rendering.
    }
  };

  /* ---------------- atomic paint helpers ---------------- */

  const paintBitmap = (
    canvas: HTMLCanvasElement | null,
    bitmap: ImageBitmap,
    widthPx: number,
    heightPx: number,
    startAt: number,
  ) => {
    if (!canvas) return;
    // ATOMIC SWAP: resize + draw in the same synchronous task. The browser
    // paints after the task, so no blank frame and no sharp→blur→sharp
    // transition; old pixels remain visible until this exact moment.
    canvas.width = Math.max(1, Math.round(widthPx));
    canvas.height = Math.max(1, Math.round(heightPx));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    try {
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    } catch {
      // A bitmap that cannot be drawn (mock/transferred/closed) must never
      // break the pinned-pixels invariant: the canvas is already sized, and
      // the old pixels stay until a valid bitmap arrives.
    }
    const swapMs = performance.now() - startAt;
    setDiagnostics({ swapMs: swapMs.toFixed(1) });
    return swapMs;
  };

  /* ---------------- base pipeline ---------------- */

  const paintBase = (bitmap: ImageBitmap, widthPx: number, heightPx: number, kind: 'base-first' | 'base-upgrade', startAt: number) => {
    const canvas = baseCanvasRef.current;
    if (!canvas) return;
    paintBitmap(canvas, bitmap, widthPx, heightPx, startAt);
    const ms = performance.now() - startAt;
    setDiagnostics({ basePaintMs: ms.toFixed(1) });
    if (kind === 'base-first') {
      setDiagnostics({ firstPaintMs: ms.toFixed(1) });
      const key = documentKey;
      if (baseReadyFiredRef.current !== key) {
        baseReadyFiredRef.current = key;
        try {
          propsRef.current.onBaseReady?.(key);
        } catch {
          // Caller errors must not wedge rendering.
        }
      }
    }
    report({ kind, documentKey, pageIndex, density: baseDensityRef.current, renderMs: ms });
  };

  const runBase = async (request: RenderBaseRequest) => {
    const client = renderClientRef.current;
    if (!client) return;
    const startAt = performance.now();
    baseDensityRef.current = request.density;
    const handle = client.submitBase(request);
    registeredRef.current.add(request.requestId);
    inFlightBaseRef.current = { gen: request.generation, handle };
    setDiagnostics({ basePaintMs: 'pending' });
    try {
      const delivery = await handle.promise;
      const bitmap = delivery.claim();
      if (!bitmap) return;
      const allowed = canCommit(
        { generation: request.generation, requestId: request.requestId, pageIndex: request.pageIndex },
        baseGenRef.current,
        registeredRef.current,
        request.pageIndex,
      );
      registeredRef.current.delete(request.requestId);
      if (inFlightBaseRef.current?.handle === handle) inFlightBaseRef.current = null;
      if (!allowed) {
        try {
          bitmap.close();
        } catch {
          // ignore
        }
        return;
      }
      paintBase(bitmap, delivery.result.widthPx, delivery.result.heightPx, request.priority, startAt);
    } catch (error) {
      registeredRef.current.delete(request.requestId);
      if (inFlightBaseRef.current?.handle === handle) inFlightBaseRef.current = null;
      report({ kind: 'crop-error', documentKey, pageIndex, generation: request.generation });
    }
  };

  /* ---------------- document open + progressive base ---------------- */

  useEffect(() => {
    const client = renderClientRef.current;
    if (!client) return;
    let cancelled = false;
    disposedRef.current = false;
    visibilityRetriedRef.current = false;
    baseReadyFiredRef.current = null;
    baseGenRef.current += 1;
    cropGenRef.current += 1;
    const baseGen = baseGenRef.current;
    setCropSurfaces([]);
    paintedKeysRef.current.clear();
    cropCanvasesRef.current.clear();
    pendingBitmapsRef.current.clear();
    lastCommittedCropRef.current = null;
    currentCropKeyRef.current = null;
    inFlightCropRef.current = null;
    inFlightBaseRef.current = null;
    registeredRef.current.clear();
    setDiagnostics({
      firstPaintMs: undefined,
      basePaintMs: undefined,
      cropRenderMs: undefined,
      cropCacheHit: undefined,
      swapMs: undefined,
    });

    const open = async () => {
      try {
        const metrics = await client.open(runId, pageIndex);
        if (cancelled || disposedRef.current) return;
        metricsRef.current = metrics;
        // F2 scheduler commit rule: results for non-active pages are dropped
        // at the engine level; the layer's own canCommit() re-checks too.
        client.setActivePage(runId, pageIndex);
        try {
          propsRef.current.onMetrics?.({ width: metrics.width, height: metrics.height });
        } catch {
          // ignore caller errors
        }
        // Base-first: 4–8 MP.
        const firstDensity = nativeBaseDensity(metrics.width, metrics.height, BASE_FIRST_PIXELS_PAAX);
        const firstRequest: RenderBaseRequest = {
          requestId: `${documentKey}:base-first:${baseGen}`,
          generation: baseGen,
          runId,
          pageIndex,
          density: firstDensity,
          darkMode: propsRef.current.dark,
          priority: 'base-first',
        };
        await runBase(firstRequest);
        if (cancelled || disposedRef.current) return;
        // Base-upgrade: 16–28 MP in the background (old base stays pinned).
        const upgradeDensity = nativeBaseDensity(metrics.width, metrics.height, BASE_UPGRADE_PIXELS_PAAX);
        if (upgradeDensity > firstDensity + 1e-6) {
          const upgradeRequest: RenderBaseRequest = {
            requestId: `${documentKey}:base-upgrade:${baseGen}`,
            generation: baseGen,
            runId,
            pageIndex,
            density: upgradeDensity,
            darkMode: propsRef.current.dark,
            priority: 'base-upgrade',
          };
          await runBase(upgradeRequest);
        }
      } catch (error) {
        if (!cancelled && !disposedRef.current) {
          report({ kind: 'crop-error', documentKey, pageIndex });
        }
      }
    };
    void open();

    return () => {
      cancelled = true;
      // Cancel in-flight base + crop, dispose the F3 cache.
      const clientToClose = renderClientRef.current;
      inFlightBaseRef.current?.handle.cancel();
      inFlightCropRef.current?.handle.cancel();
      inFlightBaseRef.current = null;
      inFlightCropRef.current = null;
      registeredRef.current.clear();
      if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
      if (stallTimerRef.current !== null) window.clearTimeout(stallTimerRef.current);
      cacheRef.current?.dispose();
      cacheRef.current = null;
      try {
        clientToClose?.closeRun(runId);
      } catch {
        // ignore
      }
      report({ kind: 'dispose', documentKey, pageIndex });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, pageIndex]);

  /* ---------------- crop surfaces: canvas registry ---------------- */

  const registerCropCanvas = (key: string, canvas: HTMLCanvasElement | null) => {
    if (canvas) {
      cropCanvasesRef.current.set(key, canvas);
      const pending = pendingBitmapsRef.current.get(key);
      if (pending && !paintedKeysRef.current.has(key)) {
        paintedKeysRef.current.add(key);
        paintBitmap(canvas, pending.bitmap, pending.widthPx, pending.heightPx, performance.now());
        pendingBitmapsRef.current.delete(key);
      }
      if (surfaceRef) surfaceRef.current = cropCanvasesRef.current;
    } else {
      cropCanvasesRef.current.delete(key);
      if (surfaceRef) surfaceRef.current = cropCanvasesRef.current;
    }
  };

  /* ---------------- crop pipeline ---------------- */

  const clearStallTimer = () => {
    if (stallTimerRef.current !== null) {
      window.clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
  };

  const cancelInFlightCrop = () => {
    const inFlight = inFlightCropRef.current;
    if (!inFlight) return;
    try {
      inFlight.handle.cancel();
    } catch {
      // already settled
    }
    registeredRef.current.delete(currentCropKeyRef.current ?? '');
    inFlightCropRef.current = null;
    clearStallTimer();
  };

  const commitCrop = async (handle: PdfRenderHandle, request: RenderCropRequest, key: string, startedAt: number) => {
    try {
      const delivery = await handle.promise;
      const bitmap = delivery.claim();
      if (!bitmap) return;
      const allowed = canCommit(
        { generation: request.generation, requestId: request.requestId, pageIndex: request.pageIndex },
        cropGenRef.current,
        registeredRef.current,
        request.pageIndex,
      );
      registeredRef.current.delete(request.requestId);
      if (inFlightCropRef.current?.handle === handle) inFlightCropRef.current = null;
      clearStallTimer();
      if (!allowed) {
        try {
          bitmap.close();
        } catch {
          // ignore
        }
        return;
      }
      const widthPx = delivery.result.widthPx;
      const heightPx = delivery.result.heightPx;
      // PAINT FIRST, cache second: the mounted canvas copies the bitmap into
      // its own raster, so a later cache rejection/eviction that closes the
      // bitmap can never blank a mounted surface (pinned-pixels invariant).
      pendingBitmapsRef.current.set(key, { bitmap, widthPx, heightPx });
      paintedKeysRef.current.delete(key);
      lastCommittedCropRef.current = key;
      const existing = cropCanvasesRef.current.get(key);
      if (existing) {
        // Atomic swap into the SAME canvas: old pixels stay until now.
        paintedKeysRef.current.add(key);
        paintBitmap(existing, bitmap, widthPx, heightPx, startedAt);
        pendingBitmapsRef.current.delete(key);
      }
      setCropSurfaces((previous) => {
        const next = previous.filter((surface) => surface.key !== key);
        const surface: CropSurface = { key, region: request.region, density: request.density, committed: true };
        return [...next, surface].slice(-MAX_CROP_SURFACES_PAAX);
      });
      // Cache for future revisits (F3 API — CropStoreRequest shape).
      // estimatedBytes comes straight from the F2 delivery (contract:
      // widthPx × heightPx × 4). The cache owns this reference from now on.
      cacheRef.current?.set({
        pageIndex,
        region: request.region,
        density: request.density,
        darkMode: request.darkMode,
        bitmap,
        widthPx,
        heightPx,
        estimatedBytes: delivery.result.estimatedBytes,
      });
      const renderMs = performance.now() - startedAt;
      setDiagnostics({ cropRenderMs: renderMs.toFixed(1), cropCacheHit: '0' });
      report({
        kind: 'crop-render',
        documentKey,
        pageIndex,
        region: request.region,
        density: request.density,
        renderMs,
        generation: request.generation,
      });
    } catch (error) {
      registeredRef.current.delete(request.requestId);
      if (inFlightCropRef.current?.handle === handle) inFlightCropRef.current = null;
      clearStallTimer();
      report({ kind: 'crop-error', documentKey, pageIndex, generation: request.generation });
    }
  };

  /** Mount cached crops as committed surfaces without any worker request.
   *  The F3 cache owns the bitmaps; the layer only draws them (never closes).
   *  Supports 2–4 overlapping crops per settle (Master Plan §5 F4.7). */
  const mountCachedCrops = (crops: CachedCrop[]) => {
    const selected = crops.slice(0, MAX_CROP_SURFACES_PAAX);
    for (const crop of selected) {
      pendingBitmapsRef.current.set(crop.key, {
        bitmap: crop.bitmap as ImageBitmap,
        widthPx: crop.widthPx,
        heightPx: crop.heightPx,
      });
      paintedKeysRef.current.delete(crop.key);
    }
    if (selected.length > 0) lastCommittedCropRef.current = selected[0].key;
    setCropSurfaces((previous) => {
      const merged = new Map<string, CropSurface>();
      for (const surface of previous) merged.set(surface.key, surface);
      for (const crop of selected) {
        merged.set(crop.key, { key: crop.key, region: crop.region, density: crop.density, committed: true });
      }
      return [...merged.values()].slice(-MAX_CROP_SURFACES_PAAX);
    });
  };

  const evaluateCrop = () => {
    if (disposedRef.current) return;
    const metrics = metricsRef.current;
    if (!metrics) return;
    const viewportNow = viewportRef.current;
    const darkNow = propsRef.current.dark;
    const client = renderClientRef.current;
    if (!client) return;
    // Engagement gate: at low zoom the base raster is sufficient.
    if (!isNativeDetailEngaged(viewportNow.zoom, viewportNow.dpr)) {
      setDiagnostics({ cropCacheHit: '0' });
      report({ kind: 'crop-cache-miss', documentKey, pageIndex, cacheHit: false });
      return;
    }
    const region = nativeCropRegionFor(viewportNow, metrics);
    if (!region) {
      report({ kind: 'crop-cache-miss', documentKey, pageIndex, cacheHit: false });
      return;
    }
    const requested = nativeCropDensityFor(viewportNow.zoom, viewportNow.dpr);
    const density = nativeCropDensity(region, requested);
    if (!(density > 0)) {
      report({ kind: 'crop-cache-miss', documentKey, pageIndex, cacheHit: false });
      return;
    }
    const key = computeRenderKey(pageIndex, region, density, darkNow);
    currentCropKeyRef.current = key;
    const lookup: CropLookupRequest = { pageIndex, region, density, darkMode: darkNow };

    // 1) F3 cache first: exact render-key fast path. On hit, also mount any
    //    supplementary overlapping crops (2–4 surfaces, F3 lookupCrops API).
    const exact = cacheRef.current?.getExact(key);
    if (exact) {
      const crops = cacheRef.current?.lookupCrops(lookup) ?? [];
      mountCachedCrops([exact, ...crops.filter((crop) => crop.key !== exact.key)]);
      setDiagnostics({ cropCacheHit: '1' });
      report({ kind: 'crop-cache-hit', documentKey, pageIndex, region, density, cacheHit: true });
      return;
    }

    // 2) F3 coverage-aware lookup: findCovering returns the best cached crop
    //    that fully contains the viewport with sufficient density — a covering
    //    crop means ZERO worker requests (DoD 5). Supplementary intersecting
    //    crops mount alongside (2–4 overlapping surfaces).
    const covering = cacheRef.current?.findCovering(lookup);
    if (covering) {
      const crops = cacheRef.current?.lookupCrops(lookup) ?? [];
      mountCachedCrops([covering, ...crops.filter((crop) => crop.key !== covering.key)]);
      setDiagnostics({ cropCacheHit: '1' });
      report({ kind: 'crop-cache-hit', documentKey, pageIndex, region, density, cacheHit: true });
      return;
    }

    // 3) Miss → exactly ONE foreground crop render. Existing (pinned) crops
    //    stay mounted while this renders.
    setDiagnostics({ cropCacheHit: '0' });
    report({ kind: 'crop-cache-miss', documentKey, pageIndex, region, density, cacheHit: false });
    cropGenRef.current += 1;
    const generation = cropGenRef.current;
    const requestId = `${documentKey}:crop:${generation}`;
    const request: RenderCropRequest = {
      requestId,
      generation,
      runId,
      pageIndex,
      region,
      density,
      darkMode: darkNow,
      priority: 'foreground',
    };
    const handle = client.submitCrop(request);
    registeredRef.current.add(requestId);
    const startedAt = performance.now();
    inFlightCropRef.current = { gen: generation, key, handle, startedAt };
    // Stall backstop: a wedged render must not spin forever — cancel + keep old
    // pixels; primary recovery is the next settle / visibilitychange retry.
    stallTimerRef.current = window.setTimeout(() => {
      cancelInFlightCrop();
      report({ kind: 'crop-cancelled', documentKey, pageIndex, generation });
    }, DETAIL_STALL_MS_PAAX);
    void commitCrop(handle, request, key, startedAt);
  };

  /* ---------------- settle gating (gesture → transform only) ---------------- */

  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  // Any viewport change is a gesture event: cancel in-flight crop (latest-wins,
  // old pixels stay pinned) and re-arm the settle window. No render request is
  // issued while the window is open (DoD 1).
  useEffect(() => {
    if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    cancelInFlightCrop();
    settleTimerRef.current = window.setTimeout(() => {
      settleTimerRef.current = null;
      evaluateCrop();
    }, Math.max(120, Math.min(160, settleMs)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport.x, viewport.y, viewport.width, viewport.height, viewport.zoom, viewport.dpr, pageIndex]);

  // Visibility restore: re-evaluate after tab hidden → visible (stall recovery).
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
      evaluateCrop();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Paint any pending crop bitmaps once their canvas element exists.
  useLayoutEffect(() => {
    for (const [key, pending] of pendingBitmapsRef.current) {
      const canvas = cropCanvasesRef.current.get(key);
      if (canvas && !paintedKeysRef.current.has(key)) {
        paintedKeysRef.current.add(key);
        paintBitmap(canvas, pending.bitmap, pending.widthPx, pending.heightPx, performance.now());
        pendingBitmapsRef.current.delete(key);
      }
    }
  });

  /* ---------------- cleanup on unmount ---------------- */

  useEffect(() => {
    return () => {
      disposedRef.current = true;
      if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
      if (stallTimerRef.current !== null) window.clearTimeout(stallTimerRef.current);
      inFlightBaseRef.current?.handle.cancel();
      inFlightCropRef.current?.handle.cancel();
      registeredRef.current.clear();
      cacheRef.current?.dispose();
      try {
        renderClientRef.current?.closeRun(runId);
        renderClientRef.current?.dispose();
      } catch {
        // ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- render ---------------- */

  return (
    <div ref={rootRef} data-testid={NATIVE_LAYER_TESTID} data-document-key={documentKey} data-viewer-mode="native" style={NATIVE_LAYER_STYLE}>
      {/* DOM order: base canvas → detail crop surfaces (SVG is rendered after
          this layer by DrawingCanvas, so it paints above). */}
      <canvas
        ref={baseCanvasRef}
        data-testid={NATIVE_BASE_TESTID}
        data-base-document-key={documentKey}
        style={{ ...BASE_CANVAS_STYLE, width: metricsRef.current?.width ?? 0, height: metricsRef.current?.height ?? 0 }}
      />
      {cropSurfaces.map((surface) => (
        <canvas
          key={surface.key}
          ref={(node) => registerCropCanvas(surface.key, node)}
          data-testid={NATIVE_CROP_TESTID}
          data-crop-key={surface.key}
          data-crop-committed={surface.committed ? 'true' : 'false'}
          data-crop-region={`${surface.region.x.toFixed(1)},${surface.region.y.toFixed(1)},${surface.region.width.toFixed(1)},${surface.region.height.toFixed(1)}`}
          style={{
            ...CROP_CANVAS_STYLE,
            left: surface.region.x,
            top: surface.region.y,
            width: surface.region.width,
            height: surface.region.height,
          }}
        />
      ))}
    </div>
  );
}

