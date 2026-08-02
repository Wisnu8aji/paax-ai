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
import { clippedUnionCoverage, isGenerationReady, tileLogicalRect, type LogicalRect } from './pdf-tile-coverage';
import {
  createPdfTileCompositor,
  type CompositorFrame,
  type CompositorTile,
  type PdfTileCompositor,
  type PdfTileRendererKind,
} from './pdf-tile-compositor';

export { getGlobalPdfTilePool, resetGlobalPdfTilePool };

/**
 * Absolute retirement window for a superseded candidate's compositor keys.
 * One viewport update may never postpone the deadline: the retire timer fires
 * at the captured absolute deadline, never by recursively re-arming itself.
 */
export const VIEWPORT_RETIRE_MS = 100;
/** Debounce for the settled detail pass (zoom-settle sharpening). */
export const DETAIL_PASS_MS = 125;
/**
 * Overscan margin as a fraction of the viewport size, per side. Only valid
 * because the coordinate space is now explicit (viewportSpace) — overscan is
 * a smoothness buffer, not a coordinate-space fix (P0).
 */
export const OVERSCAN_MARGIN_PCT = 0.35;

export const COVERAGE_READY_THRESHOLD = 0.99;
export const MAX_PAGE_SURFACE_BUFFER = 4096;

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

export interface PdfCoverageChangeEvent {
  documentKey: string;
  generation: number;
  ready: boolean;
  coverage: number;
  renderer: PdfTileRendererKind;
}

export interface PdfPageLayerProps {
  runId: string;
  pageIndex: number;
  viewport: NormalizedViewport;
  /**
   * Explicit coordinate-space contract for `viewport`. The legacy heuristic
   * (width<=1 && height<=1) misclassified normalized fit viewports whose width
   * and/or height exceed 1 as logical/page-space, blanking the right page edge.
   * Defaults to 'normalized' — DrawingCanvas always sends normalized fractions
   * of the base page, so old call sites keep working unchanged.
   */
  viewportSpace?: ViewportSpace;
  fallbackWidth: number;
  fallbackHeight: number;
  onMetrics?: (metrics: PdfPageMetrics) => void;
  /**
   * Bidirectional viewport-coverage signal replacing first-tile semantics.
   * `ready: false` fires at candidate start only when the committed manifest
   * covers less than 99% of the new clipped viewport (the caller keeps its
   * underlay visible); `ready: true` fires exactly once when that candidate's
   * base commit completes.
   */
  onCoverageChange?: (event: PdfCoverageChangeEvent) => void;
  /**
   * Legacy first-paint compatibility: fires exactly once per opened document
   * at the first atomic (coverage-ready) commit, so DrawingCanvas keeps hiding
   * its thumbnail underlay at the same moment as before.
   */
  onFirstPaint?: () => void;
  tilePool?: ReturnType<typeof createPdfTilePool>;
  tileCache?: TileLru;
}

interface RenderGeneration {
  id: number;
  documentKey: string;
  openGeneration: number;
  desiredVisibleTiles: PdfTileRequest[];
  desiredRequestTiles: PdfTileRequest[];
  detailTiles: PdfTileRequest[];
  desiredAllKeys: Set<string>;
  readyKeys: Set<string>;
  startedAt: number;
  retireDeadline: number;
  viewport: LogicalRect;
  page: LogicalRect;
}

interface CommittedGeneration {
  generation: number;
  documentKey: string;
  keys: Set<string>;
  rects: LogicalRect[];
}

interface RetireEntry {
  generation: number;
  keys: Set<string>;
  deadline: number;
}

interface LayerDiagnostics {
  committedGeneration: number | null;
  coverageReady: boolean;
  coverageRatio: number;
  renderer: PdfTileRendererKind | null;
  textureCount: number;
  contextLost: boolean;
}

const INITIAL_DIAGNOSTICS: LayerDiagnostics = {
  committedGeneration: null,
  coverageReady: false,
  coverageRatio: 0,
  renderer: null,
  textureCount: 0,
  contextLost: false,
};

