'use client';

import { useLayoutEffect, useEffect, useMemo, useRef, useState } from 'react';
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
export const DETAIL_PASS_MS = 80;
/**
 * Overscan margin as a fraction of the viewport size, per side. Only valid
 * because the coordinate space is now explicit (viewportSpace) — overscan is
 * a smoothness buffer, not a coordinate-space fix (P0).
 */
export const OVERSCAN_MARGIN_PCT = 0.35;

export const COVERAGE_READY_THRESHOLD = 0.99;
/**
 * Maximum compositor drawing-buffer side in device px. 8192 covers an A1
 * landscape page (2482x1755 pt) at DPR 2 (~4964 px) without browser downscale,
 * and also the same page at DPR 3 (~7446 px). Weak devices fall back to 4096.
 */
export const MAX_PAGE_SURFACE_BUFFER = 8192;
/** Safe fallback for limited devices (low memory / small GPU texture budget). */
export const FALLBACK_PAGE_SURFACE_BUFFER = 4096;
/**
 * Separate LRU byte budget for settled detail tiles so the sharper detail
 * pass can never evict the interactive 0.25x-8x working set (B3). Kept below
 * the shared 96 MiB interactive budget so total GPU memory stays bounded.
 */
export const DETAIL_TILE_CACHE_BYTES = 64 * 1024 * 1024;

let detectedPageSurfaceBufferLimit: number | null = null;

/**
 * Device capability detection for the page surface buffer. Primary signal is
 * WebGL2 MAX_TEXTURE_SIZE; navigator.deviceMemory < 4GB and a failed 8192px
 * canvas allocation both select the safe 4096 fallback. Memoized because the
 * probes allocate throwaway canvases/contexts on every call.
 */
export function detectPageSurfaceBufferLimit(): number {
  if (detectedPageSurfaceBufferLimit !== null) return detectedPageSurfaceBufferLimit;
  detectedPageSurfaceBufferLimit = computePageSurfaceBufferLimit();
  return detectedPageSurfaceBufferLimit;
}

/** Test hook: drop the memoized capability result so probes re-run. */
export function resetDetectedPageSurfaceBufferLimit(): void {
  detectedPageSurfaceBufferLimit = null;
}

function computePageSurfaceBufferLimit(): number {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return FALLBACK_PAGE_SURFACE_BUFFER;
  }
  try {
    const nav = navigator as Navigator & { deviceMemory?: number };
    if (typeof nav.deviceMemory === 'number' && nav.deviceMemory > 0 && nav.deviceMemory < 4) {
      return FALLBACK_PAGE_SURFACE_BUFFER;
    }
  } catch {
    // deviceMemory is optional; keep probing.
  }
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2');
    if (gl) {
      const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number | undefined;
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      if (typeof maxTextureSize === 'number' && maxTextureSize > 0) {
        return maxTextureSize >= MAX_PAGE_SURFACE_BUFFER ? MAX_PAGE_SURFACE_BUFFER : FALLBACK_PAGE_SURFACE_BUFFER;
      }
    }
  } catch {
    // WebGL2 unavailable or context creation failed; fall through to allocation probe.
  }
  try {
    const probe = document.createElement('canvas');
    probe.width = MAX_PAGE_SURFACE_BUFFER;
    probe.height = MAX_PAGE_SURFACE_BUFFER;
    const ctx = probe.getContext('2d');
    if (ctx) return MAX_PAGE_SURFACE_BUFFER;
  } catch {
    // Allocation failed; use the safe fallback.
  }
  return FALLBACK_PAGE_SURFACE_BUFFER;
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

let globalDetailTileCacheInstance: TileLru | null = null;

/**
 * Byte-bounded LRU dedicated to settled detail tiles (separate budget, B3).
 * Keeping it distinct from the interactive cache means the high-density detail
 * pass can never evict the working set needed for pan/zoom smoothness.
 */
export function getGlobalDetailTileCache(): TileLru {
  if (!globalDetailTileCacheInstance) {
    globalDetailTileCacheInstance = new TileLru(DETAIL_TILE_CACHE_BYTES);
  }
  return globalDetailTileCacheInstance;
}

