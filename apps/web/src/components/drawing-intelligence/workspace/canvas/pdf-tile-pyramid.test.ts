import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_TILE_CACHE_BYTES,
  PdfTilePyramid,
  TileLru,
  chooseDetailTileDensity,
  chooseTileDensity,
} from './pdf-tile-pyramid';

function bitmap() {
  return { close: vi.fn() } as unknown as ImageBitmap;
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
    expect(chooseTileDensity({ zoom: 8, dpr: 3 })).toBe(4);
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
