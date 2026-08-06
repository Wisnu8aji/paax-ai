'use client';

/*
 * pdf-detail-overlay.tsx — ORION-F3 (Wave A), Master Plan §4.D.
 *
 * THE ANTI-COMPRESSION CORE of the review render: a per-viewport canvas that
 * re-renders JUST the visible region of the PDF at the density the screen
 * actually asks for (zoom × dpr), composited 1:1, so deep zoom never upscales
 * the whole-page base raster through the 8192px resolution wall.
 *
 * Model: OpenTakeOff detail view (TakeoffCanvas.jsx syncTilePanels +
 * tileCompositor.paintDetail — Apache-2.0), adopted per Owner decision and
 * renamed to the PAAX constants module (ORION-F1).
 *
 * Behaviour contract (Execution Instructions §2.3):
 *   1. Canvas overlay per viewport, position:absolute INSIDE the CSS-
 *      transformed page container, pointer-events:none, rendered BELOW the
 *      annotation/SVG layer (DOM order — no z-index, so later annotation
 *      siblings stay above).
 *   2. Engagement gate: effective zoom × dpr STRICTLY greater than
 *      DETAIL_ENGAGE_PAAX (1.15) before any render is issued.
 *   3. Region = visible viewport + DETAIL_MARGIN_PAAX (0.25) on each side,
 *      rendered at density zoom × dpr — arbitrary, NO pyramid quantization,
 *      NO density ceiling except cropDensityCapPAAX (F1 module).
 *   4. Composited 1:1 — the bitmap is region × density device px and the CSS
 *      box is the same region in page px; the overlay is never downsampled
 *      through the whole-page canvas.
 *   5. Gesture quiet: re-render only after GESTURE_MS_PAAX (140ms) of quiet;
 *      DETAIL_STALL_MS_PAAX (25s) backstop for a wedged render; and a
 *      visibilitychange retry for hidden-tab suspension.
 *
 * COORDINATE CONTRACT (for ORION-F4 integration):
 *   - The overlay canvas is positioned in PAGE units (PDF points at viewport
 *     scale 1): left/top = region origin, CSS width/height = region size.
 *   - The mounting container's local coordinate system MUST map 1 px = 1 pt
 *     at zoom 1 (page-pt space inside the CSS-transformed page element). Then
 *     on screen the region occupies region × zoom CSS px × dpr device px,
 *     which equals the bitmap (region × zoom × dpr) by construction — the
 *     browser never resamples the overlay (1:1 invariant).
 *   - F4 mounts the canvas inside pdf-page-layer.tsx's page div (after the
 *     base compositor canvas, before the annotation/SVG siblings) and passes
 *     the normalized viewport it already sends to PdfPageLayer.
 *
 * Protocol: renders are issued through a DetailRenderPool whose request()
 * accepts ORION-F1's DetailRenderRequest {documentKey, pageNumber, region,
 * scale, dark} (pdf-tile-protocol.ts). ORION-F2 threads scale/dark through
 * the worker; the overlay sends region in logical PDF-point space.
 */

import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import {
  DETAIL_ENGAGE_PAAX,
  DETAIL_MARGIN_PAAX,
  DETAIL_STALL_MS_PAAX,
  GESTURE_MS_PAAX,
} from './pdf-render-constants';
import { cropDensityCapPAAX } from './pdf-scale-math';
import type { DetailRenderRequest } from './pdf-tile-protocol';

export const DETAIL_OVERLAY_TESTID = 'pdf-detail-overlay';

/** Normalized viewport (fractions of the page, viewportSpace="normalized").
 *  Same shape DrawingCanvas already sends to PdfPageLayer. */
export interface DetailViewport {
  x: number;
  y: number;
  width: number;
  height: number;
  zoom: number;
  dpr: number;
}

