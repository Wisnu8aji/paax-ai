'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchPdfArtifactUrl } from '../../drawing-intelligence-api';
import { TileLru, PdfTilePyramid, type TileViewport } from './pdf-tile-pyramid';
import { createPdfTilePool, type PdfPageMetrics } from './pdf-tile-pool';

const REFRESH_SKEW_MS = 60_000;

export function shouldRefreshArtifactUrl(expiresAt: string, now = new Date()): boolean {
  return new Date(expiresAt).getTime() - now.getTime() <= REFRESH_SKEW_MS;
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
  const [metrics, setMetrics] = useState<PdfPageMetrics | null>(null);
  const [artifact, setArtifact] = useState<{ url: string; expiresAt: string } | null>(null);
  const [painted, setPainted] = useState(new Map<string, { tile: ReturnType<PdfTilePyramid['visibleTiles']>[number]; bitmap: ImageBitmap }>());
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const documentKey = `${runId}:${pageIndex}`;
  const onMetricsRef = useRef(onMetrics);
  onMetricsRef.current = onMetrics;

  useEffect(() => {
    const pool = createPdfTilePool();
    const cache = new TileLru();
    poolRef.current = pool;
    cacheRef.current = cache;
    setPainted(new Map());
    let cancelled = false;
    let refreshTimer: number | undefined;
    const open = async () => {
      setError(null);
      try {
        const next = await fetchPdfArtifactUrl(runId);
        if (cancelled) return;
        setArtifact(next);
        const verified = await pool.open({ documentKey, pageNumber: pageIndex + 1, url: next.url });
        if (cancelled) return;
        setMetrics(verified);
        onMetricsRef.current?.(verified);
        refreshTimer = window.setTimeout(() => { pool.close(documentKey); void open(); }, Math.max(0, new Date(next.expiresAt).getTime() - Date.now() - REFRESH_SKEW_MS));
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'PDF page could not be opened');
      }
    };
    void open();
    return () => {
      cancelled = true;
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      pool.close(documentKey);
      cache.dispose();
      pool.dispose();
      poolRef.current = null;
      cacheRef.current = null;
    };
  }, [runId, pageIndex, documentKey, retry]);

  const dimensions = metrics ?? { width: fallbackWidth, height: fallbackHeight, rotation: 0 };
  const pyramid = useMemo(() => new PdfTilePyramid({ pageKey: documentKey, width: dimensions.width, height: dimensions.height }), [documentKey, dimensions.width, dimensions.height]);
  useEffect(() => {
    if (!metrics || error) return;
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
        setPainted((previous) => new Map(previous).set(tile.key, { tile, bitmap: cached }));
        return null;
      }
      const handle = pool.request({ documentKey, pageNumber: pageIndex + 1, tile });
      handle.promise.then((result) => {
        if (cache.set(tile.key, result.bitmap, result.width * result.height * 4, protectedKeys)) {
          setPainted((previous) => new Map(previous).set(tile.key, { tile, bitmap: result.bitmap }));
        }
      }).catch(() => undefined);
      return handle.cancel;
    });
    const detailTimer = window.setTimeout(() => {
      for (const tile of detailTiles) {
        if (cache.has(tile.key)) continue;
        const handle = pool.request({ documentKey, pageNumber: pageIndex + 1, tile });
        handle.promise.then((result) => {
          if (cache.set(tile.key, result.bitmap, result.width * result.height * 4, protectedKeys)) {
            setPainted((previous) => new Map(previous).set(tile.key, { tile, bitmap: result.bitmap }));
          }
        }).catch(() => undefined);
        cancellations.push(handle.cancel);
      }
    }, 125);
    return () => { window.clearTimeout(detailTimer); cancellations.forEach((cancel) => cancel?.()); };
  }, [metrics, viewport.x, viewport.y, viewport.width, viewport.height, viewport.zoom, viewport.dpr, error, pyramid, documentKey, pageIndex, dimensions.width, dimensions.height]);

  if (error) return <button type="button" onClick={() => setRetry((value) => value + 1)}>Retry PDF: {error}</button>;
  if (!metrics) return <div role="status">Loading original PDF…</div>;
  return <div data-testid="pdf-page-layer" style={{ position: 'relative', width: '100%', height: '100%', aspectRatio: `${metrics.width} / ${metrics.height}` }}>
    {[...painted.entries()].map(([key, entry]) => <TileCanvas key={key} tile={entry.tile} bitmap={entry.bitmap} pageWidth={metrics.width} pageHeight={metrics.height} />)}
  </div>;
}

function TileCanvas({ tile, bitmap, pageWidth, pageHeight }: { tile: ReturnType<PdfTilePyramid['visibleTiles']>[number]; bitmap: ImageBitmap; pageWidth: number; pageHeight: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => { const canvas = ref.current; const context = canvas?.getContext('2d'); if (canvas && context) { canvas.width = bitmap.width; canvas.height = bitmap.height; context.drawImage(bitmap, 0, 0); } }, [bitmap]);
  return <canvas ref={ref} aria-hidden="true" style={{ position: 'absolute', left: `${tile.x / tile.density / pageWidth * 100}%`, top: `${tile.y / tile.density / pageHeight * 100}%`, width: `${tile.width / tile.density / pageWidth * 100}%`, height: `${tile.height / tile.density / pageHeight * 100}%`, zIndex: tile.density > 4 ? 2 : 1 }} />;
}
