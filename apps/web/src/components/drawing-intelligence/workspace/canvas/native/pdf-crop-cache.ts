/*
 * PAAX PDF viewer native — coverage-aware crop cache (pure-ish, no DOM).
 *
 * ORION-F3 ownership (Master Plan PAAX-2026-08-06-review-pdf-viewer-native §5):
 * byte-based LRU with coverage-aware spatial lookup. Exact render key is the
 * FAST PATH only; the real hit mechanism is coverage: same page + same dark
 * mode + cached region ⊇ requested viewport + density within tolerance.
 *
 * Design rules from the Master Plan:
 *   - Byte budget is the ONLY cap (never entry-count).
 *   - Bitmaps are always close()d on eviction/replace/dispose (DoD 16/17).
 *   - API returns SEVERAL intersecting cached crops so the viewer can draw
 *     2–4 relevant crops at once (Master Plan §5 ORION-F3 task 9).
 *   - Cache statistics: hit, miss, coverage hit, exact hit, eviction bytes.
 *
 * Bitmap type: structural `CloseableBitmap` so tests run in node with fake
 * bitmaps ({ close: vi.fn() }) — ImageBitmap satisfies it structurally.
 */

import {
  type PageBounds,
  type RenderRegion,
  computeRenderKey,
  containsRegion,
  coverageRatio,
  densityWithinTolerance,
  regionsIntersect,
} from './pdf-render-geometry';

/** Minimal bitmap contract — ImageBitmap satisfies this structurally. */
export interface CloseableBitmap {
  close(): void;
}

/** A cached crop. `key` is the exact render key (fast-path identity). */
export interface CachedCrop {
  key: string;
  pageIndex: number;
  region: RenderRegion;
  density: number;
  darkMode: boolean;
  bitmap: CloseableBitmap;
  widthPx: number;
  heightPx: number;
  estimatedBytes: number;
  /** Monotonic recency stamp — higher = more recently used. */
  lastAccess: number;
}

/** Request for a coverage-aware lookup. */
export interface CropLookupRequest {
  pageIndex: number;
  region: RenderRegion;
  density: number;
  darkMode: boolean;
  /** Density tolerance; defaults to DENSITY_TOLERANCE_PAAX (15%). */
  densityTolerance?: number;
  /** Optional page bounds — a cached crop outside the page is ignored. */
  pageBounds?: PageBounds;
}

/** Request to store a rendered crop. */
export interface CropStoreRequest {
  pageIndex: number;
  region: RenderRegion;
  density: number;
  darkMode: boolean;
  bitmap: CloseableBitmap;
  widthPx: number;
  heightPx: number;
  /** Optional precomputed byte estimate; falls back to widthPx×heightPx×4. */
  estimatedBytes?: number;
}

export interface CropCacheStats {
  /** Total lookups that returned at least one usable crop. */
  hit: number;
  /** Total lookups that returned nothing usable. */
  miss: number;
  /** Subset of hit: exact render-key fast-path match. */
  exactHit: number;
  /** Subset of hit: coverage match (non-exact key, cached ⊇ requested). */
  coverageHit: number;
  /** Total bytes closed/removed by eviction, replacement, and dispose. */
  evictionBytes: number;
  /** Current bytes held. */
  bytes: number;
  /** Current entry count (informational — NOT a cap). */
  entries: number;
}

function closeBitmap(bitmap: CloseableBitmap): void {
  try {
    bitmap.close();
  } catch {
    // A transferred or already-closed bitmap is already released.
  }
}

/** Byte meter: RGBA baseline, widthPx × heightPx × 4. */
function bytesFor(widthPx: number, heightPx: number): number {
  if (!(widthPx > 0) || !(heightPx > 0)) return 0;
  return Math.round(widthPx) * Math.round(heightPx) * 4;
}