/** Visible region + margin in page (PDF point) space. */
export interface DetailRegion {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Canvas geometry for a crop: bitmap in device px, CSS box in page px. */
export interface DetailCanvasGeometry {
  /** Bitmap width (device px). */
  bw: number;
  /** Bitmap height (device px). */
  bh: number;
  /** CSS left in page px (page-pt space, 1 px = 1 pt at zoom 1). */
  left: number;
  /** CSS top in page px. */
  top: number;
  /** CSS width in page px. */
  width: number;
  /** CSS height in page px. */
  height: number;
  /** Applied density (device px per logical pt) — zoom × dpr, capped only
   *  by cropDensityCapPAAX. */
  density: number;
}

/** Diagnostics/evidence report emitted on each paint or hide. */
export interface DetailOverlayReport {
  engaged: boolean;
  density: number;
  region: DetailRegion;
  bufferWidth: number;
  bufferHeight: number;
  renderKey: string;
  /** True when the last requested crop failed and the previous crop was kept
   *  on screen. Lets diagnostics distinguish a working 1:1 crop from a wedged
   *  render that silently kept the old one (F4 reconciliation rec. 1). */
  failed?: boolean;
  /** Requested density of the failed crop (zoom × dpr before the cap). */
  requestedDensity?: number;
}

/** Delivery shape of the pool request (single-claim bitmap, same semantics
 *  as PdfTileDelivery in pdf-tile-pool.ts). */
export interface DetailRenderDelivery {
  readonly width: number;
  readonly height: number;
  claim(): ImageBitmap | null;
}

export interface DetailRenderHandle {
  promise: Promise<DetailRenderDelivery>;
  cancel(): void;
}

/** Minimal pool contract the overlay needs. ORION-F2's extended
 *  createPdfTilePool().request() satisfies this structurally. */
export interface DetailRenderPool {
  request(request: DetailRenderRequest): DetailRenderHandle;
}

export interface PdfDetailOverlayProps {
  documentKey: string;
  /** 1-based PDF page number (pageIndex + 1). */
  pageNumber: number;
  /** Page metrics at viewport scale 1 (PDF points), from PdfPageMetrics. */
  metrics: { width: number; height: number };
  /** Normalized viewport. */
  viewport: DetailViewport;
  /** Pool that issues the detail render (extended protocol, F2). */
  pool: DetailRenderPool;
  /** Dark-mode raster flag forwarded to the worker (F2 extension). */
  dark?: boolean;
  /** Hard-disable (e.g. before metrics are known). */
  disabled?: boolean;
  /** Fired on every paint (engaged) and on every hide (disengaged). */
  onRendered?: (report: DetailOverlayReport) => void;
}

/* ---------------------------------------------------------------------------
 * Pure positioning/density math — unit-testable without DOM.
 * ------------------------------------------------------------------------ */

/** Effective device density the screen asks for: zoom × dpr (finite-guarded,
 *  non-finite inputs fall back to 1 so a bad viewport never poisons math). */
export function detailDensityFor(zoom: number, dpr: number): number {
  const z = Number.isFinite(zoom) ? zoom : 1;
  const d = Number.isFinite(dpr) ? dpr : 1;
  return z * d;
}

/** Engagement gate: engage once effective zoom × dpr STRICTLY exceeds
 *  DETAIL_ENGAGE_PAAX (1.15). At exactly 1.15 the overlay stays hidden. */
export function isDetailEngaged(zoom: number, dpr: number, engage = DETAIL_ENGAGE_PAAX): boolean {
  return detailDensityFor(zoom, dpr) > engage;
}

/** Visible region (+ margin per side) in page pt. viewport is normalized
 *  fractions of the page; margin is a fraction of the visible size. Clamped
 *  to page bounds. Returns null when nothing is visible. */
export function detailRegionFor(
  viewport: DetailViewport,
  metrics: { width: number; height: number },
  margin = DETAIL_MARGIN_PAAX,
): DetailRegion | null {
  const pageW = metrics.width;
  const pageH = metrics.height;
  if (!(pageW > 0 && pageH > 0)) return null;

  const vx = Number.isFinite(viewport.x) ? viewport.x : 0;
  const vy = Number.isFinite(viewport.y) ? viewport.y : 0;
  const vw = Number.isFinite(viewport.width) ? viewport.width : 1;
  const vh = Number.isFinite(viewport.height) ? viewport.height : 1;

  const left = Math.max(0, Math.min(pageW, vx * pageW));
  const top = Math.max(0, Math.min(pageH, vy * pageH));
  const right = Math.max(left, Math.min(pageW, (vx + vw) * pageW));
  const bottom = Math.max(top, Math.min(pageH, (vy + vh) * pageH));
  if (right <= left || bottom <= top) return null;

  const mw = (right - left) * margin;
  const mh = (bottom - top) * margin;
  const x0 = Math.max(0, left - mw);
  const y0 = Math.max(0, top - mh);
  const x1 = Math.min(pageW, right + mw);
  const y1 = Math.min(pageH, bottom + mh);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x0, y0, x1, y1 };
}

