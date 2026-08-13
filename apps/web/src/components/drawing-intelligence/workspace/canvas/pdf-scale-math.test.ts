import { describe, expect, it } from 'vitest';

import { QUALITY_CEILING_PAAX } from './pdf-render-constants';
import {
  autoRenderScalePAAX,
  clampZoomPAAX,
  cropDensityCapPAAX,
  fitDensityPAAX,
} from './pdf-scale-math';

describe('autoRenderScalePAAX', () => {
  it('caps small pages at QUALITY_CEILING_PAAX (8.0)', () => {
    expect(autoRenderScalePAAX(100, 100)).toBe(8.0);
    expect(autoRenderScalePAAX(500, 300)).toBe(8.0);
  });

  it('binds the A1 page by the MAX_PANEL_AREA budget (~2.541, below ceiling)', () => {
    // A1 2482×1747 pt: byDim = min(16384/2482, 16384/1747) ≈ 6.601;
    // byArea = sqrt(28e6 / 4,336,054) ≈ 2.541 → panel-area cap binds.
    expect(autoRenderScalePAAX(2482, 1747)).toBeCloseTo(2.541158034233262, 12);
    expect(autoRenderScalePAAX(2482, 1747)).toBeLessThan(QUALITY_CEILING_PAAX);
    expect(autoRenderScalePAAX(2482, 1747)).toBeGreaterThanOrEqual(2.0);
  });

  it('renders oversized pages BELOW the RENDER_SCALE baseline (never blows the budget)', () => {
    // 10000×10000 pt: byDim = 1.6384, byArea ≈ 0.529 → cap wins under baseline.
    expect(autoRenderScalePAAX(10000, 10000)).toBeCloseTo(0.5291502622129182, 12);
    // 7920×5280 pt scan (1px = 1pt ingested image): below baseline, matches
    // OpenTakeOff's own oversized-page guard.
    expect(autoRenderScalePAAX(7920, 5280)).toBeCloseTo(0.8182753407080632, 12);
  });

  it('falls back to RENDER_SCALE_PAAX for non-positive page dimensions', () => {
    expect(autoRenderScalePAAX(0, 0)).toBe(2.0);
    expect(autoRenderScalePAAX(-1, 100)).toBe(2.0);
    expect(autoRenderScalePAAX(Number.NaN, 100)).toBe(2.0);
  });
});

describe('fitDensityPAAX', () => {
  it('never exceeds 1.0 (whole-sheet supersampling is not a detail source)', () => {
    expect(fitDensityPAAX(2482, 1747, 28e6)).toBe(1);
    expect(fitDensityPAAX(100, 100, 28e6)).toBe(1);
    expect(fitDensityPAAX(0.5, 0.5, 28e6)).toBe(1); // area floored at 1
  });

  it('computes the exact density whose composite hits the target area', () => {
    // 7920×5280 sheet, 28MP budget → 0.8183 (matches OpenTakeOff tiles.ts).
    expect(fitDensityPAAX(7920, 5280, 28e6)).toBeCloseTo(0.8182753407080632, 12);
  });

  it('returns 0 for a zero target area', () => {
    expect(fitDensityPAAX(100, 100, 0)).toBe(0);
  });
});

describe('cropDensityCapPAAX', () => {
  it('is viewport-loose: a 1600×900 region allows ~10.24 device px/pt', () => {
    // byDim = min(16384/1600, 16384/900) = 10.24 binds; byArea ≈ 12.95.
    expect(cropDensityCapPAAX(1600, 900)).toBeCloseTo(10.24, 12);
  });

  it('binds by canvas side for a 2000×1500 region', () => {
    expect(cropDensityCapPAAX(2000, 1500)).toBeCloseTo(8.192, 12);
  });

  it('caps a giant region below 1.0 by both dim and area', () => {
    expect(cropDensityCapPAAX(20000, 20000)).toBeCloseTo(0.7771613577629809, 12);
  });

  it('returns 0 for a non-positive region (nothing renderable)', () => {
    expect(cropDensityCapPAAX(0, 0)).toBe(0);
    expect(cropDensityCapPAAX(-100, 50)).toBe(0);
  });
});

describe('clampZoomPAAX', () => {
  it('lets zoom 8 pass through (no longer capped at MAX_ZOOM 8)', () => {
    expect(clampZoomPAAX(8)).toBe(8);
  });

  it('clamps the UI range 0.08..32 unchanged', () => {
    expect(clampZoomPAAX(0.08)).toBe(0.08);
    expect(clampZoomPAAX(32)).toBe(32);
  });

  it('clamps outside MIN_SCALE_PAAX..MAX_SCALE_PAAX (0.03..32)', () => {
    expect(clampZoomPAAX(40)).toBe(32);
    expect(clampZoomPAAX(0.01)).toBe(0.03);
    expect(clampZoomPAAX(-1)).toBe(0.03);
  });

  it('falls back to MIN_SCALE_PAAX for non-finite zoom', () => {
    expect(clampZoomPAAX(Number.NaN)).toBe(0.03);
    expect(clampZoomPAAX(Number.POSITIVE_INFINITY)).toBe(0.03);
  });
});
