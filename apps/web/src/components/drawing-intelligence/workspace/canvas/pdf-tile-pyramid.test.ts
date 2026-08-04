import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_TILE_CACHE_BYTES,
  PdfTilePyramid,
  TileLru,
  chooseDetailTileDensity,
  chooseTileDensity,
  toLogicalViewport,
  type PdfTileRequest,
} from './pdf-tile-pyramid';

function bitmap() {
  return { close: vi.fn() } as unknown as ImageBitmap;
}

/** Max right edge reached by the tile set, as a fraction of the page width. */
function rightCoverage(tiles: PdfTileRequest[], pageWidth: number): number {
  const maxRight = Math.max(...tiles.map((tile) => (tile.x + tile.width) / tile.density));
  return Math.min(1, maxRight / pageWidth);
}

describe('PdfTilePyramid', () => {
  it('uses fixed 512px tiles, crops page edges, and prioritizes viewport centre', () => {
    const pyramid = new PdfTilePyramid({ pageKey: 'A-101', width: 700, height: 600 });

    const tiles = pyramid.visibleTiles({ x: 480, y: 0, width: 220, height: 400, zoom: 1, dpr: 1 });

    expect(tiles[0]).toMatchObject({ tx: 1, ty: 0, x: 512, y: 0, width: 188, height: 512 });
    expect(tiles.every((tile) => tile.width <= 512 && tile.height <= 512)).toBe(true);
    expect(tiles).toHaveLength(2);
  });

  it('bounds density selected from zoom and device pixel ratio', () => {
    expect(chooseTileDensity({ zoom: 0.1, dpr: 1 })).toBe(0.25);
    expect(chooseTileDensity({ zoom: 1.5, dpr: 2 })).toBe(4);
    expect(chooseTileDensity({ zoom: 8, dpr: 3 })).toBe(8);
  });

  it('B2: interactive density caps at 8 while preserving 0.25/0.5 first-paint levels', () => {
    expect(chooseTileDensity({ zoom: 0.1, dpr: 1 })).toBe(0.25);
    expect(chooseTileDensity({ zoom: 0.4, dpr: 1 })).toBe(0.5);
    expect(chooseTileDensity({ zoom: 4, dpr: 2 })).toBe(8);
    expect(chooseTileDensity({ zoom: 20, dpr: 3 })).toBe(8);
    expect(chooseTileDensity({ zoom: 2, dpr: 2 })).toBe(4);
  });

  it('B2: settled detail density never drops below 1x', () => {
    expect(chooseDetailTileDensity({ zoom: 0.1, dpr: 1 })).toBe(1);
    expect(chooseDetailTileDensity({ zoom: 0.5, dpr: 1 })).toBe(1);
    expect(chooseDetailTileDensity({ zoom: 1, dpr: 1 })).toBe(1);
    expect(chooseDetailTileDensity({ zoom: 3, dpr: 2 })).toBe(6);
  });

  it('reuses a quantized pyramid level across adjacent zooms while preserving exact settled detail density', () => {
    expect(chooseTileDensity({ zoom: 1.01, dpr: 1 })).toBe(2);
    expect(chooseTileDensity({ zoom: 1.49, dpr: 1 })).toBe(2);
    expect(chooseDetailTileDensity({ zoom: 3, dpr: 2 })).toBe(6);
    expect(chooseDetailTileDensity({ zoom: 8, dpr: 3 })).toBe(24);
    expect(chooseDetailTileDensity({ zoom: 20, dpr: 3 })).toBe(32);

    const pyramid = new PdfTilePyramid({ pageKey: 'A-101', width: 1024, height: 1024 });
    const at101 = pyramid.visibleTiles({ x: 0, y: 0, width: 200, height: 200, zoom: 1.01, dpr: 1 });
    const at149 = pyramid.visibleTiles({ x: 0, y: 0, width: 200, height: 200, zoom: 1.49, dpr: 1 });
    expect(at101.map((tile) => tile.key)).toEqual(at149.map((tile) => tile.key));
  });

  it('P0 anchor: normalized fit viewport (w>1, h>1) converted to logical space covers >= 99% of the right edge', () => {
    // Real measured state at fit zoom on a 722x694 container, 1400x~990 base:
    // w=1.153, h=1.568, zoom=0.447. Manual anchor: density grid 0.5, tile 512px,
    // page 1191x842 -> columns tx=0 and tx=1, right edge (512+84)/0.5 = 1192/1191.
    const pyramid = new PdfTilePyramid({ pageKey: 'A-101', width: 1191, height: 842 });
    const logical = toLogicalViewport(
      { x: -0.08, y: 0, width: 1.153, height: 1.568, zoom: 0.447, dpr: 1 },
      { width: 1191, height: 842 },
    );
    const tiles = pyramid.visibleTiles(logical);
    expect(logical.width).toBeGreaterThan(1191);
    expect(rightCoverage(tiles, 1191)).toBeGreaterThanOrEqual(0.99);
    expect(new Set(tiles.map((tile) => tile.tx)).size).toBeGreaterThanOrEqual(2);
  });

  it('P0 anchor: width>1, height<=1 normalized viewport also covers the right edge after conversion', () => {
    const pyramid = new PdfTilePyramid({ pageKey: 'A-101', width: 1191, height: 842 });
    const logical = toLogicalViewport(
      { x: -0.05, y: 0, width: 1.03, height: 0.9, zoom: 0.6, dpr: 1 },
      { width: 1191, height: 842 },
    );
    const tiles = pyramid.visibleTiles(logical);
    expect(rightCoverage(tiles, 1191)).toBeGreaterThanOrEqual(0.99);
  });

  it('P0 anchor: legacy 1x1 viewport still resolves to the initial full-page tile set', () => {
    const pyramid = new PdfTilePyramid({ pageKey: 'A-101', width: 1191, height: 842 });
    const logical = toLogicalViewport({ x: 0, y: 0, width: 1, height: 1, zoom: 1, dpr: 1 }, { width: 1191, height: 842 });
    const tiles = pyramid.visibleTiles(logical);
    expect(rightCoverage(tiles, 1191)).toBeGreaterThanOrEqual(0.99);
    expect(tiles.length).toBeGreaterThan(0);
  });
});

