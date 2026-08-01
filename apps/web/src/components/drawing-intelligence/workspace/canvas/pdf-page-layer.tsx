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
  type PdfTileRequest,
  type TileViewport,
} from './pdf-tile-pyramid';

let globalPoolInstance: ReturnType<typeof createPdfTilePool> | null = null;

export function getGlobalPdfTilePool(): ReturnType<typeof createPdfTilePool> {
  if (!globalPoolInstance) {
    globalPoolInstance = createPdfTilePool();
  }
  return globalPoolInstance;
}

export function resetGlobalPdfTilePool(): void {
  if (globalPoolInstance) {
    globalPoolInstance.dispose();
    globalPoolInstance = null;
  }
}

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

export interface PdfPageLayerProps {
  runId: string;
  pageIndex: number;
  viewport: TileViewport;
  fallbackWidth: number;
  fallbackHeight: number;
  onMetrics?: (metrics: PdfPageMetrics) => void;
  tilePool?: ReturnType<typeof createPdfTilePool>;
  tileCache?: TileLru;
}

function areTileGeometriesEqual(a: PdfTileRequest, b: PdfTileRequest): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height && a.density === b.density;
}

export function PdfPageLayer({
  runId,
  pageIndex,
  viewport,
  onMetrics,
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

  if (!poolRef.current) {
    if (tilePool) {
      poolRef.current = tilePool;
      isExternalPoolRef.current = true;
    } else {
      poolRef.current = createPdfTilePool();
      isExternalPoolRef.current = false;
    }
  }

  if (!cacheRef.current) {
    if (tileCache) {
      cacheRef.current = tileCache;
    } else {
      cacheRef.current = getGlobalTileCache();
    }
  }

  const [metrics, setMetrics] = useState<PdfPageMetrics | null>(null);
  const [painted, setPainted] = useState(new Map<string, { tile: PdfTileRequest; revision: number }>());
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  const documentKey = `${runId}:${pageIndex}`;
  const pageNumber = pageIndex + 1;

  const onMetricsRef = useRef(onMetrics);
  onMetricsRef.current = onMetrics;

  useEffect(() => {
    const currentGen = ++openGenRef.current;
    activeOpenGenRef.current = null;
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
      if (!isExternalPoolRef.current) {
        cache.dispose();
        pool.dispose();
        if (poolRef.current === pool) poolRef.current = null;
        if (cacheRef.current === cache) cacheRef.current = null;
      }
    };
  }, [runId, pageIndex, documentKey, pageNumber, retry, tilePool, tileCache]);

  const pyramid = useMemo(
    () => (metrics ? new PdfTilePyramid({ pageKey: documentKey, width: metrics.width, height: metrics.height }) : null),
    [metrics, documentKey],
  );

  useEffect(() => {
    const currentGen = openGenRef.current;
    if (!metrics || !pyramid || error || activeOpenGenRef.current !== currentGen) return;

    const pool = poolRef.current ?? (tilePool || getGlobalPdfTilePool());
    const cache = cacheRef.current ?? (tileCache || getGlobalTileCache());

    const visible = pyramid.visibleTiles(viewport);
    const detailTiles = pyramid.visibleDetailTiles(viewport);

    const desiredKeys = new Set(visible.map((t) => t.key));
    desiredKeysRef.current = desiredKeys;

    for (const [key, requestEntry] of [...activeRequestsRef.current.entries()]) {
      if (!desiredKeys.has(key)) {
        requestEntry.cancel();
        activeRequestsRef.current.delete(key);
      }
    }

    setPainted((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const key of prev.keys()) {
        if (!desiredKeys.has(key)) {
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
              next.set(tile.key, { tile, revision });
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
          if (!existing) {
            const next = new Map(prev);
            next.set(tile.key, { tile, revision: 1 });
            return next;
          }
          if (areTileGeometriesEqual(existing.tile, tile)) {
            return prev;
          }
          const next = new Map(prev);
          next.set(tile.key, { tile, revision: existing.revision });
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
    }, 125);

    return () => {
      window.clearTimeout(detailTimer);
    };
  }, [metrics, viewport, error, pyramid, documentKey, pageNumber]);

  if (error) {
    return (
      <button type="button" onClick={() => setRetry((value) => value + 1)}>
        Retry PDF: {error}
      </button>
    );
  }

  if (!metrics) {
    return <div role="status">Loading original PDF…</div>;
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
