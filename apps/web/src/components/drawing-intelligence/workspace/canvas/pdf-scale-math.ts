/*
 * PAAX scale math — pure functions, ported from OpenTakeOff (Apache-2.0)
 * with the PAAX suffix per Master Plan §4.B (PAAX-2026-08-05-review-render-aktual):
 *   - autoRenderScalePAAX ← web/src/lib/canvasUtil.js `autoRenderScale`
 *   - fitDensityPAAX      ← web/src/lib/tiles.ts `fitDensity`
 *   - clampZoomPAAX       ← web/src/lib/canvasUtil.js `clamp`
 *   - cropDensityCapPAAX  ← Master Plan §4.B (region-canvas cap only)
 *
 * No DOM, no React, no pdf.js — safe for worker/main thread and unit tests.
 */
import {
  MAX_CANVAS_AREA_PAAX,
  MAX_CANVAS_DIM_PAAX,
  MAX_PANEL_AREA_PAAX,
  MAX_SCALE_PAAX,
  MIN_SCALE_PAAX,
  QUALITY_CEILING_PAAX,
  RENDER_SCALE_PAAX,
} from './pdf-render-constants';

/**
 * Largest pdf.js render scale a wPt×hPt-point page can use within the BASE
 * raster budget. Mirrors OpenTakeOff's autoRenderScale: prefers the baseline
 * RENDER_SCALE_PAAX, never above QUALITY_CEILING_PAAX, and never above the
 * physical canvas caps — an oversized page (an ingested image is a 1px=1pt
 * page) must render BELOW baseline or the canvas blows the budget.
 *
 * Used to cap the density of the BASE raster only; on-screen sharpness at
 * deep zoom comes from the detail overlay (see cropDensityCapPAAX).
 */
export function autoRenderScalePAAX(wPt: number, hPt: number): number {
  if (!(wPt > 0 && hPt > 0)) return RENDER_SCALE_PAAX;
  const byDim = Math.min(MAX_CANVAS_DIM_PAAX / wPt, MAX_CANVAS_DIM_PAAX / hPt);
  const byArea = Math.sqrt(MAX_PANEL_AREA_PAAX / (wPt * hPt));
  const cap = Math.min(byDim, byArea);
  return Math.min(Math.max(RENDER_SCALE_PAAX, Math.min(QUALITY_CEILING_PAAX, cap)), cap);
}

/**
 * Exact density whose full-sheet composite hits `targetArea` device px.
 * Mirrors OpenTakeOff tiles.ts fitDensity — never denser than 1.0: past the
 * RENDER_SCALE baseline there is no more detail to recover in a whole-sheet
 * raster, only supersampling a sheet nobody asked for.
 */
export function fitDensityPAAX(imgW: number, imgH: number, targetArea: number): number {
  const area = Math.max(1, imgW * imgH);
  return Math.min(1, Math.sqrt(targetArea / area));
}

/**
 * Max density a DETAIL region canvas of `width`×`height` logical pt may use:
 *   min(MAX_CANVAS_DIM_PAAX/width, MAX_CANVAS_DIM_PAAX/height,
 *       sqrt(MAX_CANVAS_AREA_PAAX/(width*height)))
 * Only bounds the REGION canvas (Master Plan §4.B). Because the detail region
 * is viewport-sized this practically never binds — it is the sole cap on the
 * arbitrary detail density (zoom × dpr) the overlay renders at. Returns 0 for
 * a non-positive region (nothing can be rendered there).
 */
export function cropDensityCapPAAX(width: number, height: number): number {
  if (!(width > 0 && height > 0)) return 0;
  const byDim = Math.min(MAX_CANVAS_DIM_PAAX / width, MAX_CANVAS_DIM_PAAX / height);
  const byArea = Math.sqrt(MAX_CANVAS_AREA_PAAX / (width * height));
  return Math.min(byDim, byArea);
}

/**
 * Clamp a stage zoom to MIN_SCALE_PAAX..MAX_SCALE_PAAX (0.03..32).
 * Mirrors OpenTakeOff's clamp with the PAAX bounds. Non-finite input falls
 * back to MIN_SCALE_PAAX (safe minimum) instead of propagating NaN through
 * the UI zoom state.
 */
export function clampZoomPAAX(zoom: number): number {
  if (!Number.isFinite(zoom)) return MIN_SCALE_PAAX;
  return Math.min(MAX_SCALE_PAAX, Math.max(MIN_SCALE_PAAX, zoom));
}
