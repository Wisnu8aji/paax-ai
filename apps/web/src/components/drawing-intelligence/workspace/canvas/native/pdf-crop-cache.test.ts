import { describe, expect, it, vi, type Mock } from 'vitest';

import { PdfCropCache, type CachedCrop, type CloseableBitmap, type CropLookupRequest, type CropStoreRequest } from './pdf-crop-cache';
import { computeRenderKey } from './pdf-render-geometry';

/** A CloseableBitmap whose close() is a vitest mock (vitest 4 explicit generic). */
type FakeBitmap = CloseableBitmap & { close: Mock<() => void> };

function fakeBitmap(): FakeBitmap {
  return { close: vi.fn<() => void>() };
}

interface Seed {
  pageIndex?: number;
  region?: { x: number; y: number; width: number; height: number };
  density?: number;
  darkMode?: boolean;
  widthPx?: number;
  heightPx?: number;
  bitmap?: FakeBitmap;
}

function seed(cache: PdfCropCache, overrides: Seed = {}): { key: string; bitmap: FakeBitmap } {
  const pageIndex = overrides.pageIndex ?? 0;
  const region = overrides.region ?? { x: 0, y: 0, width: 1000, height: 800 };
  const density = overrides.density ?? 2;
  const darkMode = overrides.darkMode ?? false;
  const widthPx = overrides.widthPx ?? Math.round(region.width * density);
  const heightPx = overrides.heightPx ?? Math.round(region.height * density);
  const bitmap = overrides.bitmap ?? fakeBitmap();
  const request: CropStoreRequest = { pageIndex, region, density, darkMode, bitmap, widthPx, heightPx };
  const ok = cache.set(request);
  if (!ok) throw new Error('seed failed: crop did not fit');
  return { key: computeRenderKey(pageIndex, region, density, darkMode), bitmap };
}

function lookup(pageIndex: number, region: { x: number; y: number; width: number; height: number }, density: number, darkMode = false): CropLookupRequest {
  return { pageIndex, region, density, darkMode };
}

const PAGE_BOUNDS = { width: 2482, height: 1747 };

describe('PdfCropCache — exact fast path', () => {
  it('getExact returns the crop only for an identical key', () => {
    const cache = new PdfCropCache(64 * 1024 * 1024);
    const { key } = seed(cache);
    expect(cache.getExact(key)).toBeDefined();
    expect(cache.getExact('nope')).toBeUndefined();
  });
});

