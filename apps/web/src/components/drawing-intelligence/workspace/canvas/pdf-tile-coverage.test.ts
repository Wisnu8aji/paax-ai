import { describe, expect, it } from 'vitest';

import {
  clippedUnionCoverage,
  generationCoverage,
  isGenerationReady,
  tileLogicalRect,
  type GenerationCoverageInput,
  type LogicalRect,
} from './pdf-tile-coverage';
import type { PdfTileRequest } from './pdf-tile-pyramid';

function tile(
  key: string,
  tx: number,
  ty: number,
  x: number,
  y: number,
  width: number,
  height: number,
  density = 1,
): PdfTileRequest {
  return { key, tx, ty, x, y, width, height, density };
}

function fourTileViewport(): GenerationCoverageInput {
  const viewport: LogicalRect = { x: 0, y: 0, width: 400, height: 400 };
  const page: LogicalRect = { x: 0, y: 0, width: 400, height: 400 };
  const desiredVisibleTiles = [
    tile('a', 0, 0, 0, 0, 200, 200),
    tile('b', 1, 0, 200, 0, 200, 200),
    tile('c', 0, 1, 0, 200, 200, 200),
    tile('d', 1, 1, 200, 200, 200, 200),
  ];
  return {
    viewport,
    page,
    desiredVisibleTiles,
    readyKeys: new Set(desiredVisibleTiles.map((entry) => entry.key)),
  };
}

function rightEdgeViewportWithOverlappingTiles(): GenerationCoverageInput {
  const viewport: LogicalRect = { x: 400, y: 0, width: 800, height: 1000 };
  const page: LogicalRect = { x: 0, y: 0, width: 1000, height: 1000 };
  const desiredVisibleTiles = [
    tile('left', 0, 0, 400, 0, 300, 1000),
    tile('middle', 1, 0, 600, 0, 300, 1000),
    tile('right', 2, 0, 900, 0, 300, 1000),
  ];
  return {
    viewport,
    page,
    desiredVisibleTiles,
    readyKeys: new Set(desiredVisibleTiles.map((entry) => entry.key)),
  };
}