/** Arbitrary detail density, capped ONLY by cropDensityCapPAAX (region-canvas
 *  cap, F1). Never pyramid-quantized, never capped by the pyramid levels. */
export function detailTargetDensity(region: DetailRegion, requested: number): number {
  const cap = cropDensityCapPAAX(region.x1 - region.x0, region.y1 - region.y0);
  return Math.min(Math.max(0, requested), cap);
}

/** Canvas geometry for a crop: bitmap = round(region × density) device px;
 *  CSS box = region in page px (1:1 on screen at zoom × dpr density). */
export function detailCanvasGeometry(region: DetailRegion, density: number): DetailCanvasGeometry {
  const regionW = region.x1 - region.x0;
  const regionH = region.y1 - region.y0;
  const applied = detailTargetDensity(region, density);
  return {
    bw: Math.max(1, Math.round(regionW * applied)),
    bh: Math.max(1, Math.round(regionH * applied)),
    left: region.x0,
    top: region.y0,
    width: regionW,
    height: regionH,
    density: applied,
  };
}

/** Dedup key for an applied/in-flight crop. Sub-0.1pt region movement and
 *  sub-0.01 density change produce the same key (same as OpenTakeOff's
 *  renderKey tolerance); the 25% margin covers those pans anyway. */
export function detailRenderKeyFor(
  documentKey: string,
  region: DetailRegion,
  density: number,
  dark: boolean,
): string {
  return [
    documentKey,
    region.x0.toFixed(1),
    region.y0.toFixed(1),
    region.x1.toFixed(1),
    region.y1.toFixed(1),
    density.toFixed(2),
    dark ? 1 : 0,
  ].join('|');
}

/* ---------------------------------------------------------------------------
 * Component
 * ------------------------------------------------------------------------ */

const OVERLAY_STYLE: CSSProperties = {
  position: 'absolute',
  left: 0,
  top: 0,
  width: 0,
  height: 0,
  display: 'none',
  pointerEvents: 'none',
};

