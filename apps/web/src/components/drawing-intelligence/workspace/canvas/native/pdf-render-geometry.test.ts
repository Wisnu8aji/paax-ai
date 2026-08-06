import { describe, expect, it } from 'vitest';

import {
  BYTES_PER_PIXEL,
  DENSITY_TOLERANCE_PAAX,
  clampRegion,
  computeRenderKey,
  containsRegion,
  coverageRatio,
  densityWithinTolerance,
  estimateBytesForPixels,
  estimateBytesForRegion,
  expandRegion,
  expandRegionDirectional,
  intersectionArea,
  regionsIntersect,
} from './pdf-render-geometry';

describe('containsRegion (coverage predicate)', () => {
  it('returns true when the cached region fully contains the viewport', () => {
    const cached = { x: 0, y: 0, width: 1000, height: 800 };
    const viewport = { x: 100, y: 50, width: 500, height: 400 };
    expect(containsRegion(cached, viewport)).toBe(true);
  });

  it('returns true for exact equality (exact-key geometry)', () => {
    const region = { x: 10, y: 20, width: 300, height: 200 };
    expect(containsRegion(region, region)).toBe(true);
  });

  it('returns false when the viewport pokes outside the cached region', () => {
    const cached = { x: 0, y: 0, width: 100, height: 100 };
    expect(containsRegion(cached, { x: 90, y: 0, width: 50, height: 100 })).toBe(false);
    expect(containsRegion(cached, { x: 0, y: 0, width: 100.0001, height: 100 })).toBe(false);
  });

  it('tolerates float epsilon on the boundary', () => {
    const cached = { x: 0, y: 0, width: 100, height: 100 };
    expect(containsRegion(cached, { x: 0, y: 0, width: 100, height: 100 - 1e-9 })).toBe(true);
  });

  it('rejects non-finite regions', () => {
    expect(containsRegion({ x: Number.NaN, y: 0, width: 100, height: 100 }, { x: 0, y: 0, width: 10, height: 10 })).toBe(false);
    expect(containsRegion({ x: 0, y: 0, width: 100, height: 100 }, { x: 0, y: 0, width: Number.POSITIVE_INFINITY, height: 10 })).toBe(false);
  });
});

describe('intersection / coverage math', () => {
  it('computes intersection area', () => {
    const a = { x: 0, y: 0, width: 100, height: 100 };
    const b = { x: 50, y: 50, width: 100, height: 100 };
    expect(intersectionArea(a, b)).toBe(50 * 50);
  });

  it('returns 0 for disjoint regions', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    const b = { x: 20, y: 0, width: 10, height: 10 };
    expect(intersectionArea(a, b)).toBe(0);
    expect(regionsIntersect(a, b)).toBe(false);
  });

  it('coverageRatio is 1 for full containment and <1 for partial', () => {
    const viewport = { x: 100, y: 100, width: 100, height: 100 };
    expect(coverageRatio(viewport, { x: 0, y: 0, width: 1000, height: 1000 })).toBe(1);
    expect(coverageRatio(viewport, { x: 100, y: 100, width: 50, height: 100 })).toBe(0.5);
    expect(coverageRatio(viewport, { x: 0, y: 0, width: 10, height: 10 })).toBe(0);
  });
});

describe('clampRegion (page clamp)', () => {
  const bounds = { width: 1000, height: 800 };

  it('keeps an in-bounds region unchanged', () => {
    const r = { x: 100, y: 50, width: 500, height: 400 };
    expect(clampRegion(r, bounds)).toEqual(r);
  });

  it('clamps a region that overflows the page on all sides', () => {
    expect(clampRegion({ x: -100, y: -50, width: 1200, height: 900 }, bounds)).toEqual({
      x: 0,
      y: 0,
      width: 1000,
      height: 800,
    });
  });

  it('clamps a region fully off-page to zero area at the edge', () => {
    expect(clampRegion({ x: 2000, y: 0, width: 100, height: 100 }, bounds)).toEqual({
      x: 1000,
      y: 0,
      width: 0,
      height: 100,
    });
  });

  it('returns a zero region for non-finite input', () => {
    expect(clampRegion({ x: Number.NaN, y: 0, width: 100, height: 100 }, bounds)).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
  });
});

