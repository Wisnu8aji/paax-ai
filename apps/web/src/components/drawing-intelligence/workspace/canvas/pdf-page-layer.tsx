'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { normalizeArtifactExpiry } from '../../drawing-intelligence-api';
import { fetchPdfBinary } from './pdf-binary-cache';
import {
  createPdfTilePool,
  getGlobalPdfTilePool,
  resetGlobalPdfTilePool,
  type PdfPageMetrics,
  type PdfTileDelivery,
} from './pdf-tile-pool';
import {
  PdfTilePyramid,
  TileLru,
  toLogicalViewport,
  type NormalizedViewport,
  type PdfLogicalViewport,
  type PdfTileRequest,
} from './pdf-tile-pyramid';

export { getGlobalPdfTilePool, resetGlobalPdfTilePool };

/**
 * Tile retain window: a tile that left the viewport stays painted for at most
 * this long, so the new generation has time to render and swap without a
 * blank frame. Eviction is generation-aware (P1), never driven by cache.has.
 */
export const VIEWPORT_RETAIN_MS = 250;
/** How long to postpone stale-tile eviction while new tiles are still in flight. */
export const VIEWPORT_EVICT_RETRY_MS = 100;
/** Debounce for the settled detail pass (zoom-settle sharpening). */
export const DETAIL_PASS_MS = 125;
/**
 * Overscan margin as a fraction of the viewport size, per side. Only valid
 * because the coordinate space is now explicit (viewportSpace) â€” overscan is
 * a smoothness buffer, not a coordinate-space fix (P0).
 */
export const OVERSCAN_MARGIN_PCT = 0.35;

let globalTileCacheInstance: TileLru | null = null;

export function getGlobalTileCache(): TileLru {
  if (!globalTileCacheInstance) {
    globalTileCacheInstance = new TileLru();
  }
  return globalTileCacheInstance;
}

export function resetGlobalTileCache(): void {
  if (globalTileCacheInstance) {
    globalTileCacheInstance.dispose();
    globalTileCacheInstance = null;
  }
}

export function shouldRefreshArtifactUrl(expiresAt: string | number, now: Date = new Date()): boolean {
  try {
    const normalized = normalizeArtifactExpiry(expiresAt);
    const expTime = new Date(normalized).getTime();
    const nowTime = now.getTime();
    return expTime - nowTime < 60000;
  } catch {
    return true;
  }
}

export type ViewportSpace = 'normalized' | 'logical';

export interface PdfPageLayerProps {
  runId: string;
  pageIndex: number;
  viewport: NormalizedViewport;
  /**
   * Explicit coordinate-space contract for `viewport`. The legacy heuristic
   * (width<=1 && height<=1) misclassified normalized fit viewports whose width
   * and/or height exceed 1 as logical/page-space, blanking the right page edge.
   * Defaults to 'normalized' â€” DrawingCanvas always sends normalized fractions
   * of the base page, so old call sites keep working unchanged.
   */
  viewportSpace?: ViewportSpace;
  fallbackWidth: number;
  fallbackHeight: number;
  onMetrics?: (metrics: PdfPageMetrics) => void;
  /**
   * Fired once per opened document after the first tile has been painted, so
   * the caller can hide a low-resolution underlay exactly when real tiles
   * cover the page (no blank gap during sheet switches with cached metrics).
   */
  onFirstPaint?: () => void;
  tilePool?: ReturnType<typeof createPdfTilePool>;
  tileCache?: TileLru;
}

function areTileGeometriesEqual(a: PdfTileRequest, b: PdfTileRequest): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height && a.density === b.density;
}

/** A painted tile entry, tagged with the render generation that produced it. */
interface PaintedEntry {
  tile: PdfTileRequest;
  revision: number;
  generation: number;
  paintedAt: number;
}

