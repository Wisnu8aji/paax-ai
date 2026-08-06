/*
 * PAAX PDF viewer native — render geometry (pure).
 *
 * ORION-F3 ownership (Master Plan PAAX-2026-08-06-review-pdf-viewer-native §4/§5):
 * coverage-aware spatial cache + crop planning + adaptive memory budget.
 *
 * This module is PURE: no DOM, no React, no pdf.js, no worker. Safe for the
 * main thread and unit tests. All regions are in PDF/page space (pt), matching
 * the RenderRegion contract frozen in Master Plan §4.
 *
 * Coordinate contract (identical to Master Plan §4):
 *   interface RenderRegion { x: number; y: number; width: number; height: number }
 *
 * The canonical `RenderRegion` is imported from ORION-F2's frozen
 * `pdf-native-contract.ts` (Wave 0 contract freeze, Master Plan §11 merge
 * order: F2 contract first). This module approves that shape and builds on it.
 */

import type { RenderRegion } from './pdf-native-contract';

export type { RenderRegion };

/** Page bounds in the same PDF/page space as RenderRegion. */
export interface PageBounds {
  width: number;
  height: number;
}

/** Screen-space pan direction; used to bias crop overscan toward the pan. */
export type PanDirection = 'left' | 'right' | 'up' | 'down';

/** Float tolerance for containment/intersection comparisons. */
export const REGION_EPSILON = 1e-6;

/**
 * Default density tolerance for coverage reuse: a cached crop is considered
 * "sharp enough" for a requested density when
 *   cachedDensity >= requestedDensity * (1 - DENSITY_TOLERANCE_PAAX)
 * 15% lets a slightly-lower-density crop serve the viewport (downscaled) while
 * refusing crops that would visibly soften the display. A cached density ABOVE
 * the request is always acceptable (supersampling downscales cleanly).
 */
export const DENSITY_TOLERANCE_PAAX = 0.15;

/** Conservative baseline for `estimatedBytes`: RGBA = widthPx × heightPx × 4. */
export const BYTES_PER_PIXEL = 4;

export function isFiniteRegion(region: RenderRegion): boolean {
  return (
    Number.isFinite(region.x) &&
    Number.isFinite(region.y) &&
    Number.isFinite(region.width) &&
    Number.isFinite(region.height)
  );
}

export function regionArea(region: RenderRegion): number {
  if (!isFiniteRegion(region)) return 0;
  return Math.max(0, region.width) * Math.max(0, region.height);
}

/**
 * Clamp a region into page bounds (used for crop planning and cache bookkeeping).
 * Degenerate/non-finite input produces a zero-area region rather than NaN.
 */