export function resetGlobalDetailTileCache(): void {
  if (globalDetailTileCacheInstance) {
    globalDetailTileCacheInstance.dispose();
    globalDetailTileCacheInstance = null;
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
  /** Separate LRU for settled detail tiles; defaults to the global detail cache. */
  detailTileCache?: TileLru;
}

interface RenderGeneration {
  id: number;
  documentKey: string;
  openGeneration: number;
  desiredVisibleTiles: PdfTileRequest[];
  desiredRequestTiles: PdfTileRequest[];
  detailTiles: PdfTileRequest[];
  /** Keys of detail tiles that are NOT part of the base/overscan working set. */
  detailKeys: Set<string>;
  desiredAllKeys: Set<string>;
  readyKeys: Set<string>;
  readyTiles: Map<string, CompositorTile>;
  startedAt: number;
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
  committedTileCount: number;
  materializedTileCount: number;
  coverageReady: boolean;
  coverageRatio: number;
  renderer: PdfTileRendererKind | null;
  textureCount: number;
  uploadFailures: number;
  contextLost: boolean;
}

const INITIAL_DIAGNOSTICS: LayerDiagnostics = {
  committedGeneration: null,
  committedTileCount: 0,
  materializedTileCount: 0,
  coverageReady: false,
  coverageRatio: 0,
  renderer: null,
  textureCount: 0,
  uploadFailures: 0,
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
  detailTileCache,
}: PdfPageLayerProps) {
  const poolRef = useRef<ReturnType<typeof createPdfTilePool> | null>(null);
  const cacheRef = useRef<TileLru | null>(null);
  const detailCacheRef = useRef<TileLru | null>(null);
  const isExternalPoolRef = useRef(false);
  const openGenRef = useRef(0);
  const activeOpenGenRef = useRef<number | null>(null);
  /**
   * Document the current `metrics` state belongs to. The render effect runs in
   * the layout phase, which is BEFORE the (passive) open effect can reset
   * `metrics` after a document switch — without this gate it would create a
   * candidate from the previous document's metrics under the new document key.
   */
  const metricsDocumentRef = useRef<string | null>(null);
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
  const contextObserverRef = useRef<{
    canvas: HTMLCanvasElement;
    lost: (event: Event) => void;
    restored: (event: Event) => void;
  } | null>(null);
  const contextRestoreFrameRef = useRef<number | null>(null);
  const contextRestoredGenRef = useRef<number | null>(null);
  /** Pending detail-pass handle (idle callback or settle timeout). */
  const detailPassHandleRef = useRef<{ kind: 'idle' | 'timeout'; handle: number } | null>(null);

  const clearDetailPass = () => {
    const pending = detailPassHandleRef.current;
    if (!pending) return;
    detailPassHandleRef.current = null;
    if (pending.kind === 'idle') {
      if (typeof cancelIdleCallback === 'function') cancelIdleCallback(pending.handle);
    } else {
      window.clearTimeout(pending.handle);
    }
  };

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

  if (detailTileCache) {
    detailCacheRef.current = detailTileCache;
  } else if (!detailCacheRef.current) {
    detailCacheRef.current = getGlobalDetailTileCache();
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
      merged.committedTileCount === current.committedTileCount &&
      merged.materializedTileCount === current.materializedTileCount &&
      merged.coverageReady === current.coverageReady &&
      merged.coverageRatio === current.coverageRatio &&
      merged.renderer === current.renderer &&
      merged.textureCount === current.textureCount &&
      merged.uploadFailures === current.uploadFailures &&
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
      if (compositorRef.current && !contextObserverRef.current) {
        const canvas = canvasRef.current;
        const lost = () => handleContextLost();
        const restored = () => handleContextRestored();
        contextObserverRef.current = { canvas, lost, restored };
        canvas.addEventListener('webglcontextlost', lost);
        canvas.addEventListener('webglcontextrestored', restored);
      }
    }
    return compositorRef.current;
  };

  const cancelPendingContextFrame = () => {
    if (contextRestoreFrameRef.current !== null) {
      const handle = contextRestoreFrameRef.current;
      contextRestoreFrameRef.current = null;
      if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(handle);
      } else {
        window.clearTimeout(handle);
      }
    }
  };

  const disposeCompositor = () => {
    cancelPendingContextFrame();
    if (compositorRef.current) {
      compositorRef.current.dispose();
      compositorRef.current = null;
    }
    const observer = contextObserverRef.current;
    if (observer) {
      observer.canvas.removeEventListener('webglcontextlost', observer.lost);
      observer.canvas.removeEventListener('webglcontextrestored', observer.restored);
      contextObserverRef.current = null;
    }
  };

  const onRestoredFrame = (compositor: PdfTileCompositor, renderer: PdfTileRendererKind) => {
    const current = candidateRef.current;
    if (!current) return;
    if (openGenRef.current !== current.openGeneration || activeOpenGenRef.current !== current.openGeneration) return;
    const diag = compositor.diagnostics();
    const committed = committedRef.current;
    const covered =
      committed && committed.documentKey === current.documentKey
        ? clippedUnionCoverage(current.viewport, current.page, committed.rects)
        : 0;
    const materializedReady =
      diag.committedTileCount > 0 && diag.materializedTileCount >= diag.committedTileCount;
    const coveredReady = !diag.contextLost && materializedReady && covered >= COVERAGE_READY_THRESHOLD;
    updateDiagnostics({
      contextLost: diag.contextLost,
      renderer: diag.renderer,
      coverageReady: coveredReady,
      coverageRatio: covered,
      committedTileCount: diag.committedTileCount,
      materializedTileCount: diag.materializedTileCount,
      textureCount: diag.textureCount,
      uploadFailures: diag.uploadFailures,
    });
    if (
      committed &&
      committed.documentKey === current.documentKey &&
      coveredReady &&
      contextRestoredGenRef.current !== committed.generation
    ) {
      contextRestoredGenRef.current = committed.generation;
      onCoverageChangeRef.current?.({
        documentKey: committed.documentKey,
        generation: committed.generation,
        ready: true,
        coverage: covered,
        renderer: diag.renderer,
      });
    }
  };

  const handleContextLost = () => {
    const compositor = compositorRef.current;
    const current = candidateRef.current;
    if (!compositor || !current) return;
    if (openGenRef.current !== current.openGeneration || activeOpenGenRef.current !== current.openGeneration) return;
    const diag = compositor.diagnostics();
    if (diag.renderer === 'canvas2d') {
      // Repeated loss: the compositor already swapped to Canvas2D and
      // re-committed the stored manifest synchronously, so the fallback
      // frame boundary has passed.
      onRestoredFrame(compositor, diag.renderer);
      return;
    }
    if (!diag.contextLost) return;
    contextRestoredGenRef.current = null;
    updateDiagnostics({
      contextLost: true,
      renderer: diag.renderer,
      coverageReady: false,
      coverageRatio: 0,
      committedTileCount: diag.committedTileCount,
      materializedTileCount: diag.materializedTileCount,
      textureCount: diag.textureCount,
      uploadFailures: diag.uploadFailures,
    });
    // Report the committed generation, or 0 when nothing is committed yet —
    // never the current candidate id, which is not a committed generation
    // (Task 3 deferred minor).
    onCoverageChangeRef.current?.({
      documentKey: current.documentKey,
      generation: committedRef.current?.generation ?? 0,
      ready: false,
      coverage: 0,
      renderer: diag.renderer,
    });
  };

  const handleContextRestored = () => {
    const compositor = compositorRef.current;
    if (!compositor) return;
    if (contextRestoreFrameRef.current !== null) return;
    const defer =
      typeof requestAnimationFrame === 'function'
        ? (callback: () => void) => requestAnimationFrame(callback)
        : (callback: () => void) => window.setTimeout(callback, 0);
    const handle = defer(() => {
      contextRestoreFrameRef.current = null;
      if (compositorRef.current !== compositor) return;
      onRestoredFrame(compositor, compositor.diagnostics().renderer);
    });
    contextRestoreFrameRef.current = handle as number;
  };

  const clearRetireQueue = () => {
    if (retireTimerRef.current !== null) {
      window.clearTimeout(retireTimerRef.current);
      retireTimerRef.current = null;
    }
    retireQueueRef.current = [];
  };

  const releaseRetireEntry = (entry: RetireEntry) => {
    const currentKeys = candidateRef.current?.desiredAllKeys;
    const keys = [...entry.keys].filter((key) => !currentKeys?.has(key));
    if (keys.length > 0) {
      compositorRef.current?.release(keys);
    }
  };

  const scheduleRetirement = () => {
    if (retireTimerRef.current !== null) return;
    const fireDue = () => {
      retireTimerRef.current = null;
      const now = performance.now();
      const due = retireQueueRef.current.filter((entry) => entry.deadline <= now);
      retireQueueRef.current = retireQueueRef.current.filter((entry) => entry.deadline > now);
      for (const entry of due) {
        releaseRetireEntry(entry);
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
      releaseRetireEntry(entry);
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
      clearDetailPass();
      activeRequestsRef.current.forEach((entry) => entry.cancel());
      activeRequestsRef.current.clear();
      clearRetireQueue();
      disposeCompositor();
      candidateRef.current = null;
      committedRef.current = null;
      protectedKeysRef.current = new Set();
      revisionByKeyRef.current.clear();
      uploadedBitmapRef.current.clear();
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
    contextRestoredGenRef.current = null;
    activeRequestsRef.current.forEach((entry) => entry.cancel());
    activeRequestsRef.current.clear();
    clearRetireQueue();
    disposeCompositor();
    candidateRef.current = null;
    committedRef.current = null;
    protectedKeysRef.current = new Set();
    revisionByKeyRef.current.clear();
    uploadedBitmapRef.current.clear();
    updateDiagnostics({
      committedGeneration: null,
      committedTileCount: 0,
      materializedTileCount: 0,
      coverageReady: false,
      coverageRatio: 0,
      textureCount: 0,
      uploadFailures: 0,
    });

    const pool = poolRef.current ?? (tilePool || getGlobalPdfTilePool());
    const cache = cacheRef.current ?? (tileCache || getGlobalTileCache());
    poolRef.current = pool;
    cacheRef.current = cache;
    metricsDocumentRef.current = null;
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
        metricsDocumentRef.current = documentKey;
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
      clearDetailPass();
      activeRequestsRef.current.forEach((entry) => entry.cancel());
      activeRequestsRef.current.clear();
      clearRetireQueue();
      disposeCompositor();
      candidateRef.current = null;
      committedRef.current = null;
      protectedKeysRef.current = new Set();
      revisionByKeyRef.current.clear();
      uploadedBitmapRef.current.clear();
      pool.close(documentKey);
    };
  }, [runId, pageIndex, documentKey, pageNumber, retry, tilePool, tileCache, detailTileCache]);

  const pyramid = useMemo(
    () => (metrics ? new PdfTilePyramid({ pageKey: documentKey, width: metrics.width, height: metrics.height }) : null),
    [metrics, documentKey],
  );

  // Render Visible & Detail Tiles Lifecycle — one candidate per viewport state.
  // Runs in the layout phase so coverage signals (`ready:false` reveal,
  // `ready:true` hide) land before the browser paints the next frame: a
  // viewport change that exposes an uncovered area must never produce even one
  // painted frame with the underlay still hidden.
  useLayoutEffect(() => {
    const currentOpenGen = openGenRef.current;
    if (!metrics || metricsDocumentRef.current !== documentKey || !pyramid || error || activeOpenGenRef.current !== currentOpenGen) return;

    const pool = poolRef.current ?? (tilePool || getGlobalPdfTilePool());
    const cache = cacheRef.current ?? (tileCache || getGlobalTileCache());
    const detailCache = detailCacheRef.current ?? (detailTileCache || getGlobalDetailTileCache());
    poolRef.current = pool;
    cacheRef.current = cache;
    detailCacheRef.current = detailCache;

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
    // Detail tiles that are NOT already part of the base/overscan working set.
    // These are the tiles the proactive/settled detail pass adds and caches in
    // the separate detail LRU (B3); keys shared with the base set stay in the
    // interactive cache so a single key is never split across two LRUs.
    const detailKeys = new Set(detailTiles.filter((tile) => !desiredAllKeys.has(tile.key)).map((tile) => tile.key));

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
      detailKeys,
      desiredAllKeys,
      readyKeys: new Set(),
      readyTiles: new Map(),
      startedAt: performance.now(),
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

    const compositorDiagnostics = compositor.diagnostics();
    const committedMaterialized =
      compositorDiagnostics.committedTileCount > 0 &&
      compositorDiagnostics.materializedTileCount >= compositorDiagnostics.committedTileCount;
    const committedReady =
      !compositorDiagnostics.contextLost &&
      committedMaterialized &&
      committedCoverage >= COVERAGE_READY_THRESHOLD;

    if (!committedReady) {
      onCoverageChangeRef.current?.({
        documentKey,
        generation: gen,
        ready: false,
        coverage: committedCoverage,
        renderer: compositor.kind,
      });
    }
    updateDiagnostics({
      committedGeneration: committed?.generation ?? null,
      committedTileCount: compositorDiagnostics.committedTileCount,
      materializedTileCount: compositorDiagnostics.materializedTileCount,
      coverageReady: committedReady,
      coverageRatio: committedCoverage,
      renderer: compositor.kind,
      textureCount: compositorDiagnostics.textureCount,
      uploadFailures: compositorDiagnostics.uploadFailures,
      contextLost: compositorDiagnostics.contextLost,
    });

    for (const [key, requestEntry] of [...activeRequestsRef.current.entries()]) {
      if (!desiredAllKeys.has(key)) {
        requestEntry.cancel();
        activeRequestsRef.current.delete(key);
      }
    }

    const registerReadyTile = (candidateToUpdate: RenderGeneration, tile: PdfTileRequest) => {
      if (candidateRef.current !== candidateToUpdate) return;
      if (candidateToUpdate.readyKeys.has(tile.key)) return;
      const sourceCache = candidateToUpdate.detailKeys.has(tile.key) ? detailCache : cache;
      const bitmap = sourceCache.peek(tile.key);
      if (!bitmap) return;
      const revision = nextRevisionFor(tile.key, bitmap);
      const descriptor: CompositorTile = {
        key: tile.key,
        revision,
        bitmap,
        rect: tileLogicalRect(tile),
      };
      candidateToUpdate.readyKeys.add(tile.key);
      candidateToUpdate.readyTiles.set(tile.key, descriptor);
      compositorRef.current?.upload(descriptor);
    };

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
          const targetCache = current.detailKeys.has(tile.key) ? detailCache : cache;
          if (!targetCache.set(tile.key, bitmap, bytes, protectedKeysRef.current)) return;
          if (candidateRef.current !== current || !current.desiredAllKeys.has(tile.key)) return;

          registerReadyTile(current, tile);
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

    // B3 proactive detail pass: run the sharper detail tiles for a candidate.
    // Reused by both the settle timer (80ms after a viewport change) and the
    // proactive first-paint trigger (requestIdleCallback, so the sharper
    // overview/fit view never waits for a full settle window).
    const runDetailPass = (targetGen: number) => {
      detailPassHandleRef.current = null;
      if (openGenRef.current !== currentOpenGen || activeOpenGenRef.current !== currentOpenGen) return;
      const current = candidateRef.current;
      if (!current || current.id !== targetGen) return;
      for (const tile of current.detailTiles) {
        if (current.desiredAllKeys.has(tile.key)) continue;
        current.desiredAllKeys.add(tile.key);
        protectedKeysRef.current.add(tile.key);
        const sourceCache = current.detailKeys.has(tile.key) ? detailCache : cache;
        if (sourceCache.peek(tile.key)) {
          registerReadyTile(current, tile);
          recomputeReadiness(current);
        } else {
          requestTile(tile);
        }
      }
    };

    const scheduleDetailPass = (targetGen: number, proactive: boolean) => {
      clearDetailPass();
      const fire = () => runDetailPass(targetGen);
      if (proactive && typeof requestIdleCallback === 'function') {
        // Fire as soon as the browser is idle (bounded by the settle timeout).
        const handle = requestIdleCallback(fire, { timeout: DETAIL_PASS_MS }) as unknown as number;
        detailPassHandleRef.current = { kind: 'idle', handle };
      } else {
        const handle = window.setTimeout(fire, proactive ? 0 : DETAIL_PASS_MS);
        detailPassHandleRef.current = { kind: 'timeout', handle };
      }
    };

    const commitCandidate = (candidateToCommit: RenderGeneration) => {
      if (candidateRef.current !== candidateToCommit) return;
      if (!compositorRef.current) return;

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
        const descriptor = candidateToCommit.readyTiles.get(key);
        if (!descriptor) continue;
        frameTiles.push(descriptor);
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

      // Exact clipped-union coverage of the committed rects over the candidate
      // viewport — reported instead of a hardcoded `1` (Task 3 deferred minor).
      const exactCoverage = clippedUnionCoverage(
        candidateToCommit.viewport,
        candidateToCommit.page,
        frameTiles.map((tile) => tile.rect),
      );
      const afterCommit = compositorRef.current.diagnostics();

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

      const materializedReady =
        afterCommit.committedTileCount === frameTiles.length &&
        afterCommit.materializedTileCount >= frameTiles.length;
      const coverageReady =
        !afterCommit.contextLost && materializedReady && exactCoverage >= COVERAGE_READY_THRESHOLD;
      if (readyEmittedRef.current !== candidateToCommit.id && coverageReady) {
        readyEmittedRef.current = candidateToCommit.id;
        onCoverageChangeRef.current?.({
          documentKey,
          generation: candidateToCommit.id,
          ready: true,
          coverage: exactCoverage,
          renderer: afterCommit.renderer,
        });
        if (notifiedFirstPaintRef.current !== documentKey) {
          notifiedFirstPaintRef.current = documentKey;
          onFirstPaintRef.current?.();
          // B3 proactive detail pass: start sharpening the settled crop as soon
          // as the first atomic commit lands instead of waiting for the full
          // settle window. `requestIdleCallback` keeps it off the critical path.
          scheduleDetailPass(candidateToCommit.id, true);
        }
      } else if (!coverageReady) {
        onCoverageChangeRef.current?.({
          documentKey,
          generation: candidateToCommit.id,
          ready: false,
          coverage: exactCoverage,
          renderer: afterCommit.renderer,
        });
      }

      flushRetireQueue();

      // Report the exact clipped-union coverage of the committed manifest, not
      // a hardcoded 1, and never claim coverage-ready while the context is
      // lost: a lost compositor cannot draw, so the underlay must stay visible
      // until a successful restore re-emits ready:true (Task 3 deferred minor).
      updateDiagnostics({
        committedGeneration: candidateToCommit.id,
        committedTileCount: afterCommit.committedTileCount,
        materializedTileCount: afterCommit.materializedTileCount,
        coverageReady,
        coverageRatio: exactCoverage,
        renderer: afterCommit.renderer,
        textureCount: afterCommit.textureCount,
        uploadFailures: afterCommit.uploadFailures,
        contextLost: afterCommit.contextLost,
      });
    };

    for (const tile of desiredRequestTiles) {
      if (cache.peek(tile.key)) {
        registerReadyTile(candidate, tile);
      } else {
        requestTile(tile);
      }
    }

    const canvas = canvasRef.current;
    if (canvas) {
      const dpr = Number.isFinite(viewport.dpr) && viewport.dpr > 0 ? viewport.dpr : 1;
      // B1: device-capability detection selects 8192 on capable devices and
      // falls back to 4096 for weak devices (low deviceMemory / small WebGL2
      // texture budget / failed 8192px allocation).
      const bufferLimit = detectPageSurfaceBufferLimit();
      const bufferWidth = Math.max(1, Math.min(bufferLimit, Math.round((canvas.clientWidth || fallbackWidth) * dpr)));
      const bufferHeight = Math.max(1, Math.min(bufferLimit, Math.round((canvas.clientHeight || fallbackHeight) * dpr)));
      if (canvas.width !== bufferWidth || canvas.height !== bufferHeight) {
        canvas.width = bufferWidth;
        canvas.height = bufferHeight;
      }
    }

    recomputeReadiness(candidate);

    // B3 settle path: the detail pass still fires 80ms after a viewport change
    // (fallback for interactive pan/zoom), complementing the proactive
    // first-paint trigger inside commitCandidate.
    scheduleDetailPass(gen, false);

    return () => {
      clearDetailPass();
    };
  }, [metrics, viewport, error, pyramid, documentKey, pageNumber, tilePool, tileCache, detailTileCache, viewportSpace]);

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
      data-committed-tile-count={diagnostics.committedTileCount}
      data-materialized-tile-count={diagnostics.materializedTileCount}
      data-coverage-ready={diagnostics.coverageReady ? 'true' : 'false'}
      data-coverage-ratio={diagnostics.coverageRatio.toFixed(3)}
      data-texture-count={diagnostics.textureCount}
      data-upload-failures={diagnostics.uploadFailures}
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