export function PdfPageLayer({
  runId,
  pageIndex,
  viewport,
  viewportSpace = 'normalized',
  onMetrics,
  onFirstPaint,
  tilePool,
  tileCache,
}: PdfPageLayerProps) {
  const poolRef = useRef<ReturnType<typeof createPdfTilePool> | null>(null);
  const cacheRef = useRef<TileLru | null>(null);
  const isExternalPoolRef = useRef(false);
  const openGenRef = useRef(0);
  const activeOpenGenRef = useRef<number | null>(null);
  const activeRequestsRef = useRef<Map<string, { identity: symbol; cancel: () => void }>>(new Map());
  const desiredKeysRef = useRef<Set<string>>(new Set());
  const renderGenRef = useRef(0);
  const evictTimerRef = useRef<number | null>(null);

  if (tilePool) {
    poolRef.current = tilePool;
    isExternalPoolRef.current = true;
  } else if (!poolRef.current) {
    poolRef.current = getGlobalPdfTilePool();
    isExternalPoolRef.current = false;
  }

  if (tileCache) {
    cacheRef.current = tileCache;
  } else if (!cacheRef.current) {
    cacheRef.current = getGlobalTileCache();
  }

  const [metrics, setMetrics] = useState<PdfPageMetrics | null>(null);
  const [painted, setPainted] = useState(new Map<string, PaintedEntry>());
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  const documentKey = `${runId}:${pageIndex}`;
  const pageNumber = pageIndex + 1;

  const onMetricsRef = useRef(onMetrics);
  onMetricsRef.current = onMetrics;
  const onFirstPaintRef = useRef(onFirstPaint);
  onFirstPaintRef.current = onFirstPaint;
  const notifiedFirstPaintRef = useRef<string | null>(null);

  // Fire onFirstPaint exactly once per opened document, after the first tile
  // of THAT document is actually painted (P3: thumbnail underlay stays until
  // real tiles cover). The painted map may still hold previous-document tiles
  // on the same commit where the open effect resets it, so guard by tile key.
  useEffect(() => {
    if (painted.size === 0) return;
    const hasCurrentDocTiles = [...painted.values()].some((entry) => entry.tile.key.startsWith(`${documentKey}:`));
    if (!hasCurrentDocTiles) return;
    if (notifiedFirstPaintRef.current === documentKey) return;
    notifiedFirstPaintRef.current = documentKey;
    onFirstPaintRef.current?.();
  }, [painted, documentKey]);

  // Cleanup active requests on unmount of the layer component
  useEffect(() => {
    const activePool = poolRef.current;
    const isExternal = isExternalPoolRef.current;
    return () => {
      activeRequestsRef.current.forEach((entry) => entry.cancel());
      activeRequestsRef.current.clear();
      desiredKeysRef.current.clear();
      if (activePool && isExternal) {
        activePool.dispose();
      }
    };
  }, []);

  // Open Document & Fetch Metrics Lifecycle
  useEffect(() => {
    const currentGen = ++openGenRef.current;
    activeOpenGenRef.current = null;
    notifiedFirstPaintRef.current = null;
    activeRequestsRef.current.forEach((entry) => entry.cancel());
    activeRequestsRef.current.clear();
    desiredKeysRef.current.clear();

    const pool = poolRef.current ?? (tilePool || getGlobalPdfTilePool());
    const cache = cacheRef.current ?? (tileCache || getGlobalTileCache());
    poolRef.current = pool;
    cacheRef.current = cache;
    setMetrics(null);
    setPainted(new Map());
    setError(null);
    let cancelled = false;

    const open = async (gen: number) => {
      try {
        const buffer = await fetchPdfBinary(runId);
        if (cancelled || openGenRef.current !== gen) return;

        const verified = await pool.open({ documentKey, pageNumber, data: buffer });
        if (cancelled || openGenRef.current !== gen) return;
        activeOpenGenRef.current = gen;
        setMetrics(verified);
        onMetricsRef.current?.(verified);
      } catch (cause) {
        if (!cancelled && openGenRef.current === gen) {
          setError(cause instanceof Error ? cause.message : 'PDF page could not be opened');
        }
      }
    };

    void open(currentGen);

    return () => {
      cancelled = true;
      activeRequestsRef.current.forEach((entry) => entry.cancel());
      activeRequestsRef.current.clear();
      desiredKeysRef.current.clear();
      pool.close(documentKey);
    };
  }, [runId, pageIndex, documentKey, pageNumber, retry, tilePool, tileCache]);

  const pyramid = useMemo(
    () => (metrics ? new PdfTilePyramid({ pageKey: documentKey, width: metrics.width, height: metrics.height }) : null),
    [metrics, documentKey],
  );

  // Render Visible & Detail Tiles Lifecycle
  useEffect(() => {
    const currentGen = openGenRef.current;
    if (!metrics || !pyramid || error || activeOpenGenRef.current !== currentGen) return;

    const pool = poolRef.current ?? (tilePool || getGlobalPdfTilePool());
    const cache = cacheRef.current ?? (tileCache || getGlobalTileCache());

    const gen = ++renderGenRef.current;

    // Explicit coordinate-space contract: DrawingCanvas always sends normalized
    // fractions of the base page. Legacy heuristic removed â€” normalized
    // viewports whose width/height exceed 1 (fit zoom on wide containers) were
    // misclassified as logical space, blanking the right page edge.
    const logicalViewport: PdfLogicalViewport =
      viewportSpace === 'logical'
        ? (viewport as PdfLogicalViewport)
        : toLogicalViewport(viewport as NormalizedViewport, metrics);

    const visible = pyramid.visibleTiles(logicalViewport, OVERSCAN_MARGIN_PCT);
    const detailTiles = pyramid.visibleDetailTiles(logicalViewport, OVERSCAN_MARGIN_PCT);

    const desiredKeys = new Set(visible.map((t) => t.key));
    desiredKeysRef.current = desiredKeys;

    for (const [key, requestEntry] of [...activeRequestsRef.current.entries()]) {
      if (!desiredKeys.has(key)) {
        requestEntry.cancel();
        activeRequestsRef.current.delete(key);
      }
    }

    // Generation-aware eviction (P1): a tile that left the viewport is only
    // removed once the current generation has painted coverage AND its retain
    // window has passed. The legacy `!cache.has(key)` guard held stale canvases
    // forever, leaking DOM canvases; a cache hit is not a replacement.
    // `next.size > 1` keeps at least one painted tile when no replacement
    // generation has painted yet, so the view can never go zero-visible.
    setPainted((prev) => {
      let changed = false;
      const next = new Map(prev);
      const now = performance.now();
      for (const [key, entry] of prev) {
        if (desiredKeys.has(key)) continue;
        const newGenHasCoverage = [...next.values()].some((candidate) => candidate.generation === gen);
        if (entry.generation < gen && now - entry.paintedAt > VIEWPORT_RETAIN_MS && (newGenHasCoverage || next.size > 1)) {
          next.delete(key);
          changed = true;
        }
      }
      return changed ? next : prev;
    });

    const protectedKeys = new Set(desiredKeys);

    const requestTile = (tile: PdfTileRequest) => {
      if (activeRequestsRef.current.has(tile.key)) return;

      const identity = Symbol(tile.key);
      const handle = pool.request({ documentKey, pageNumber, tile });
      activeRequestsRef.current.set(tile.key, { identity, cancel: handle.cancel });

      handle.promise
        .then((delivery: PdfTileDelivery) => {
          const entry = activeRequestsRef.current.get(tile.key);
          if (
            entry?.identity !== identity ||
            !desiredKeysRef.current.has(tile.key) ||
            openGenRef.current !== currentGen ||
            activeOpenGenRef.current !== currentGen
          ) {
            return;
          }

          const bitmap = delivery.claim();
          if (bitmap) {
            cache.set(tile.key, bitmap, delivery.width * delivery.height * 4, protectedKeys);
          }

          if (cache.has(tile.key)) {
            setPainted((prev) => {
              const existing = prev.get(tile.key);
              const next = new Map(prev);
              const revision = existing ? existing.revision + 1 : 1;
              next.set(tile.key, { tile, revision, generation: gen, paintedAt: performance.now() });
              return next;
            });
          }
        })
        .catch(() => undefined)
        .finally(() => {
          if (activeRequestsRef.current.get(tile.key)?.identity === identity) {
            activeRequestsRef.current.delete(tile.key);
          }
        });
    };

    for (const tile of visible) {
      const cached = cache.has(tile.key) ? cache.get(tile.key) : undefined;
      if (cached) {
        setPainted((prev) => {
          const existing = prev.get(tile.key);
          if (existing && areTileGeometriesEqual(existing.tile, tile)) {
            return prev;
          }
          const next = new Map(prev);
          next.set(tile.key, {
            tile,
            revision: existing ? existing.revision : 1,
            generation: gen,
            paintedAt: performance.now(),
          });
          return next;
        });
      } else {
        requestTile(tile);
      }
    }

    const detailTimer = window.setTimeout(() => {
      if (openGenRef.current !== currentGen || activeOpenGenRef.current !== currentGen) return;
      for (const tile of detailTiles) {
        desiredKeysRef.current.add(tile.key);
        requestTile(tile);
      }
    }, DETAIL_PASS_MS);

    // Bounded stale-tile cleanup. While a replacement generation is still in
    // flight (active requests), postpone the eviction so the view never goes
    // zero-visible; otherwise drop tiles whose retain window has passed, but
    // keep at least one painted tile when nothing from the current generation
    // has painted yet (e.g. every in-flight request errored).
    if (evictTimerRef.current !== null) {
      window.clearTimeout(evictTimerRef.current);
      evictTimerRef.current = null;
    }
    const scheduleEvict = (delayMs: number) => {
      evictTimerRef.current = window.setTimeout(() => {
        evictTimerRef.current = null;
        if (activeRequestsRef.current.size > 0) {
          scheduleEvict(VIEWPORT_EVICT_RETRY_MS);
          return;
        }
        setPainted((prev) => {
          let changed = false;
          const next = new Map(prev);
          const now = performance.now();
          for (const [key, entry] of prev) {
            if (!desiredKeysRef.current.has(key) && now - entry.paintedAt > VIEWPORT_RETAIN_MS) {
              const newGenHasCoverage = [...next.values()].some((candidate) => candidate.generation === gen);
              if (newGenHasCoverage || next.size > 1) {
                next.delete(key);
                changed = true;
              }
            }
          }
          return changed ? next : prev;
        });
      }, delayMs);
    };
    scheduleEvict(VIEWPORT_RETAIN_MS);

    return () => {
      window.clearTimeout(detailTimer);
      if (evictTimerRef.current !== null) {
        window.clearTimeout(evictTimerRef.current);
        evictTimerRef.current = null;
      }
    };
  }, [metrics, viewport, error, pyramid, documentKey, pageNumber, tilePool, tileCache, viewportSpace]);

  if (error) {
    return (
      <button type="button" onClick={() => setRetry((value) => value + 1)}>
        Retry PDF: {error}
      </button>
    );
  }

  if (!metrics) {
    return <div role="status">Loading original PDFâ€¦</div>;
  }

  return (
    <div
      data-testid="pdf-page-layer"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        aspectRatio: `${metrics.width} / ${metrics.height}`,
      }}
    >
      {[...painted.entries()].map(([key, { tile, revision }]) => (
        <TileCanvas
          key={key}
          tile={tile}
          revision={revision}
          cache={cacheRef.current}
          pageWidth={metrics.width}
          pageHeight={metrics.height}
        />
      ))}
    </div>
  );
}

function TileCanvas({
  tile,
  revision,
  cache,
  pageWidth,
  pageHeight,
}: {
  tile: PdfTileRequest;
  revision: number;
  cache: TileLru | null;
  pageWidth: number;
  pageHeight: number;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!cache) return;
    const bitmap = cache.peek(tile.key);
    if (!bitmap) return;
    const canvas = ref.current;
    const context = canvas?.getContext('2d');
    if (canvas && context) {
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      context.drawImage(bitmap, 0, 0);
    }
  }, [tile.key, revision, cache]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: `${(tile.x / tile.density / pageWidth) * 100}%`,
        top: `${(tile.y / tile.density / pageHeight) * 100}%`,
        width: `${(tile.width / tile.density / pageWidth) * 100}%`,
        height: `${(tile.height / tile.density / pageHeight) * 100}%`,
        zIndex: tile.density > 4 ? 2 : 1,
      }}
    />
  );
}