export function PdfDetailOverlay({
  documentKey,
  pageNumber,
  metrics,
  viewport,
  pool,
  dark = false,
  disabled = false,
  onRendered,
}: PdfDetailOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Latest props readable from any timer/callback (established repo pattern:
  // same as onMetricsRef.current = onMetrics in pdf-page-layer.tsx).
  const propsRef = useRef({ documentKey, pageNumber, metrics, viewport, pool, dark, disabled, onRendered });
  propsRef.current = { documentKey, pageNumber, metrics, viewport, pool, dark, disabled, onRendered };

  // Gesture quiet: every gesture event re-arms a GESTURE_MS window; the render
  // pass runs only once the window expires (OpenTakeOff GESTURE_MS pattern).
  const quietTimerRef = useRef<number | null>(null);
  // Stall backstop: a crop not resolved within DETAIL_STALL_MS is cancelled
  // and re-issued (wedged render recovery; primary recovery = visibilitychange).
  const stallTimerRef = useRef<number | null>(null);
  // In-flight crop handle; superseded by cancel, never by repaint.
  const inFlightRef = useRef<{ generation: number; handle: DetailRenderHandle } | null>(null);
  // Monotonic generation: a stale bitmap can never paint over a newer crop.
  const generationRef = useRef(0);
  // Last crop key applied (or being applied) — dedupes identical inputs.
  const lastKeyRef = useRef<string | null>(null);

  const clearStallTimer = () => {
    if (stallTimerRef.current !== null) {
      window.clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
  };

  const cancelInFlight = () => {
    const inFlight = inFlightRef.current;
    if (inFlight) {
      try {
        inFlight.handle.cancel();
      } catch {
        // handle already settled — nothing to cancel
      }
      inFlightRef.current = null;
    }
    clearStallTimer();
  };

  const updateDataAttributes = (engaged: boolean, density: number, region: DetailRegion | null, bw: number, bh: number, key: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.dataset.detailEngaged = engaged ? 'true' : 'false';
    canvas.dataset.detailDensity = engaged ? String(density) : '0';
    canvas.dataset.detailRegion = region ? `${region.x0.toFixed(1)},${region.y0.toFixed(1)},${region.x1.toFixed(1)},${region.y1.toFixed(1)}` : '';
    canvas.dataset.detailBuffer = engaged ? `${bw}x${bh}` : '0x0';
    canvas.dataset.detailKey = key;
    // A successful apply or an explicit hide clears the failure marker set by
    // the failure path (reconciliation rec. 1).
    delete canvas.dataset.detailFailed;
    delete canvas.dataset.detailRequestedDensity;
    delete canvas.dataset.detailLastKey;
  };

  const emitReport = (report: DetailOverlayReport) => {
    try {
      propsRef.current.onRendered?.(report);
    } catch {
      // a diagnostic consumer must never break the render loop
    }
  };

  const hideOverlay = () => {
    const canvas = canvasRef.current;
    cancelInFlight();
    lastKeyRef.current = null;
    if (canvas) canvas.style.display = 'none';
    updateDataAttributes(false, 0, null, 0, 0, '');
    emitReport({ engaged: false, density: 0, region: { x0: 0, y0: 0, x1: 0, y1: 0 }, bufferWidth: 0, bufferHeight: 0, renderKey: '' });
  };

  const applyCrop = (region: DetailRegion, geometry: DetailCanvasGeometry, bitmap: ImageBitmap, key: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Atomic swap: position, size, AND pixels change together so the previous
    // crop never shows at the new crop's scale for even one frame.
    canvas.width = geometry.bw;
    canvas.height = geometry.bh;
    canvas.style.left = `${geometry.left}px`;
    canvas.style.top = `${geometry.top}px`;
    canvas.style.width = `${geometry.width}px`;
    canvas.style.height = `${geometry.height}px`;
    canvas.style.display = 'block';
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
    updateDataAttributes(true, geometry.density, region, geometry.bw, geometry.bh, key);
    emitReport({
      engaged: true,
      density: geometry.density,
      region,
      bufferWidth: geometry.bw,
      bufferHeight: geometry.bh,
      renderKey: key,
    });
  };

  const armStallTimer = () => {
    clearStallTimer();
    stallTimerRef.current = window.setTimeout(() => {
      stallTimerRef.current = null;
      // Wedged render: the promise neither resolved nor rejected. Cancel the
      // stuck request and force a fresh one (lastKey cleared so the pass
      // re-issues even though the crop inputs are unchanged).
      const inFlight = inFlightRef.current;
      if (inFlight) {
        try {
          inFlight.handle.cancel();
        } catch {
          // already settled
        }
        inFlightRef.current = null;
      }
      lastKeyRef.current = null;
      runRenderPassRef.current();
    }, DETAIL_STALL_MS_PAAX);
  };

  const issueRender = (region: DetailRegion, geometry: DetailCanvasGeometry, key: string) => {
    const { documentKey: docKey, pageNumber: pageNum, pool: renderPool, dark: darkMode } = propsRef.current;
    generationRef.current += 1;
    const generation = generationRef.current;
    const request: DetailRenderRequest = {
      documentKey: docKey,
      pageNumber: pageNum,
      // Region in logical PDF-point space (F1 protocol contract).
      region: { x: region.x0, y: region.y0, width: geometry.width, height: geometry.height },
      // Arbitrary density = zoom × dpr, uncapped except cropDensityCapPAAX.
      scale: geometry.density,
      dark: darkMode,
    };
    lastKeyRef.current = key;
    const handle = renderPool.request(request);
    inFlightRef.current = { generation, handle };
    armStallTimer();
    handle.promise.then(
      (delivery) => {
        if (inFlightRef.current?.generation !== generation) return; // superseded
        inFlightRef.current = null;
        clearStallTimer();
        const bitmap = delivery.claim();
        if (!bitmap) return;
        try {
          applyCrop(region, geometry, bitmap, key);
        } finally {
          try {
            bitmap.close();
          } catch {
            // already closed
          }
        }
      },
      (error) => {
        if (inFlightRef.current?.generation !== generation) return; // superseded
        inFlightRef.current = null;
        clearStallTimer();
        if (error instanceof Error && error.name === 'AbortError') return;
        // Deliberately do NOT swap: keep the last good crop on screen. A sharp
        // crop is never replaced by a failed/coarser one (OpenTakeOff invariant).
        console.warn('[pdf-detail-overlay] detail crop failed — keeping the previous crop:', error);
        // F4 reconciliation rec. 1+3: a failed crop must NOT leave lastKeyRef
        // pinned to the failed key (that would make every later pass skip the
        // retry — the "frozen overlay" symptom), and the failure must be
        // visible in diagnostics instead of a stale 1:1 report. Reset the key
        // so the next pass re-issues, and surface the failure via data-* and
        // the report.
        if (lastKeyRef.current === key) {
          lastKeyRef.current = null;
        }
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.dataset.detailFailed = 'true';
          canvas.dataset.detailRequestedDensity = String(geometry.density);
          canvas.dataset.detailLastKey = key;
        }
        emitReport({
          engaged: false,
          density: 0,
          region,
          bufferWidth: 0,
          bufferHeight: 0,
          renderKey: key,
          failed: true,
          requestedDensity: geometry.density,
        });
      },
    );
  };

  // The render pass. Reads the latest props from propsRef so gesture-quiet
  // timers can render without waiting for a React re-render.
  const runRenderPassRef = useRef<() => void>(() => {});
  runRenderPassRef.current = () => {
    const canvas = canvasRef.current;
    const { documentKey: docKey, metrics: pageMetrics, viewport: vp, dark: darkMode, disabled: isDisabled } = propsRef.current;
    if (!canvas || isDisabled || !pageMetrics || pageMetrics.width <= 0 || pageMetrics.height <= 0) {
      hideOverlay();
      return;
    }
    // Engagement gate: effective zoom × dpr MUST strictly exceed 1.15.
    if (!isDetailEngaged(vp.zoom, vp.dpr)) {
      hideOverlay();
      return;
    }
    const region = detailRegionFor(vp, pageMetrics);
    if (!region) {
      hideOverlay();
      return;
    }
    const density = detailTargetDensity(region, detailDensityFor(vp.zoom, vp.dpr));
    const geometry = detailCanvasGeometry(region, density);
    const key = detailRenderKeyFor(docKey, region, density, darkMode);
    if (key === lastKeyRef.current && !inFlightRef.current) {
      // Identical crop already painted or in flight — nothing to do.
      return;
    }
    // Supersede any in-flight crop; the previous pixels stay on screen until
    // the new crop resolves.
    cancelInFlight();
    issueRender(region, geometry, key);
  };

  const armQuietTimer = () => {
    if (quietTimerRef.current !== null) window.clearTimeout(quietTimerRef.current);
    quietTimerRef.current = window.setTimeout(() => {
      quietTimerRef.current = null;
      runRenderPassRef.current();
    }, GESTURE_MS_PAAX);
  };

  // Main render effect: run the pass whenever inputs change. While a gesture
  // is active (quiet timer pending) the pass is deferred and the window
  // re-armed, so a live pan never storms the worker mid-gesture.
  useEffect(() => {
    if (quietTimerRef.current !== null) {
      armQuietTimer();
      return;
    }
    runRenderPassRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentKey, pageNumber, metrics, viewport, pool, dark, disabled]);

  // Gesture sensing: wheel + pointer drag on the document (capture) re-arm
  // the quiet window. The canvas has pointer-events:none, so gestures pass
  // through to the page handlers; this listener only observes them.
  useEffect(() => {
    const onGesture = () => armQuietTimer();
    const onPointerMove = (event: PointerEvent) => {
      // Dragging only — hover is not a gesture.
      if (event.buttons > 0) onGesture();
    };
    document.addEventListener('wheel', onGesture, { capture: true, passive: true });
    document.addEventListener('pointerdown', onGesture, { capture: true });
    document.addEventListener('pointermove', onPointerMove, { capture: true });
    return () => {
      document.removeEventListener('wheel', onGesture, { capture: true });
      document.removeEventListener('pointerdown', onGesture, { capture: true });
      document.removeEventListener('pointermove', onPointerMove, { capture: true });
    };
  }, []);

  // Primary wedge recovery: a hidden tab can suspend pdf.js renders
  // indefinitely (promise neither resolves nor rejects). On return, cancel
  // any stuck crop and force a fresh render.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      cancelInFlight();
      lastKeyRef.current = null;
      if (quietTimerRef.current !== null) {
        armQuietTimer();
      } else {
        runRenderPassRef.current();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Unmount: invalidate any in-flight resolution, cancel it, drop timers.
  useEffect(() => {
    return () => {
      generationRef.current += 1;
      cancelInFlight();
      if (quietTimerRef.current !== null) {
        window.clearTimeout(quietTimerRef.current);
        quietTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={canvasRef}
      data-testid={DETAIL_OVERLAY_TESTID}
      data-detail-overlay="true"
      aria-hidden="true"
      style={OVERLAY_STYLE}
    />
  );
}