/**
 * Coverage-aware byte LRU. The only cap is `maxBytes`; entries beyond it are
 * evicted least-recently-used. Exact key is a fast path; `lookupCrops` is the
 * spatial path that returns every intersecting usable crop.
 */
export class PdfCropCache {
  private readonly map = new Map<string, CachedCrop>();
  private totalBytes = 0;
  private tick = 0;
  private stats: CropCacheStats = {
    hit: 0,
    miss: 0,
    exactHit: 0,
    coverageHit: 0,
    evictionBytes: 0,
    bytes: 0,
    entries: 0,
  };

  constructor(
    /** Hard byte ceiling. Defaults to a conservative 96 MB (8 GB class). */
    readonly maxBytes = 96 * 1024 * 1024,
    /** Density tolerance for coverage reuse (default 15%). */
    readonly densityTolerance = 0.15,
  ) {
    this.maxBytes = Math.max(0, maxBytes);
  }

  get bytes(): number {
    return this.totalBytes;
  }

  get entries(): number {
    return this.map.size;
  }

  getStats(): CropCacheStats {
    return { ...this.stats, bytes: this.totalBytes, entries: this.map.size };
  }

  /** Fast path: exact render key only. Touches recency on hit. */
  getExact(key: string): CachedCrop | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    this.touch(key);
    return entry;
  }

  /**
   * Coverage-aware lookup: returns ALL cached crops that intersect the
   * requested viewport with sufficient density (viewer may draw 2–4 crops).
   * Sorted best-first: exact key first, then full containment, then by
   * coverage ratio, then by density. Counts hit/miss + exact/coverage stats.
   */
  lookupCrops(request: CropLookupRequest): CachedCrop[] {
    const matches: CachedCrop[] = [];
    const exactKey = computeRenderKey(request.pageIndex, request.region, request.density, request.darkMode);
    let exactMatch: CachedCrop | undefined;
    let coverageMatch: CachedCrop | undefined;

    for (const entry of this.map.values()) {
      if (entry.pageIndex !== request.pageIndex) continue;
      if (entry.darkMode !== request.darkMode) continue;
      if (
        request.pageBounds &&
        !regionsIntersect(entry.region, {
          x: 0,
          y: 0,
          width: request.pageBounds.width,
          height: request.pageBounds.height,
        })
      ) {
        continue;
      }
      if (!densityWithinTolerance(entry.density, request.density, request.densityTolerance ?? this.densityTolerance)) {
        continue;
      }
      if (entry.key === exactKey) {
        exactMatch = entry;
        matches.push(entry);
        continue;
      }
      if (!regionsIntersect(entry.region, request.region)) continue;
      matches.push(entry);
      if (containsRegion(entry.region, request.region)) coverageMatch ??= entry;
    }

    if (exactMatch) {
      this.stats.exactHit += 1;
      this.stats.hit += 1;
      this.touch(exactMatch.key);
      // Exact match is the single best answer; still return every intersecting
      // crop so the viewer can composite supplementary crops.
      return this.sortMatches(matches, request, exactKey);
    }

    if (coverageMatch) {
      this.stats.coverageHit += 1;
      this.stats.hit += 1;
      this.touch(coverageMatch.key);
    } else if (matches.length > 0) {
      this.stats.hit += 1;
    } else {
      this.stats.miss += 1;
    }

    return this.sortMatches(matches, request, exactKey);
  }

  /**
   * Convenience: the single best crop that fully contains the requested
   * viewport (coverage hit), or undefined. Non-exact keys allowed — this is
   * the "region sedikit berbeda masih pakai crop lama" acceptance path.
   */
  findCovering(request: CropLookupRequest): CachedCrop | undefined {
    const exactKey = computeRenderKey(request.pageIndex, request.region, request.density, request.darkMode);
    let best: CachedCrop | undefined;
    let bestScore = -1;
    for (const entry of this.map.values()) {
      if (entry.pageIndex !== request.pageIndex) continue;
      if (entry.darkMode !== request.darkMode) continue;
      if (!densityWithinTolerance(entry.density, request.density, request.densityTolerance ?? this.densityTolerance)) {
        continue;
      }
      if (!containsRegion(entry.region, request.region)) continue;
      const score = entry.key === exactKey ? Number.MAX_SAFE_INTEGER : coverageRatio(entry.region, request.region) * 1e6 + entry.density;
      if (score > bestScore) {
        bestScore = score;
        best = entry;
      }
    }
    if (best) {
      if (best.key === exactKey) {
        this.stats.exactHit += 1;
      } else {
        this.stats.coverageHit += 1;
      }
      this.stats.hit += 1;
      this.touch(best.key);
    } else {
      this.stats.miss += 1;
    }
    return best;
  }

  /** Store a crop. Returns false (and closes the bitmap) if it cannot fit. */
  set(request: CropStoreRequest): boolean {
    const estimatedBytes = request.estimatedBytes ?? bytesFor(request.widthPx, request.heightPx);
    if (!(estimatedBytes > 0)) {
      closeBitmap(request.bitmap);
      return false;
    }
    if (estimatedBytes > this.maxBytes) {
      closeBitmap(request.bitmap);
      return false;
    }
    const key = computeRenderKey(request.pageIndex, request.region, request.density, request.darkMode);
    const previous = this.map.get(key);
    if (previous) {
      this.totalBytes -= previous.estimatedBytes;
      closeBitmap(previous.bitmap);
      this.stats.evictionBytes += previous.estimatedBytes;
      this.map.delete(key);
    }

    const entry: CachedCrop = {
      key,
      pageIndex: request.pageIndex,
      region: request.region,
      density: request.density,
      darkMode: request.darkMode,
      bitmap: request.bitmap,
      widthPx: request.widthPx,
      heightPx: request.heightPx,
      estimatedBytes,
      lastAccess: ++this.tick,
    };
    this.map.set(key, entry);
    this.totalBytes += estimatedBytes;
    this.evict();
    return this.map.has(key);
  }

  /** Remove one entry by exact key. Returns true if it existed. */
  delete(key: string): boolean {
    const entry = this.map.get(key);
    if (!entry) return false;
    this.map.delete(key);
    this.totalBytes -= entry.estimatedBytes;
    closeBitmap(entry.bitmap);
    this.stats.evictionBytes += entry.estimatedBytes;
    return true;
  }

  /** Remove all entries, closing every bitmap. */
  clear(): void {
    for (const entry of this.map.values()) {
      closeBitmap(entry.bitmap);
      this.stats.evictionBytes += entry.estimatedBytes;
    }
    this.map.clear();
    this.totalBytes = 0;
  }

  dispose(): void {
    this.clear();
  }

  private touch(key: string): void {
    const entry = this.map.get(key);
    if (!entry) return;
    this.map.delete(key);
    entry.lastAccess = ++this.tick;
    this.map.set(key, entry);
  }

  private evict(): void {
    while (this.totalBytes > this.maxBytes && this.map.size > 0) {
      // Map preserves insertion order; the first key is the least recently used.
      const oldestKey = this.map.keys().next().value as string | undefined;
      if (oldestKey === undefined) break;
      this.delete(oldestKey);
    }
  }

  private sortMatches(matches: CachedCrop[], request: CropLookupRequest, exactKey: string): CachedCrop[] {
    const view = request.region;
    return [...matches].sort((a, b) => {
      const aExact = a.key === exactKey ? 1 : 0;
      const bExact = b.key === exactKey ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;
      const aCover = containsRegion(a.region, view) ? 1 : 0;
      const bCover = containsRegion(b.region, view) ? 1 : 0;
      if (aCover !== bCover) return bCover - aCover;
      const aRatio = coverageRatio(view, a.region);
      const bRatio = coverageRatio(view, b.region);
      if (aRatio !== bRatio) return bRatio - aRatio;
      return b.density - a.density;
    });
  }
}