describe('PdfCropCache — coverage-aware lookup', () => {
  it('returns the cached crop for a slightly different viewport (acceptance)', () => {
    const cache = new PdfCropCache(64 * 1024 * 1024);
    const cachedRegion = { x: 0, y: 0, width: 1000, height: 800 };
    seed(cache, { region: cachedRegion, density: 2 });

    // Viewport shifted a bit inside the cached region — NOT the exact key.
    const viewport = { x: 50, y: 50, width: 400, height: 300 };
    const crops = cache.lookupCrops(lookup(0, viewport, 2));
    expect(crops.length).toBe(1);
    expect(crops[0].region).toEqual(cachedRegion);

    // findCovering agrees: coverage hit.
    const covering = cache.findCovering(lookup(0, viewport, 2));
    expect(covering?.region).toEqual(cachedRegion);
  });

  it('rejects crops whose region does not contain the viewport', () => {
    const cache = new PdfCropCache(64 * 1024 * 1024);
    seed(cache, { region: { x: 0, y: 0, width: 100, height: 100 }, density: 2 });
    const crops = cache.lookupCrops(lookup(0, { x: 200, y: 200, width: 100, height: 100 }, 2));
    expect(crops.length).toBe(0);
    expect(cache.findCovering(lookup(0, { x: 200, y: 200, width: 100, height: 100 }, 2))).toBeUndefined();
  });

  it('separates pages and dark modes', () => {
    const cache = new PdfCropCache(64 * 1024 * 1024);
    const region = { x: 0, y: 0, width: 1000, height: 800 };
    seed(cache, { pageIndex: 0, region, darkMode: false });
    seed(cache, { pageIndex: 1, region, darkMode: false });
    seed(cache, { pageIndex: 0, region, darkMode: true });

    expect(cache.lookupCrops(lookup(0, { x: 100, y: 100, width: 100, height: 100 }, 2, false)).length).toBe(1);
    expect(cache.lookupCrops(lookup(1, { x: 100, y: 100, width: 100, height: 100 }, 2, false)).length).toBe(1);
    expect(cache.lookupCrops(lookup(0, { x: 100, y: 100, width: 100, height: 100 }, 2, true)).length).toBe(1);
    expect(cache.lookupCrops(lookup(0, { x: 100, y: 100, width: 100, height: 100 }, 2, false)).length).toBe(1);
  });

  it('applies density tolerance on coverage reuse', () => {
    const cache = new PdfCropCache(64 * 1024 * 1024);
    const region = { x: 0, y: 0, width: 1000, height: 800 };
    seed(cache, { region, density: 2 });

    // Requesting 2.2 with default 15% tolerance → cached 2.0 is acceptable.
    expect(cache.findCovering(lookup(0, { x: 100, y: 100, width: 100, height: 100 }, 2.2))).toBeDefined();
    // Requesting 3.0 → 2.0 is 33% below → rejected.
    expect(cache.findCovering(lookup(0, { x: 100, y: 100, width: 100, height: 100 }, 3))).toBeUndefined();
  });

  it('returns multiple intersecting crops for the viewer to composite', () => {
    const cache = new PdfCropCache(64 * 1024 * 1024);
    seed(cache, { region: { x: 0, y: 0, width: 1000, height: 800 }, density: 2 });
    seed(cache, { region: { x: 900, y: 0, width: 1000, height: 800 }, density: 2 });

    // Viewport overlapping both crops.
    const crops = cache.lookupCrops(lookup(0, { x: 850, y: 100, width: 200, height: 200 }, 2));
    expect(crops.length).toBe(2);
  });

  it('sorts exact match first, then containment, then coverage ratio', () => {
    const cache = new PdfCropCache(64 * 1024 * 1024);
    const viewport = { x: 100, y: 100, width: 400, height: 300 };
    seed(cache, { region: { x: 0, y: 0, width: 1000, height: 800 }, density: 2 }); // contains
    const exact = seed(cache, { region: viewport, density: 2 }); // exact key

    const crops = cache.lookupCrops(lookup(0, viewport, 2));
    expect(crops.length).toBe(2);
    expect(crops[0].key).toBe(exact.key);
  });
});