export function clampRegion(region: RenderRegion, bounds: PageBounds): RenderRegion {
  if (!isFiniteRegion(region) || !(bounds.width > 0 && bounds.height > 0)) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const x0 = Math.min(Math.max(region.x, 0), bounds.width);
  const y0 = Math.min(Math.max(region.y, 0), bounds.height);
  const x1 = Math.min(Math.max(region.x + region.width, 0), bounds.width);
  const y1 = Math.min(Math.max(region.y + region.height, 0), bounds.height);
  return { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
}

/**
 * True when `outer` fully contains `inner` (within REGION_EPSILON). This is
 * the core coverage predicate: a cached crop whose region ⊇ requested viewport
 * can serve the viewport without a new render.
 */
export function containsRegion(outer: RenderRegion, inner: RenderRegion, epsilon = REGION_EPSILON): boolean {
  if (!isFiniteRegion(outer) || !isFiniteRegion(inner)) return false;
  return (
    outer.x <= inner.x + epsilon &&
    outer.y <= inner.y + epsilon &&
    outer.x + outer.width >= inner.x + inner.width - epsilon &&
    outer.y + outer.height >= inner.y + inner.height - epsilon
  );
}

/** True when two regions share positive area. */
export function regionsIntersect(a: RenderRegion, b: RenderRegion, epsilon = REGION_EPSILON): boolean {
  if (!isFiniteRegion(a) || !isFiniteRegion(b)) return false;
  return (
    a.x < b.x + b.width - epsilon &&
    b.x < a.x + a.width - epsilon &&
    a.y < b.y + b.height - epsilon &&
    b.y < a.y + a.height - epsilon
  );
}

/** Area of the intersection of two regions (0 when they do not overlap). */
export function intersectionArea(a: RenderRegion, b: RenderRegion): number {
  if (!isFiniteRegion(a) || !isFiniteRegion(b)) return 0;
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  if (x1 <= x0 || y1 <= y0) return 0;
  return (x1 - x0) * (y1 - y0);
}

/**
 * Fraction of the requested viewport covered by a cached region (0..1).
 * 1 means full containment (coverage hit); used to rank candidate crops.
 */
export function coverageRatio(viewport: RenderRegion, cached: RenderRegion): number {
  const viewArea = regionArea(viewport);
  if (viewArea <= 0) return 0;
  return Math.min(1, intersectionArea(viewport, cached) / viewArea);
}

/**
 * Uniform overscan: grow a region by `fraction` of its own width/height on
 * EVERY side (base overscan 20–25%). Does NOT clamp — caller clamps to page.
 */
export function expandRegion(region: RenderRegion, fractionX: number, fractionY: number): RenderRegion {
  if (!isFiniteRegion(region)) return { x: 0, y: 0, width: 0, height: 0 };
  const fx = Math.max(0, fractionX);
  const fy = Math.max(0, fractionY);
  return {
    x: region.x - region.width * fx,
    y: region.y - region.height * fy,
    width: region.width * (1 + 2 * fx),
    height: region.height * (1 + 2 * fy),
  };
}

/**
 * Directional overscan: grow ONLY the edge facing `direction` by `fraction` of
 * the region's dimension along that axis (directional overscan 40–60%). The
 * opposite edge and the perpendicular axis stay untouched. Does NOT clamp.
 */
export function expandRegionDirectional(
  region: RenderRegion,
  fraction: number,
  direction: PanDirection,
): RenderRegion {
  if (!isFiniteRegion(region)) return { x: 0, y: 0, width: 0, height: 0 };
  const f = Math.max(0, fraction);
  const w = region.width;
  const h = region.height;
  switch (direction) {
    case 'left':
      return { x: region.x - w * f, y: region.y, width: w * (1 + f), height: h };
    case 'right':
      return { x: region.x, y: region.y, width: w * (1 + f), height: h };
    case 'up':
      return { x: region.x, y: region.y - h * f, width: w, height: h * (1 + f) };
    case 'down':
      return { x: region.x, y: region.y, width: w, height: h * (1 + f) };
  }
}

/**
 * Density tolerance check: cached density is sufficient for a requested
 * density when it is not meaningfully lower (default 15% grace). A cached
 * density above the request always passes.
 */
export function densityWithinTolerance(
  cachedDensity: number,
  requestedDensity: number,
  tolerance = DENSITY_TOLERANCE_PAAX,
): boolean {
  if (!(cachedDensity > 0) || !(requestedDensity > 0)) return false;
  if (cachedDensity >= requestedDensity) return true;
  const grace = Math.max(0, Math.min(1, tolerance));
  return cachedDensity >= requestedDensity * (1 - grace);
}

/**
 * Exact render key — the FAST PATH only. Sub-0.1pt region movement and
 * sub-0.01 density change produce the same key (parity with the existing
 * detailRenderKeyFor tolerance). Coverage lookup is the real hit mechanism;
 * this key merely avoids scanning when the request is byte-identical.
 */
export function computeRenderKey(
  pageIndex: number,
  region: RenderRegion,
  density: number,
  darkMode: boolean,
): string {
  return [
    pageIndex,
    region.x.toFixed(1),
    region.y.toFixed(1),
    (region.x + region.width).toFixed(1),
    (region.y + region.height).toFixed(1),
    density.toFixed(2),
    darkMode ? 1 : 0,
  ].join('|');
}

/**
 * Conservative memory estimate for a rendered crop:
 *   estimatedBytes = widthPx × heightPx × 4  (RGBA)
 * where widthPx/heightPx are the bitmap dimensions at the given density.
 */
export function estimateBytesForRegion(region: RenderRegion, density: number): number {
  if (!isFiniteRegion(region) || region.width <= 0 || region.height <= 0 || !(density > 0)) return 0;
  const widthPx = Math.max(1, Math.round(region.width * density));
  const heightPx = Math.max(1, Math.round(region.height * density));
  return widthPx * heightPx * BYTES_PER_PIXEL;
}

/** Bitmap byte estimate from pixel dimensions directly (same 4-byte RGBA rule). */
export function estimateBytesForPixels(widthPx: number, heightPx: number): number {
  if (!(widthPx > 0) || !(heightPx > 0)) return 0;
  return Math.round(widthPx) * Math.round(heightPx) * BYTES_PER_PIXEL;
}