describe('TileLru', () => {
  it('enforces the 96MiB hard default by evicting replaceable tiles and closing them', () => {
    const cache = new TileLru();
    const first = bitmap();
    const second = bitmap();

    cache.set('first', first, DEFAULT_TILE_CACHE_BYTES - 1);
    cache.set('second', second, 2, new Set(['second']));

    expect(cache.bytes).toBe(2);
    expect(first.close).toHaveBeenCalledOnce();
    expect(second.close).not.toHaveBeenCalled();
  });

  it('never evicts protected tiles and rejects an uncacheable replacement without exceeding budget', () => {
    const cache = new TileLru(100);
    const protectedTile = bitmap();
    const rejected = bitmap();

    expect(cache.set('visible', protectedTile, 60, new Set(['visible']))).toBe(true);
    expect(cache.set('next-visible', rejected, 60, new Set(['visible', 'next-visible']))).toBe(false);

    expect(cache.bytes).toBe(60);
    expect(cache.has('visible')).toBe(true);
    expect(rejected.close).toHaveBeenCalledOnce();
  });

  it('closes replaced and disposed bitmaps', () => {
    const cache = new TileLru(100);
    const oldBitmap = bitmap();
    const newBitmap = bitmap();

    cache.set('tile', oldBitmap, 40);
    cache.set('tile', newBitmap, 40);
    cache.dispose();

    expect(oldBitmap.close).toHaveBeenCalledOnce();
    expect(newBitmap.close).toHaveBeenCalledOnce();
  });

  it('retains a coalesced bitmap when the same cache owner writes its key again', () => {
    const cache = new TileLru(100);
    const shared = bitmap();

    cache.set('tile', shared, 40);
    cache.set('tile', shared, 40);

    expect(cache.get('tile')).toBe(shared);
    expect(shared.close).not.toHaveBeenCalled();
  });

  it('peek returns bitmap without mutating LRU recency while get mutates recency', () => {
    const cache = new TileLru(100);
    const first = bitmap();
    const second = bitmap();
    const third = bitmap();

    cache.set('first', first, 40);
    cache.set('second', second, 40);

    expect(cache.peek('first')).toBe(first);

    cache.set('third', third, 40);

    expect(cache.has('first')).toBe(false);
    expect(first.close).toHaveBeenCalledOnce();
    expect(cache.has('second')).toBe(true);
    expect(cache.has('third')).toBe(true);

    const cache2 = new TileLru(100);
    const a = bitmap();
    const b = bitmap();
    const c = bitmap();

    cache2.set('a', a, 40);
    cache2.set('b', b, 40);

    expect(cache2.get('a')).toBe(a);

    cache2.set('c', c, 40);

    expect(cache2.has('a')).toBe(true);
    expect(cache2.has('b')).toBe(false);
    expect(b.close).toHaveBeenCalledOnce();
  });
});
