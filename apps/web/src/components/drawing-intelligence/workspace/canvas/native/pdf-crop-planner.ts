/*
 * PAAX PDF viewer native — crop planner (pure).
 *
 * ORION-F3 ownership (Master Plan PAAX-2026-08-06-review-pdf-viewer-native §5):
 *   - base overscan 20–25%
 *   - directional overscan 40–60% toward the last pan direction
 *   - clamp region to page bounds
 *   - at most ONE neighbor prefetch at a time
 *   - NO 3×3 grid, NO hidden pyramid
 *
 * The planner is PURE: it computes regions and densities; it never calls the
 * worker, never renders, never touches React. It emits a single foreground
 * crop plan plus (optionally) a single prefetch plan.
 */

import {
  type PageBounds,
  type PanDirection,
  type RenderRegion,
  clampRegion,
  expandRegionDirectional,
  isFiniteRegion,
} from './pdf-render-geometry';

/** Base overscan band (Master Plan: 20–25%). */
export const BASE_OVERSCAN_MIN = 0.2;
export const BASE_OVERSCAN_MAX = 0.25;
export const BASE_OVERSCAN_DEFAULT = 0.25;

/** Directional overscan band (Master Plan: 40–60%). */
export const DIRECTIONAL_OVERSCAN_MIN = 0.4;
export const DIRECTIONAL_OVERSCAN_MAX = 0.6;
export const DIRECTIONAL_OVERSCAN_DEFAULT = 0.5;

/** Hard cap on concurrent neighbor prefetches (Master Plan: max 1). */
export const MAX_NEIGHBOR_PREFETCH = 1;

/** Output of crop planning for one settle. */
export interface CropPlan {
  /** Final region to render, clamped to page bounds. */
  region: RenderRegion;
  /** Requested density (device px per PDF pt) — passed through untouched. */
  density: number;
  /** Effective base overscan used (after clamping to 20–25%). */
  baseOverscan: number;
  /** Effective directional overscan used (after clamping to 40–60%). */
  directionalOverscan: number;
  /** Which overscan regime produced this region. */
  kind: 'base' | 'directional';
  /** True when clamping actually trimmed the region to the page. */
  clamped: boolean;
}

/** Input for foreground crop planning. */
export interface CropPlanRequest {
  /** Viewport (PDF/pt space) that must be covered. */
  viewport: RenderRegion;
  pageBounds: PageBounds;
  /** Device px per pt for the crop render. */
  density: number;
  /** Last pan direction; when set, overscan is biased toward it. */
  panDirection?: PanDirection | null;
  /** Override base overscan (clamped to 20–25%). */
  baseOverscan?: number;
  /** Override directional overscan (clamped to 40–60%). */
  directionalOverscan?: number;
}

/** A single neighbor prefetch plan (at most one is ever emitted). */
export interface PrefetchPlan {
  region: RenderRegion;
  density: number;
  /** Direction this prefetch is extending toward. */
  direction: PanDirection;
}

/** Input for neighbor prefetch planning. */
export interface PrefetchRequest {
  viewport: RenderRegion;
  pageBounds: PageBounds;
  density: number;
  /** Number of prefetches currently active — MUST be < MAX_NEIGHBOR_PREFETCH. */
  activePrefetches: number;
  /** Preferred direction; falls back to the largest uncovered side. */
  panDirection?: PanDirection | null;
  /** How far beyond the viewport the neighbor region extends (fraction of viewport dim). */
  overscan?: number;
}