describe('tileLogicalRect', () => {
  it('converts raster tile coordinates to logical coordinates by dividing by density', () => {
    expect(tileLogicalRect(tile('k', 0, 0, 512, 256, 512, 256, 2))).toEqual({
      x: 256,
      y: 128,
      width: 256,
      height: 128,
    });
  });

  it('fails closed to a zero-area rect for zero, negative, or non-finite density', () => {
    expect(tileLogicalRect(tile('k', 0, 0, 512, 512, 512, 512, 0))).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    expect(tileLogicalRect(tile('k', 0, 0, 512, 512, 512, 512, -1))).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    expect(tileLogicalRect(tile('k', 0, 0, 512, 512, 512, 512, Number.NaN))).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    expect(tileLogicalRect(tile('k', 0, 0, 512, 512, 512, Number.NaN, 1))).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it('fails closed locally for zero or negative raster tile extents instead of leaking geometry downstream', () => {
    expect(tileLogicalRect(tile('k', 0, 0, 512, 512, 0, 512, 1))).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    expect(tileLogicalRect(tile('k', 0, 0, 512, 512, 512, -4, 1))).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    expect(tileLogicalRect(tile('k', 0, 0, 512, 512, 512, 512, Number.POSITIVE_INFINITY))).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
  });

  it('still converts a negative origin tile to a valid rect (intersection clips it downstream)', () => {
    expect(tileLogicalRect(tile('k', 0, 0, -100, 512, 512, 512, 1))).toEqual({ x: -100, y: 512, width: 512, height: 512 });
  });
});

describe('clippedUnionCoverage', () => {
  it('returns 1 when a single rect covers the whole clipped viewport', () => {
    expect(
      clippedUnionCoverage({ x: 0, y: 0, width: 400, height: 400 }, { x: 0, y: 0, width: 400, height: 400 }, [
        { x: 0, y: 0, width: 400, height: 400 },
      ]),
    ).toBe(1);
  });

  it('does not double-count overlapping rects', () => {
    const viewport: LogicalRect = { x: 0, y: 0, width: 600, height: 600 };
    const page: LogicalRect = { x: 0, y: 0, width: 600, height: 600 };
    expect(
      clippedUnionCoverage(viewport, page, [
        { x: 0, y: 0, width: 300, height: 600 },
        { x: 200, y: 0, width: 300, height: 600 },
      ]),
    ).toBeCloseTo(0.8333333333, 5);
  });

  it('clips negative and beyond-page viewport coordinates to the page', () => {
    expect(
      clippedUnionCoverage(
        { x: -100, y: 0, width: 1300, height: 842 },
        { x: 0, y: 0, width: 1191, height: 842 },
        [{ x: 0, y: 0, width: 1191, height: 842 }],
      ),
    ).toBe(1);
  });

  it('returns 0 when nothing intersects the clipped viewport', () => {
    expect(
      clippedUnionCoverage({ x: 0, y: 0, width: 100, height: 100 }, { x: 0, y: 0, width: 100, height: 100 }, [
        { x: 200, y: 200, width: 100, height: 100 },
      ]),
    ).toBe(0);
  });

  it('fails closed to 0 for zero-area, negative, and non-finite viewport or page geometry', () => {
    const page: LogicalRect = { x: 0, y: 0, width: 400, height: 400 };
    const full: LogicalRect = { x: 0, y: 0, width: 400, height: 400 };
    expect(clippedUnionCoverage({ x: 0, y: 0, width: 0, height: 400 }, page, [full])).toBe(0);
    expect(clippedUnionCoverage({ x: 0, y: 0, width: 400, height: -5 }, page, [full])).toBe(0);
    expect(clippedUnionCoverage({ x: 0, y: 0, width: Number.NaN, height: 400 }, page, [full])).toBe(0);
    expect(clippedUnionCoverage({ x: 0, y: 0, width: 400, height: 400 }, { x: 0, y: 0, width: 0, height: 400 }, [full])).toBe(0);
    expect(clippedUnionCoverage({ x: 0, y: 0, width: 400, height: 400 }, { x: 0, y: 0, width: -400, height: 400 }, [full])).toBe(0);
  });

  it('skips rects with non-positive or non-finite geometry', () => {
    const viewport: LogicalRect = { x: 0, y: 0, width: 400, height: 400 };
    const page: LogicalRect = { x: 0, y: 0, width: 400, height: 400 };
    expect(
      clippedUnionCoverage(viewport, page, [
        { x: 0, y: 0, width: 200, height: 400 },
        { x: 200, y: 0, width: -100, height: 400 },
        { x: 200, y: 0, width: Number.NaN, height: 400 },
      ]),
    ).toBeCloseTo(0.5, 5);
  });
});

describe('generationCoverage', () => {
  it('does not mark a four-tile viewport ready after only one tile', () => {
    const input = fourTileViewport();
    expect(generationCoverage({ ...input, readyKeys: new Set([input.desiredVisibleTiles[0].key]) })).toBeCloseTo(0.25, 5);
    expect(isGenerationReady({ ...input, readyKeys: new Set([input.desiredVisibleTiles[0].key]) })).toBe(false);
  });

  it('commits after clipped union coverage reaches 99 percent without double-counting overlap', () => {
    const input = rightEdgeViewportWithOverlappingTiles();
    expect(generationCoverage(input)).toBeGreaterThanOrEqual(0.99);
    expect(isGenerationReady(input)).toBe(true);
  });

  it('counts exactly the ready subset of desired tiles', () => {
    const input = fourTileViewport();
    const readyKeys = new Set(input.desiredVisibleTiles.slice(0, 3).map((entry) => entry.key));
    expect(generationCoverage({ ...input, readyKeys })).toBeCloseTo(0.75, 5);
  });

  it('never lets stale or unrequested keys contribute area', () => {
    const input = fourTileViewport();
    expect(generationCoverage({ ...input, readyKeys: new Set(['ghost']) })).toBe(0);
    expect(generationCoverage({ ...input, readyKeys: new Set(['ghost', input.desiredVisibleTiles[0].key]) })).toBeCloseTo(0.25, 5);
  });

  it('skips ready tiles whose geometry is invalid', () => {
    const input = fourTileViewport();
    const broken = { ...input.desiredVisibleTiles[3], density: 0 };
    const readyKeys = new Set(input.desiredVisibleTiles.map((entry) => entry.key));
    expect(generationCoverage({ ...input, desiredVisibleTiles: [...input.desiredVisibleTiles.slice(0, 3), broken], readyKeys })).toBeCloseTo(0.75, 5);
  });

  it('fails closed to 0 when viewport or page geometry is invalid', () => {
    const input = fourTileViewport();
    expect(generationCoverage({ ...input, viewport: { x: 0, y: 0, width: 0, height: 400 } })).toBe(0);
    expect(generationCoverage({ ...input, page: { x: 0, y: 0, width: Number.POSITIVE_INFINITY, height: 400 } })).toBe(0);
  });
});

describe('isGenerationReady', () => {
  it('defaults to a 99 percent threshold', () => {
    expect(isGenerationReady(fourTileViewport())).toBe(true);
    expect(isGenerationReady({ ...fourTileViewport(), readyKeys: new Set() })).toBe(false);
  });

  it('sanitizes non-finite thresholds to the default', () => {
    const input = fourTileViewport();
    const threeOfFour = new Set(input.desiredVisibleTiles.slice(0, 3).map((entry) => entry.key));
    expect(isGenerationReady({ ...input, readyKeys: threeOfFour }, Number.NaN)).toBe(false);
    expect(isGenerationReady({ ...input, readyKeys: threeOfFour }, Number.POSITIVE_INFINITY)).toBe(false);
    expect(isGenerationReady({ ...input, readyKeys: threeOfFour }, Number.NEGATIVE_INFINITY)).toBe(false);
  });

  it('clamps out-of-range thresholds into [0, 1]', () => {
    const input = fourTileViewport();
    const threeOfFour = new Set(input.desiredVisibleTiles.slice(0, 3).map((entry) => entry.key));
    expect(isGenerationReady({ ...input, readyKeys: threeOfFour }, 2)).toBe(false);
    expect(isGenerationReady({ ...input, readyKeys: threeOfFour }, 1.5)).toBe(false);
    expect(isGenerationReady(fourTileViewport(), 1.5)).toBe(true);
    expect(isGenerationReady({ ...input, readyKeys: new Set() }, -1)).toBe(true);
  });
});