describe('PdfCropCache — byte-based LRU eviction', () => {
  it('evicts the least-recently-used crop when over the byte budget', () => {
    // Crops of 500×400 @ density 2 → 1000×800 px → 3.2 MB each.
    const cache = new PdfCropCache(8 * 1024 * 1024); // 8 MB
    const a = seed(cache, { region: { x: 0, y: 0, width: 500, height: 400 }, density: 2 }); // 3.2 MB
    const b = seed(cache, { region: { x: 2000, y: 0, width: 500, height: 400 }, density: 2 }); // 3.2 MB
    expect(cache.entries).toBe(2);

    // Touch A so B becomes LRU, then insert C (3.2 MB) → B evicted.
    cache.getExact(a.key);
    const c = seed(cache, { region: { x: 4000, y: 0, width: 500, height: 400 }, density: 2 });
    expect(cache.entries).toBe(2);
    expect(cache.getExact(a.key)).toBeDefined();
    expect(cache.getExact(b.key)).toBeUndefined();
    expect(cache.getExact(c.key)).toBeDefined();
    expect(b.bitmap.close).toHaveBeenCalledOnce();
  });

  it('never exceeds the byte budget after a series of inserts', () => {
    const maxBytes = 20 * 1024 * 1024;
    const cache = new PdfCropCache(maxBytes);
    for (let i = 0; i < 20; i += 1) {
      seed(cache, { region: { x: i * 100, y: 0, width: 500, height: 400 }, density: 2 });
      expect(cache.bytes).toBeLessThanOrEqual(maxBytes);
    }
  });

  it('closes the replaced bitmap on duplicate-key overwrite', () => {
    const cache = new PdfCropCache(64 * 1024 * 1024);
    const region = { x: 0, y: 0, width: 1000, height: 800 };
    const first = seed(cache, { region, density: 2 });
    const second = seed(cache, { region, density: 2 });
    expect(cache.entries).toBe(1);
    expect(first.bitmap.close).toHaveBeenCalledOnce();
    expect(second.bitmap.close).not.toHaveBeenCalled();
  });

  it('rejects a crop larger than the whole budget (closes the bitmap)', () => {
    const cache = new PdfCropCache(1 * 1024 * 1024); // 1 MB
    const bitmap = fakeBitmap();
    const ok = cache.set({
      pageIndex: 0,
      region: { x: 0, y: 0, width: 1000, height: 800 },
      density: 2,
      darkMode: false,
      bitmap,
      widthPx: 2000,
      heightPx: 1600,
    });
    expect(ok).toBe(false);
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(cache.entries).toBe(0);
  });

  it('rejects zero-byte crops', () => {
    const cache = new PdfCropCache(64 * 1024 * 1024);
    const bitmap = fakeBitmap();
    const ok = cache.set({
      pageIndex: 0,
      region: { x: 0, y: 0, width: 0, height: 0 },
      density: 2,
      darkMode: false,
      bitmap,
      widthPx: 0,
      heightPx: 0,
    });
    expect(ok).toBe(false);
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it('dispose closes every bitmap and zeroes bytes', () => {
    const cache = new PdfCropCache(64 * 1024 * 1024);
    const a = seed(cache);
    const b = seed(cache, { region: { x: 3000, y: 0, width: 1000, height: 800 } });
    cache.dispose();
    expect(a.bitmap.close).toHaveBeenCalledOnce();
    expect(b.bitmap.close).toHaveBeenCalledOnce();
    expect(cache.bytes).toBe(0);
    expect(cache.entries).toBe(0);
  });
});

describe('PdfCropCache — statistics', () => {
  it('counts exact hits, coverage hits, misses, and eviction bytes', () => {
    // 3.2 MB crops; 5 MB budget → inserting the second crop evicts the LRU.
    const cache = new PdfCropCache(5 * 1024 * 1024);
    const region = { x: 0, y: 0, width: 500, height: 400 };
    const first = seed(cache, { region, density: 2 }); // ~3.2 MB

    // Exact hit.
    cache.findCovering(lookup(0, region, 2));
    // Coverage hit (slightly different viewport).
    cache.findCovering(lookup(0, { x: 10, y: 10, width: 250, height: 200 }, 2));
    // Miss (density too far).
    cache.findCovering(lookup(0, { x: 10, y: 10, width: 250, height: 200 }, 4));

    const stats = cache.getStats();
    expect(stats.hit).toBe(2);
    expect(stats.miss).toBe(1);
    expect(stats.exactHit).toBe(1);
    expect(stats.coverageHit).toBe(1);

    // Evict everything → evictionBytes accumulates.
    const b = seed(cache, { region: { x: 2000, y: 0, width: 500, height: 400 }, density: 2 });
    cache.delete(b.key);
    const afterDelete = cache.getStats();
    expect(afterDelete.evictionBytes).toBeGreaterThan(0);
    expect(afterDelete.bytes).toBeLessThan(cache.maxBytes);
    expect(first.bitmap.close).toHaveBeenCalled(); // evicted during insert of b
  });

  it('lookupCrops and findCovering both update stats', () => {
    const cache = new PdfCropCache(64 * 1024 * 1024);
    const region = { x: 0, y: 0, width: 1000, height: 800 };
    seed(cache, { region, density: 2 });

    cache.lookupCrops(lookup(0, { x: 10, y: 10, width: 100, height: 100 }, 2)); // coverage
    cache.lookupCrops(lookup(0, { x: 5000, y: 5000, width: 100, height: 100 }, 2)); // miss
    const stats = cache.getStats();
    expect(stats.hit).toBe(1);
    expect(stats.coverageHit).toBe(1);
    expect(stats.miss).toBe(1);
  });

  it('does not count an in-bounds but non-intersecting crop as a hit', () => {
    const cache = new PdfCropCache(64 * 1024 * 1024);
    seed(cache, { region: { x: 0, y: 0, width: 1000, height: 800 }, density: 2 });
    cache.lookupCrops({ ...lookup(0, { x: 2000, y: 0, width: 100, height: 100 }, 2), pageBounds: PAGE_BOUNDS });
    expect(cache.getStats().miss).toBe(1);
    expect(cache.getStats().hit).toBe(0);
  });
});

describe('PdfCropCache — page bounds filtering', () => {
  it('ignores cached crops that fall outside the page bounds', () => {
    const cache = new PdfCropCache(64 * 1024 * 1024);
    seed(cache, { region: { x: 3000, y: 0, width: 1000, height: 800 } }); // off-page
    const request: CropLookupRequest = {
      ...lookup(0, { x: 0, y: 0, width: 100, height: 100 }, 2),
      pageBounds: PAGE_BOUNDS,
    };
    expect(cache.lookupCrops(request).length).toBe(0);
  });
});

describe('PdfCropCache — LRU recency via findCovering', () => {
  it('findCovering refreshes recency so the used crop survives eviction', () => {
    const cache = new PdfCropCache(8 * 1024 * 1024);
    const regionA = { x: 0, y: 0, width: 500, height: 400 };
    const regionB = { x: 2000, y: 0, width: 500, height: 400 };
    seed(cache, { region: regionA, density: 2 });
    const b = seed(cache, { region: regionB, density: 2 });

    // Use A via coverage → A is now most-recent.
    cache.findCovering(lookup(0, { x: 10, y: 10, width: 100, height: 100 }, 2));

    // Insert C (3.2 MB) → B evicted (LRU), A survives.
    const c = seed(cache, { region: { x: 4000, y: 0, width: 500, height: 400 }, density: 2 });
    expect(cache.getExact(c.key)).toBeDefined();
    expect(cache.getExact(b.key)).toBeUndefined();
    expect(cache.findCovering(lookup(0, { x: 10, y: 10, width: 100, height: 100 }, 2))).toBeDefined();
  });
});

describe('PdfCropCache — misc API', () => {
  it('delete removes one entry and closes the bitmap', () => {
    const cache = new PdfCropCache(64 * 1024 * 1024);
    const { key, bitmap } = seed(cache);
    expect(cache.delete(key)).toBe(true);
    expect(cache.delete(key)).toBe(false);
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(cache.entries).toBe(0);
  });

  it('clear closes every bitmap', () => {
    const cache = new PdfCropCache(64 * 1024 * 1024);
    const a = seed(cache);
    const b = seed(cache, { region: { x: 3000, y: 0, width: 1000, height: 800 } });
    cache.clear();
    expect(a.bitmap.close).toHaveBeenCalledOnce();
    expect(b.bitmap.close).toHaveBeenCalledOnce();
  });

  it('exposes entries count as informational (not a cap)', () => {
    const cache = new PdfCropCache(64 * 1024 * 1024);
    seed(cache);
    expect(cache.entries).toBe(1);
    expect(cache.bytes).toBeGreaterThan(0);
  });

  it('is typed to hold CachedCrop values with metadata', () => {
    const cache = new PdfCropCache(64 * 1024 * 1024);
    const { key } = seed(cache, { region: { x: 0, y: 0, width: 500, height: 400 }, density: 2 });
    const crop = cache.getExact(key) as CachedCrop | undefined;
    expect(crop?.widthPx).toBe(1000);
    expect(crop?.heightPx).toBe(800);
    expect(crop?.estimatedBytes).toBe(1000 * 800 * 4);
    expect(crop?.pageIndex).toBe(0);
    expect(crop?.darkMode).toBe(false);
  });
});