function clampOverscan(value: number | undefined, min: number, max: number, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/**
 * Plan the foreground crop for a settle: expand the viewport by the base
 * overscan on every side, then bias the leading edge toward the last pan
 * direction with the directional overscan, then clamp to the page.
 * Returns null for a degenerate viewport or invalid density.
 */
export function planCrop(request: CropPlanRequest): CropPlan | null {
  const { viewport, pageBounds, density } = request;
  if (!isFiniteRegion(viewport) || viewport.width <= 0 || viewport.height <= 0) return null;
  if (!(density > 0) || !Number.isFinite(density)) return null;
  if (!(pageBounds.width > 0 && pageBounds.height > 0)) return null;

  const baseOverscan = clampOverscan(request.baseOverscan, BASE_OVERSCAN_MIN, BASE_OVERSCAN_MAX, BASE_OVERSCAN_DEFAULT);
  const directionalOverscan = clampOverscan(
    request.directionalOverscan,
    DIRECTIONAL_OVERSCAN_MIN,
    DIRECTIONAL_OVERSCAN_MAX,
    DIRECTIONAL_OVERSCAN_DEFAULT,
  );

  const direction = request.panDirection ?? null;
  // Overscan fractions apply to the VIEWPORT dimensions directly:
  //   - every side gets the base overscan (20–25%)
  //   - the leading edge (toward the pan) gets the directional overscan
  //     (40–60%) instead of the base overscan.
  const leftOverscan = direction === 'left' ? directionalOverscan : baseOverscan;
  const rightOverscan = direction === 'right' ? directionalOverscan : baseOverscan;
  const upOverscan = direction === 'up' ? directionalOverscan : baseOverscan;
  const downOverscan = direction === 'down' ? directionalOverscan : baseOverscan;

  const biased: RenderRegion = {
    x: viewport.x - viewport.width * leftOverscan,
    y: viewport.y - viewport.height * upOverscan,
    width: viewport.width * (1 + leftOverscan + rightOverscan),
    height: viewport.height * (1 + upOverscan + downOverscan),
  };
  const clamped = clampRegion(biased, pageBounds);

  const clampedChanged =
    Math.abs(clamped.x - biased.x) > 1e-6 ||
    Math.abs(clamped.y - biased.y) > 1e-6 ||
    Math.abs(clamped.width - biased.width) > 1e-6 ||
    Math.abs(clamped.height - biased.height) > 1e-6;

  return {
    region: clamped,
    density,
    baseOverscan,
    directionalOverscan,
    kind: direction ? 'directional' : 'base',
    clamped: clampedChanged,
  };
}

/**
 * Plan the neighbor prefetch: a single region beyond the viewport on the
 * preferred (or best uncovered) side. Returns null when:
 *   - the prefetch budget is exhausted (activePrefetches >= MAX_NEIGHBOR_PREFETCH),
 *   - the viewport already touches the page edge on every side worth prefetching,
 *   - the viewport is degenerate.
 * NEVER emits more than one plan per call and never builds a 3×3 grid.
 */
export function planNeighborPrefetch(request: PrefetchRequest): PrefetchPlan | null {
  const { viewport, pageBounds, density, activePrefetches } = request;
  if (activePrefetches >= MAX_NEIGHBOR_PREFETCH) return null;
  if (!isFiniteRegion(viewport) || viewport.width <= 0 || viewport.height <= 0) return null;
  if (!(density > 0) || !Number.isFinite(density)) return null;
  if (!(pageBounds.width > 0 && pageBounds.height > 0)) return null;

  const overscan = clampOverscan(request.overscan, 0.1, 1.0, 0.5);

  // Candidate sides with the free space beyond the viewport edge (pt).
  const freeLeft = viewport.x;
  const freeRight = pageBounds.width - (viewport.x + viewport.width);
  const freeUp = viewport.y;
  const freeDown = pageBounds.height - (viewport.y + viewport.height);

  const direction: PanDirection | null =
    request.panDirection && freeSpaceFor(request.panDirection, freeLeft, freeRight, freeUp, freeDown) > 0
      ? request.panDirection
      : // No pan direction, or the pan direction has no space left: only then
        // fall back to the largest uncovered side (never prefetch opposite to
        // the pan — that is wasted work).
        request.panDirection
        ? null
        : pickLargestFreeSide(freeLeft, freeRight, freeUp, freeDown);

  if (!direction) return null;

  const free = freeSpaceFor(direction, freeLeft, freeRight, freeUp, freeDown);
  if (free <= 0) return null;

  // Extend a strip beyond the viewport on the chosen side. The prefetch region
  // is the viewport plus `overscan` of its own dimension on that side, clamped.
  const expanded = expandRegionDirectional(viewport, overscan, direction);
  const region = clampRegion(expanded, pageBounds);

  if (region.width <= 0 || region.height <= 0) return null;
  // Only emit when the prefetch actually adds area beyond the viewport.
  const added =
    (region.x < viewport.x - 1e-6 ? viewport.x - region.x : 0) +
    (region.y < viewport.y - 1e-6 ? viewport.y - region.y : 0) +
    (region.x + region.width > viewport.x + viewport.width + 1e-6
      ? region.x + region.width - (viewport.x + viewport.width)
      : 0) +
    (region.y + region.height > viewport.y + viewport.height + 1e-6
      ? region.y + region.height - (viewport.y + viewport.height)
      : 0);
  if (added <= 1e-6) return null;

  return { region, density, direction };
}

function freeSpaceFor(
  direction: PanDirection,
  freeLeft: number,
  freeRight: number,
  freeUp: number,
  freeDown: number,
): number {
  switch (direction) {
    case 'left':
      return freeLeft;
    case 'right':
      return freeRight;
    case 'up':
      return freeUp;
    case 'down':
      return freeDown;
  }
}

function pickLargestFreeSide(
  freeLeft: number,
  freeRight: number,
  freeUp: number,
  freeDown: number,
): PanDirection | null {
  const max = Math.max(freeLeft, freeRight, freeUp, freeDown);
  if (max <= 0) return null;
  if (max === freeLeft) return 'left';
  if (max === freeRight) return 'right';
  if (max === freeUp) return 'up';
  return 'down';
}