export function PdfPageLayer({
  runId,
  pageIndex,
  viewport,
  viewportSpace = 'normalized',
  fallbackWidth,
  fallbackHeight,
  onMetrics,
  onCoverageChange,
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
  const renderGenRef = useRef(0);
  const candidateRef = useRef<RenderGeneration | null>(null);
  const committedRef = useRef<CommittedGeneration | null>(null);
  const protectedKeysRef = useRef<Set<string>>(new Set());
  const readyEmittedRef = useRef<number | null>(null);
  const notifiedFirstPaintRef = useRef<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const compositorRef = useRef<PdfTileCompositor | null>(null);
  const retireQueueRef = useRef<RetireEntry[]>([]);
  const retireTimerRef = useRef<number | null>(null);
  const revisionByKeyRef = useRef<Map<string, number>>(new Map());
  const uploadedBitmapRef = useRef<Map<string, { bitmap: ImageBitmap; revision: number }>>(new Map());
  const diagnosticsRef = useRef<LayerDiagnostics>(INITIAL_DIAGNOSTICS);

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
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [diagnostics, setDiagnostics] = useState<LayerDiagnostics>(INITIAL_DIAGNOSTICS);

  const documentKey = `${runId}:${pageIndex}`;
  const pageNumber = pageIndex + 1;

  const onMetricsRef = useRef(onMetrics);
  onMetricsRef.current = onMetrics;
  const onCoverageChangeRef = useRef(onCoverageChange);
  onCoverageChangeRef.current = onCoverageChange;
  const onFirstPaintRef = useRef(onFirstPaint);
  onFirstPaintRef.current = onFirstPaint;

  const updateDiagnostics = (next: Partial<LayerDiagnostics>) => {
    const current = diagnosticsRef.current;
    const merged: LayerDiagnostics = { ...current, ...next };
    if (
      merged.committedGeneration === current.committedGeneration &&
      merged.coverageReady === current.coverageReady &&
      merged.coverageRatio === current.coverageRatio &&
      merged.renderer === current.renderer &&
      merged.textureCount === current.textureCount &&
      merged.contextLost === current.contextLost
    ) {
      return;
    }
    diagnosticsRef.current = merged;
    setDiagnostics(merged);
  };

  const ensureCompositor = (): PdfTileCompositor | null => {
    if (!compositorRef.current && canvasRef.current) {
      compositorRef.current = createPdfTileCompositor(canvasRef.current);
    }
    return compositorRef.current;
  };

  const disposeCompositor = () => {
    if (compositorRef.current) {
      compositorRef.current.dispose();
      compositorRef.current = null;
    }
  };

  const clearRetireQueue = () => {
    if (retireTimerRef.current !== null) {
      window.clearTimeout(retireTimerRef.current);
      retireTimerRef.current = null;
    }
    retireQueueRef.current = [];
  };

  const scheduleRetirement = () => {
    if (retireTimerRef.current !== null) return;
    const fireDue = () => {
      retireTimerRef.current = null;
      const now = performance.now();
      const due = retireQueueRef.current.filter((entry) => entry.deadline <= now);
      retireQueueRef.current = retireQueueRef.current.filter((entry) => entry.deadline > now);
      for (const entry of due) {
        compositorRef.current?.release(entry.keys);
      }
    };
    const now = performance.now();
    const dueNow = retireQueueRef.current.filter((entry) => entry.deadline <= now);
    if (dueNow.length > 0) {
      fireDue();
      scheduleRetirement();
      return;
    }
    if (retireQueueRef.current.length === 0) return;
    const nextDeadline = Math.min(...retireQueueRef.current.map((entry) => entry.deadline));
    retireTimerRef.current = window.setTimeout(() => {
      fireDue();
      scheduleRetirement();
    }, Math.max(0, nextDeadline - now));
  };

  const flushRetireQueue = () => {
    for (const entry of retireQueueRef.current) {
      compositorRef.current?.release(entry.keys);
    }
    clearRetireQueue();
  };

  const nextRevisionFor = (key: string, bitmap: ImageBitmap): number => {
    const uploaded = uploadedBitmapRef.current.get(key);
    if (uploaded && uploaded.bitmap === bitmap) return uploaded.revision;
    const revision = (revisionByKeyRef.current.get(key) ?? 0) + 1;
    revisionByKeyRef.current.set(key, revision);
    uploadedBitmapRef.current.set(key, { bitmap, revision });
    return revision;
  };

  // Cleanup active requests, timers, and the compositor on unmount.
  useEffect(() => {
    const activePool = poolRef.current;
    const isExternal = isExternalPoolRef.current;
    return () => {
      activeRequestsRef.current.forEach((entry) => entry.cancel());
      activeRequestsRef.current.clear();
      clearRetireQueue();
      disposeCompositor();
      candidateRef.current = null;
      committedRef.current = null;
      protectedKeysRef.current = new Set();
      if (activePool && isExternal) {
        activePool.dispose();
      }
    };
  }, []);

  // Dispose the compositor whenever the layer leaves the rendering state
  // (document switch, error, retry) so it never outlives its canvas.
  useEffect(() => {
    if (!metrics) {
      disposeCompositor();
    }
  }, [metrics]);

  // Open Document & Fetch Metrics Lifecycle
  useEffect(() => {
    const currentGen = ++openGenRef.current;
    activeOpenGenRef.current = null;
    notifiedFirstPaintRef.current = null;
    readyEmittedRef.current = null;
    activeRequestsRef.current.forEach((entry) => entry.cancel());
    activeRequestsRef.current.clear();
    clearRetireQueue();
    disposeCompositor();
    candidateRef.current = null;
    committedRef.current = null;
    protectedKeysRef.current = new Set();
    updateDiagnostics({ committedGeneration: null, coverageReady: false, coverageRatio: 0 });

    const pool = poolRef.current ?? (tilePool || getGlobalPdfTilePool());
    const cache = cacheRef.current ?? (tileCache || getGlobalTileCache());
    poolRef.current = pool;
    cacheRef.current = cache;
    setMetrics(null);
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
      clearRetireQueue();
      disposeCompositor();
      candidateRef.current = null;
      committedRef.current = null;
      protectedKeysRef.current = new Set();
      pool.close(documentKey);
    };
  }, [runId, pageIndex, documentKey, pageNumber, retry, tilePool, tileCache]);

  const pyramid = useMemo(
    () => (metrics ? new PdfTilePyramid({ pageKey: documentKey, width: metrics.width, height: metrics.height }) : null),
    [metrics, documentKey],
  );

  // Render Visible & Detail Tiles Lifecycle — one candidate per viewport state.
  useEffect(() => {
    const currentOpenGen = openGenRef.current;
    if (!metrics || !pyramid || error || activeOpenGenRef.current !== currentOpenGen) return;

    const pool = poolRef.current ?? (tilePool || getGlobalPdfTilePool());
    const cache = cacheRef.current ?? (tileCache || getGlobalTileCache());
    poolRef.current = pool;
    cacheRef.current = cache;

    const compositor = ensureCompositor();
    if (!compositor) return;

    const logicalViewport: PdfLogicalViewport =
      viewportSpace === 'logical'
        ? (viewport as PdfLogicalViewport)
        : toLogicalViewport(viewport as NormalizedViewport, metrics);

    const viewportRect: LogicalRect = {
      x: logicalViewport.x,
      y: logicalViewport.y,
      width: logicalViewport.width,
      height: logicalViewport.height,
    };
    const pageRect: LogicalRect = { x: 0, y: 0, width: metrics.width, height: metrics.height };

    const desiredVisibleTiles = pyramid.visibleTiles(logicalViewport, 0);
    const desiredRequestTiles = pyramid.visibleTiles(logicalViewport, OVERSCAN_MARGIN_PCT);
    const detailTiles = pyramid.visibleDetailTiles(logicalViewport, OVERSCAN_MARGIN_PCT);
    const desiredAllKeys = new Set(desiredRequestTiles.map((tile) => tile.key));

    const gen = ++renderGenRef.current;

    const previousCandidate = candidateRef.current;
    if (previousCandidate && previousCandidate.id !== gen) {
      retireQueueRef.current.push({
        generation: previousCandidate.id,
        keys: new Set(previousCandidate.desiredAllKeys),
        deadline: performance.now() + VIEWPORT_RETIRE_MS,
      });
      scheduleRetirement();
    }

    const candidate: RenderGeneration = {
      id: gen,
      documentKey,
      openGeneration: currentOpenGen,
      desiredVisibleTiles,
      desiredRequestTiles,
      detailTiles,
      desiredAllKeys,
      readyKeys: new Set(),
      startedAt: performance.now(),
      retireDeadline: performance.now() + VIEWPORT_RETIRE_MS,
      viewport: viewportRect,
      page: pageRect,
    };
    candidateRef.current = candidate;

    const committed = committedRef.current;
    const committedKeys = committed && committed.documentKey === documentKey ? committed.keys : new Set<string>();
    protectedKeysRef.current = new Set([...committedKeys, ...desiredAllKeys]);

    const committedCoverage =
      committed && committed.documentKey === documentKey
        ? clippedUnionCoverage(viewportRect, pageRect, committed.rects)
        : 0;

    if (committedCoverage < COVERAGE_READY_THRESHOLD) {
      onCoverageChangeRef.current?.({
        documentKey,
        generation: gen,
        ready: false,
        coverage: committedCoverage,
        renderer: compositor.kind,
      });
    }
    const compositorDiagnostics = compositor.diagnostics();
    updateDiagnostics({
      committedGeneration: committed?.generation ?? null,
      coverageReady: committedCoverage >= COVERAGE_READY_THRESHOLD,
      coverageRatio: committedCoverage,
      renderer: compositor.kind,
      textureCount: compositorDiagnostics.textureCount,
      contextLost: compositorDiagnostics.contextLost,
    });

    for (const [key, requestEntry] of [...activeRequestsRef.current.entries()]) {
      if (!desiredAllKeys.has(key)) {
        requestEntry.cancel();
        activeRequestsRef.current.delete(key);
      }
    }

    const requestTile = (tile: PdfTileRequest) => {
      if (activeRequestsRef.current.has(tile.key)) return;

      const identity = Symbol(tile.key);
      const handle = pool.request({ documentKey, pageNumber, tile });
      activeRequestsRef.current.set(tile.key, { identity, cancel: handle.cancel });

      handle.promise
        .then((delivery: PdfTileDelivery) => {
          const entry = activeRequestsRef.current.get(tile.key);
          const current = candidateRef.current;
          if (!entry || entry.identity !== identity) return;
          if (!current || current.documentKey !== documentKey) return;
          if (openGenRef.current !== currentOpenGen || activeOpenGenRef.current !== currentOpenGen) return;
          if (!current.desiredAllKeys.has(tile.key)) return;

          const bitmap = delivery.claim();
          if (!bitmap) return;
          const bytes = delivery.width * delivery.height * 4;
          if (!cache.set(tile.key, bitmap, bytes, protectedKeysRef.current)) return;
          if (candidateRef.current !== current || !current.desiredAllKeys.has(tile.key)) return;

          current.readyKeys.add(tile.key);
          recomputeReadiness(current);
        })
        .catch(() => undefined)
        .finally(() => {
          if (activeRequestsRef.current.get(tile.key)?.identity === identity) {
            activeRequestsRef.current.delete(tile.key);
          }
        });
    };

    const recomputeReadiness = (candidateToCheck: RenderGeneration) => {
      if (candidateRef.current !== candidateToCheck) return;
      const input = {
        viewport: candidateToCheck.viewport,
        page: candidateToCheck.page,
        desiredVisibleTiles: candidateToCheck.desiredVisibleTiles,
        readyKeys: candidateToCheck.readyKeys,
      };
      if (isGenerationReady(input, COVERAGE_READY_THRESHOLD)) {
        commitCandidate(candidateToCheck);
      }
    };

    const commitCandidate = (candidateToCommit: RenderGeneration) => {
      if (candidateRef.current !== candidateToCommit) return;
      if (!compositorRef.current) return;

      const tileByKey = new Map<string, PdfTileRequest>();
      for (const tile of candidateToCommit.desiredRequestTiles) tileByKey.set(tile.key, tile);
      for (const tile of candidateToCommit.detailTiles) tileByKey.set(tile.key, tile);

      const orderedKeys: string[] = [];
      const seen = new Set<string>();
      for (const tile of candidateToCommit.desiredVisibleTiles) {
        if (!seen.has(tile.key)) {
          seen.add(tile.key);
          orderedKeys.push(tile.key);
        }
      }
      for (const tile of candidateToCommit.desiredRequestTiles) {
        if (!seen.has(tile.key)) {
          seen.add(tile.key);
          orderedKeys.push(tile.key);
        }
      }
      for (const tile of candidateToCommit.detailTiles) {
        if (!seen.has(tile.key)) {
          seen.add(tile.key);
          orderedKeys.push(tile.key);
        }
      }

      const frameTiles: CompositorTile[] = [];
      const committedKeys = new Set<string>();
      for (const key of orderedKeys) {
        if (!candidateToCommit.readyKeys.has(key)) continue;
        const bitmap = cache.peek(key);
        if (!bitmap) continue;
        const tile = tileByKey.get(key);
        if (!tile) continue;
        frameTiles.push({
          key,
          revision: nextRevisionFor(key, bitmap),
          bitmap,
          rect: tileLogicalRect(tile),
        });
        committedKeys.add(key);
      }
      if (frameTiles.length === 0) return;

      const previous = committedRef.current;
      if (previous && previous.generation === candidateToCommit.id) {
        let hasNewKeys = false;
        for (const key of committedKeys) {
          if (!previous.keys.has(key)) {
            hasNewKeys = true;
            break;
          }
        }
        if (!hasNewKeys) return;
      }

      const frame: CompositorFrame = {
        documentKey,
        generation: candidateToCommit.id,
        pageWidth: metrics.width,
        pageHeight: metrics.height,
        tiles: frameTiles,
      };
      compositorRef.current.commit(frame);

      if (previous && previous.generation !== candidateToCommit.id) {
        const retired = [...previous.keys].filter((key) => !committedKeys.has(key));
        if (retired.length > 0) compositorRef.current.release(retired);
      }

      committedRef.current = {
        generation: candidateToCommit.id,
        documentKey,
        keys: committedKeys,
        rects: frameTiles.map((tile) => tile.rect),
      };
      protectedKeysRef.current = new Set([...committedKeys, ...candidateToCommit.desiredAllKeys]);

      if (readyEmittedRef.current !== candidateToCommit.id) {
        readyEmittedRef.current = candidateToCommit.id;
        onCoverageChangeRef.current?.({
          documentKey,
          generation: candidateToCommit.id,
          ready: true,
          coverage: 1,
          renderer: compositorRef.current.kind,
        });
        if (notifiedFirstPaintRef.current !== documentKey) {
          notifiedFirstPaintRef.current = documentKey;
          onFirstPaintRef.current?.();
        }
      }

      flushRetireQueue();

      const afterCommit = compositorRef.current.diagnostics();
      updateDiagnostics({
        committedGeneration: candidateToCommit.id,
        coverageReady: true,
        coverageRatio: 1,
        renderer: afterCommit.renderer,
        textureCount: afterCommit.textureCount,
        contextLost: afterCommit.contextLost,
      });
    };

    for (const tile of desiredRequestTiles) {
      if (cache.peek(tile.key)) {
        candidate.readyKeys.add(tile.key);
      } else {
        requestTile(tile);
      }
    }

    const canvas = canvasRef.current;
    if (canvas) {
      const dpr = Number.isFinite(viewport.dpr) && viewport.dpr > 0 ? viewport.dpr : 1;
      const bufferWidth = Math.max(1, Math.min(MAX_PAGE_SURFACE_BUFFER, Math.round((canvas.clientWidth || fallbackWidth) * dpr)));
      const bufferHeight = Math.max(1, Math.min(MAX_PAGE_SURFACE_BUFFER, Math.round((canvas.clientHeight || fallbackHeight) * dpr)));
      if (canvas.width !== bufferWidth || canvas.height !== bufferHeight) {
        canvas.width = bufferWidth;
        canvas.height = bufferHeight;
      }
    }

    recomputeReadiness(candidate);

    const detailTimer = window.setTimeout(() => {
      if (openGenRef.current !== currentOpenGen || activeOpenGenRef.current !== currentOpenGen) return;
      const current = candidateRef.current;
      if (!current || current.id !== gen) return;
      for (const tile of detailTiles) {
        if (current.desiredAllKeys.has(tile.key)) continue;
        current.desiredAllKeys.add(tile.key);
        protectedKeysRef.current.add(tile.key);
        if (cache.peek(tile.key)) {
          current.readyKeys.add(tile.key);
          recomputeReadiness(current);
        } else {
          requestTile(tile);
        }
      }
    }, DETAIL_PASS_MS);

    return () => {
      window.clearTimeout(detailTimer);
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
    return <div role="status">Loading original PDF…</div>;
  }

  return (
    <div
      data-testid="pdf-page-layer"
      data-document-key={documentKey}
      data-renderer-kind={diagnostics.renderer ?? ''}
      data-committed-generation={diagnostics.committedGeneration ?? 0}
      data-coverage-ready={diagnostics.coverageReady ? 'true' : 'false'}
      data-coverage-ratio={diagnostics.coverageRatio.toFixed(3)}
      data-texture-count={diagnostics.textureCount}
      data-context-lost={diagnostics.contextLost ? 'true' : 'false'}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        aspectRatio: `${metrics.width} / ${metrics.height}`,
      }}
    >
      <canvas
        ref={canvasRef}
        data-testid="pdf-page-layer-canvas"
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          display: 'block',
        }}
      />
    </div>
  );
}