describe('expandRegion / directional overscan', () => {
  it('expands uniformly by the base overscan fraction', () => {
    const r = { x: 100, y: 50, width: 200, height: 100 };
    const expanded = expandRegion(r, 0.25, 0.25);
    expect(expanded.x).toBeCloseTo(100 - 200 * 0.25);
    expect(expanded.y).toBeCloseTo(50 - 100 * 0.25);
    expect(expanded.width).toBeCloseTo(200 * 1.5);
    expect(expanded.height).toBeCloseTo(100 * 1.5);
  });

  it('extends only the leading edge in the pan direction', () => {
    const r = { x: 100, y: 50, width: 200, height: 100 };
    const right = expandRegionDirectional(r, 0.5, 'right');
    expect(right.x).toBe(100);
    expect(right.width).toBeCloseTo(300); // only right edge grew
    expect(right.y).toBe(50);
    expect(right.height).toBe(100);

    const left = expandRegionDirectional(r, 0.5, 'left');
    expect(left.x).toBeCloseTo(100 - 100);
    expect(left.width).toBeCloseTo(300);

    const down = expandRegionDirectional(r, 0.5, 'down');
    expect(down.y).toBe(50);
    expect(down.height).toBeCloseTo(150);

    const up = expandRegionDirectional(r, 0.5, 'up');
    expect(up.y).toBeCloseTo(50 - 50);
    expect(up.height).toBeCloseTo(150);
  });
});

describe('densityWithinTolerance', () => {
  it('accepts cached density above or equal to requested', () => {
    expect(densityWithinTolerance(4, 2)).toBe(true);
    expect(densityWithinTolerance(2, 2)).toBe(true);
  });

  it('accepts slightly lower density within tolerance', () => {
    expect(densityWithinTolerance(2 * (1 - 0.1), 2)).toBe(true);
    expect(densityWithinTolerance(2 * (1 - DENSITY_TOLERANCE_PAAX), 2)).toBe(true);
  });

  it('rejects density below the tolerance band', () => {
    expect(densityWithinTolerance(2 * (1 - 0.16), 2)).toBe(false);
    expect(densityWithinTolerance(1, 2)).toBe(false);
  });

  it('rejects non-positive densities', () => {
    expect(densityWithinTolerance(0, 2)).toBe(false);
    expect(densityWithinTolerance(2, 0)).toBe(false);
    expect(densityWithinTolerance(Number.NaN, 2)).toBe(false);
  });

  it('honors a custom tolerance', () => {
    expect(densityWithinTolerance(1.9, 2, 0.05)).toBe(true);
    expect(densityWithinTolerance(1.8, 2, 0.05)).toBe(false);
  });
});

describe('computeRenderKey (exact fast path)', () => {
  const region = { x: 10, y: 20, width: 300, height: 200 };

  it('produces a stable key for identical inputs', () => {
    expect(computeRenderKey(0, region, 2, false)).toBe(computeRenderKey(0, region, 2, false));
  });

  it('changes with page, region, density, or dark mode', () => {
    const base = computeRenderKey(0, region, 2, false);
    expect(computeRenderKey(1, region, 2, false)).not.toBe(base);
    expect(computeRenderKey(0, { ...region, x: 11 }, 2, false)).not.toBe(base);
    expect(computeRenderKey(0, region, 2.01, false)).not.toBe(base);
    expect(computeRenderKey(0, region, 2, true)).not.toBe(base);
  });

  it('collapses sub-0.1pt and sub-0.01-density jitter (dedup parity)', () => {
    expect(computeRenderKey(0, { ...region, x: 10.04 }, 2, false)).toBe(computeRenderKey(0, region, 2, false));
    expect(computeRenderKey(0, region, 2.004, false)).toBe(computeRenderKey(0, region, 2, false));
  });
});

describe('byte estimates', () => {
  it('estimates widthPx × heightPx × 4 for a region at a density', () => {
    const region = { x: 0, y: 0, width: 100, height: 50 };
    expect(estimateBytesForRegion(region, 2)).toBe(200 * 100 * BYTES_PER_PIXEL);
  });

  it('estimates from pixel dims directly', () => {
    expect(estimateBytesForPixels(640, 480)).toBe(640 * 480 * 4);
  });

  it('returns 0 for degenerate inputs', () => {
    expect(estimateBytesForRegion({ x: 0, y: 0, width: 0, height: 50 }, 2)).toBe(0);
    expect(estimateBytesForRegion({ x: 0, y: 0, width: 100, height: 50 }, 0)).toBe(0);
    expect(estimateBytesForPixels(0, 480)).toBe(0);
  });
});
