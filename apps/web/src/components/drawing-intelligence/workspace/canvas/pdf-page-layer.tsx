'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchPdfArtifactUrl, normalizeArtifactExpiry, PDF_ARTIFACT_REFRESH_SKEW_MS } from '../../drawing-intelligence-api';
import { TileLru, PdfTilePyramid, type TileViewport, type PdfTileRequest } from './pdf-tile-pyramid';
import { createPdfTilePool, type PdfPageMetrics } from './pdf-tile-pool';

export function shouldRefreshArtifactUrl(expiresAt: string | number, now = new Date()): boolean {
  const normalized = normalizeArtifactExpiry(expiresAt);
  return new Date(normalized).getTime() - now.getTime() <= PDF_ARTIFACT_REFRESH_SKEW_MS;
}

function areTileGeometriesEqual(a: PdfTileRequest, b: PdfTileRequest): boolean {
  return (
    a.tx === b.tx &&
    a.ty === b.ty &&
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height &&
    a.density === b.density
  );
}

export interface PdfPageLayerProps {
  runId: string;
  pageIndex: number;
  viewport: TileViewport;
  fallbackWidth: number;
  fallbackHeight: number;
  onMetrics?: (metrics: PdfPageMetrics) => void;
}

/** Original-PDF-only tile layer. Signed URLs live solely in this component. */
export function PdfPageLayer({ runId, pageIndex, viewport, fallbackWidth, fallbackHeight, onMetrics }: PdfPageLayerProps) {
  const poolRef = useRef<ReturnType<typeof createPdfTilePool> | null>(null);
  const cacheRef = useRef<TileLru | null>(null);
  const openGenRef = useRef(0);
  const activeOpenGenRef = useRef<number | null>(null);
  const [metrics, setMetrics] = useState<PdfPageMetrics | null>(null);
  const [painted, setPainted] = useState(new Map<string, { tile: PdfTileRequest; revision: number }>());
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const documentKey = `${runId}:${pageIndex}`;
  const onMetricsRef = useRef(onMetrics);
  onMetricsRef.current = onMetrics;

  useEffect(() => {
    const currentGen = ++openGenRef.current;
    activeOpenGenRef.current = null;
    const pool = createPdfTilePool();
    const cache = new TileLru();
    poolRef.current = pool;
    cacheRef.current = cache;
    setMetrics(null);
    setPainted(new Map());
    setError(null);
    let cancelled = false;
    let refreshTimer: number | undefined;

    const open = async (gen: number) => {
      try {
        const next = await fetchPdfArtifactUrl(runId);
        if (cancelled || openGenRef.current !== gen) return;
        const verified = await pool.open({ documentKey, pageNumber: pageIndex + 1, url: next.url });
        if (cancelled || openGenRef.current !== gen) return;
        activeOpenGenRef.current = gen;
        setMetrics(verified);
        onMetricsRef.current?.(verified);
        refreshTimer = window.setTimeout(() => {
          if (cancelled || openGenRef.current !== gen) return;
          activeOpenGenRef.current = null;
          pool.close(documentKey);
          void open(gen);
        }, Math.max(0, new Date(next.expiresAt).getTime() - Date.now() - PDF_ARTIFACT_REFRESH_SKEW_MS));
      } catch (cause) {
        if (!cancelled && openGenRef.current === gen) {
          setError(cause instanceof Error ? cause.message : 'PDF page could not be opened');
        }
      }
    };

    void open(currentGen);

    return () => {
      cancelled = true;
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      pool.close(documentKey);
      cache.dispose();
      pool.dispose();
      if (poolRef.current === pool) poolRef.current = null;
      if (cacheRef.current === cache) cacheRef.current = null;
    };
  }, [runId, pageIndex, documentKey, retry]);

  const dimensions = metrics ?? { width: fallbackWidth, height: fallbackHeight, rotation: 0 };
  const pyramid = useMemo(() => new PdfTilePyramid({ pageKey: documentKey, width: dimensions.width, height: dimensions.height }), [documentKey, dimensions.width, dimensions.height]);

  useEffect(() => {
    const currentGen = openGenRef.current;
    if (!metrics || error || activeOpenGenRef.current !== currentGen) return;

    let activeViewport = true;
    const logicalViewport: TileViewport = {
      ...viewport,
      x: viewport.x * dimensions.width,
      y: viewport.y * dimensions.height,
      width: viewport.width * dimensions.width,
      height: viewport.height * dimensions.height,
    };
    const pool = poolRef.current;
    const cache = cacheRef.current;
    if (!pool || !cache) return;

    const visible = pyramid.visibleTiles(logicalViewport);
    const detailTiles = pyramid.visibleDetailTiles(logicalViewport).filter((tile) => tile.density > 4);
    const protectedKeys = new Set([...visible, ...detailTiles].map((tile) => tile.key));

    setPainted((previous) => new Map([...previous].filter(([key]) => protectedKeys.has(key))));

    const cancellations = visible.map((tile) => {
      const cached = cache.get(tile.key);
      if (cached) {
        setPainted((previous) => {
          const existing = previous.get(tile.key);
          if (!existing) {
            const next = new Map(previous);
            next.set(tile.key, { tile, revision: 1 });
            return next;
          }
          if (areTileGeometriesEqual(existing.tile, tile)) {
            return previous;
          }
          const next = new Map(previous);
          next.set(tile.key, { tile, revision: existing.revision });
          return next;
        });
        return null;
      }
      const handle = pool.request({ documentKey, pageNumber: pageIndex + 1, tile });
      handle.promise.then((delivery) => {
        if (!activeViewport || openGenRef.current !== currentGen) {
          // Stale request: pool reclaims unclaimed delivery in its deferred microtask.
          return;
        }
        const bitmap = delivery.claim();
        if (!bitmap) return;
        if (cache.set(tile.key, bitmap, delivery.width * delivery.height * 4, protectedKeys)) {
          setPainted((previous) => {
            const existing = previous.get(tile.key);
            const next = new Map(previous);
            const revision = existing ? existing.revision + 1 : 1;
            next.set(tile.key, { tile, revision });
            return next;
          });
        }
      }).catch(() => undefined);
      return handle.cancel;
    });

    const detailTimer = window.setTimeout(() => {
      if (!activeViewport || openGenRef.current !== currentGen) return;
      for (const tile of detailTiles) {
        if (cache.has(tile.key)) continue;
        const handle = pool.request({ documentKey, pageNumber: pageIndex + 1, tile });
        handle.promise.then((delivery) => {
          if (!activeViewport || openGenRef.current !== currentGen) {
            // Stale request: pool reclaims unclaimed delivery in its deferred microtask.
            return;
          }
          const bitmap = delivery.claim();
          if (!bitmap) return;
          if (cache.set(tile.key, bitmap, delivery.width * delivery.height * 4, protectedKeys)) {
            setPainted((previous) => {
              const existing = previous.get(tile.key);
              const next = new Map(previous);
              const revision = existing ? existing.revision + 1 : 1;
              next.set(tile.key, { tile, revision });
              return next;
            });
          }
        }).catch(() => undefined);
        cancellations.push(handle.cancel);
      }
    }, 125);

    return () => {
      activeViewport = false;
      window.clearTimeout(detailTimer);
      cancellations.forEach((cancel) => cancel?.());
    };
  }, [metrics, viewport.x, viewport.y, viewport.width, viewport.height, viewport.zoom, viewport.dpr, error, pyramid, documentKey, pageIndex, dimensions.width, dimensions.height]);

  if (error) return <button type="button" onClick={() => setRetry((value) => value + 1)}>Retry PDF: {error}</button>;
  if (!metrics) return <div role="status">Loading original PDF…</div>;
  return <div data-testid="pdf-page-layer" style={{ position: 'relative', width: '100%', height: '100%', aspectRatio: `${metrics.width} / ${metrics.height}` }}>
    {[...painted.entries()].map(([key, { tile, revision }]) => <TileCanvas key={key} tile={tile} revision={revision} cache={cacheRef.current} pageWidth={metrics.width} pageHeight={metrics.height} />)}
  </div>;
}

function TileCanvas({ tile, revision, cache, pageWidth, pageHeight }: { tile: PdfTileRequest; revision: number; cache: TileLru | null; pageWidth: number; pageHeight: number }) {
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
  return <canvas ref={ref} aria-hidden="true" style={{ position: 'absolute', left: `${tile.x / tile.density / pageWidth * 100}%`, top: `${tile.y / tile.density / pageHeight * 100}%`, width: `${tile.width / tile.density / pageWidth * 100}%`, height: `${tile.height / tile.density / pageHeight * 100}%`, zIndex: tile.density > 4 ? 2 : 1 }} />;
}
