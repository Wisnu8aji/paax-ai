'use client';

/**
 * DrawingCanvas — viewer CAD-like (blueprint §14.2).
 *
 * Interaksi: wheel = zoom terpusat kursor · middle-drag / space+drag /
 * tool pan = pan · dblclick = fit · Ctrl+0 fit · Ctrl+1 100% · +/- zoom ·
 * Esc bersihkan seleksi. Responsif diprioritaskan di atas animasi (§23).
 */

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import { useWorkspace, useActiveSheet, useSelectedElement } from '../workspace-store';
import { SheetPlanSvg, PLAN_MARGIN } from './sheet-plan-svg';
import { CanvasToolbar } from './canvas-toolbar';
import { ZoomBar } from './zoom-bar';
import { Minimap } from './minimap';
import { SelectionContextBar } from './selection-context-bar';
import { RealPageSvg } from './real-page-svg';
import { PdfPageLayer } from './pdf-page-layer';
import type { PdfCoverageChangeEvent } from './pdf-page-layer';
import type { PdfPageMetrics } from './pdf-tile-pool';
import {
  documentKeyFor,
  nextCoverageState,
  shouldApplyFit,
  type CoverageState,
  type FitRecord,
} from './drawing-canvas-fit';
import type { InteractiveMeasurementCandidate } from '../../drawing-intelligence-api';

/** lebar dasar render SVG pada zoom=1 (px) — 100% ≈ lebar A1 landscape wajar */
const BASE_WIDTH_PX = 1400;
const MIN_ZOOM = 0.08;
const MAX_ZOOM = 8;
/**
 * Live-pan viewport sync cadence. The visual pan runs on a CSS transform every
 * rAF (imperative, no React render); the tile layer only needs to follow the
 * viewport ~10x/s so tiles ahead of the drag can be requested without re-
 * rendering the whole canvas subtree on every animation frame (P2).
 */
const LIVE_VIEWPORT_SYNC_MS = 100;
/**
 * Wheel-settle window for temporary `will-change: transform` promotion. One
 * bounded timer only: repeated wheel events reset its deadline; pointer-up,
 * pointer-cancel, sheet switch, and unmount clear it immediately. 150 ms sits
 * just above the layer's 125 ms detail pass and the 100 ms viewport sync, so
 * the promotion survives the sharpening pass and is released right after.
 */
export const WHEEL_SETTLE_MS = 150;

const MemoCanvasToolbar = memo(CanvasToolbar);
const MemoZoomBar = memo(ZoomBar);
const MemoMinimap = memo(Minimap);
const MemoSelectionContextBar = memo(SelectionContextBar);
const MemoRealPageSvg = memo(RealPageSvg);
const MemoSheetPlanSvg = memo(SheetPlanSvg);

export function DrawingCanvas() {
  const { state, dispatch } = useWorkspace();
  const sheet = useActiveSheet();
  const selectedElement = useSelectedElement();
  const mappedSheet = state.mappedSheets.find((candidate) => candidate.id === state.activeSheetId) ?? null;
  const realImageUrl = mappedSheet?.imageUrl ?? null;
  const toolRunId = sheet?.runId ?? mappedSheet?.runId ?? null;
  const toolPageIndex = sheet?.pageIndex ?? mappedSheet?.pageIndex ?? null;
  const [pdfMetrics, setPdfMetrics] = useState<{ width: number; height: number } | null>(null);
  /**
   * Key of the document the current `pdfMetrics` belongs to. The metrics-fit
   * effect is gated by it so a stale state value from the previous sheet can
   * never drive a fit for the newly active document (Task 4 invariant 1/2).
   */
  const pdfMetricsKeyRef = useRef<string | null>(null);
  /**
   * Metrics cache keyed by `documentKey` (`runId:pageIndex`, P3): switching
   * sheets must not reset metrics and trigger a second fit jump once a sheet
   * was already opened.
   */
  const metricsCacheRef = useRef(new Map<string, { width: number; height: number }>());
  const activeDocumentKey = useMemo(
    () => (toolRunId !== null && toolPageIndex !== null ? documentKeyFor(toolRunId, toolPageIndex) : null),
    [toolRunId, toolPageIndex],
  );
  /**
   * Latest active document key, readable from any async callback. Mirrored
   * during render (same pattern as PdfPageLayer's callback refs) so a stale
   * callback is recognized instantly, not one commit later.
   */
  const activeKeyRef = useRef<string | null>(activeDocumentKey);
  activeKeyRef.current = activeDocumentKey;
  /**
   * One stable metrics handler per document key, created once per key.
   * Callback identity is a pure function of the document key, never of mutable
   * current state, so a re-render cannot retarget an in-flight old-document
   * callback at the new document (Task 4 invariant 3).
   */
  const metricsHandlerByKeyRef = useRef(new Map<string, (metrics: PdfPageMetrics) => void>());
  const metricsHandlerFor = (key: string): ((metrics: PdfPageMetrics) => void) => {
    let handler = metricsHandlerByKeyRef.current.get(key);
    if (!handler) {
      handler = (metrics) => {
        metricsCacheRef.current.set(key, { width: metrics.width, height: metrics.height });
        if (key === activeKeyRef.current) {
          pdfMetricsKeyRef.current = key;
          setPdfMetrics({ width: metrics.width, height: metrics.height });
        }
      };
      metricsHandlerByKeyRef.current.set(key, handler);
    }
    return handler;
  };
  /**
   * Coverage readiness keyed by the active document and the monotonically
   * accepted generation (Task 4 invariant 4): `ready:false` reveals the
   * matching underlay before a viewport transition exposes a hole; matching or
   * newer `ready:true` hides it. Wrong-document and older-generation events
   * are ignored by `nextCoverageState`.
   */
  const [coverage, setCoverage] = useState<CoverageState | null>(null);
  const handleCoverageChange = useCallback((event: PdfCoverageChangeEvent) => {
    setCoverage((previous) => nextCoverageState(previous, event));
  }, []);
  /**
   * Temporary `will-change: transform` promotion for the single page surface.
   * Enabled only while dragging and during the wheel-settle window, so the
   * browser GPU compositor is not asked to keep a permanent layer. No state
   * updates happen per animation frame — only on drag start/end and settle.
   */
  const [transformPromoted, setTransformPromoted] = useState(false);
  const settleTimerRef = useRef<number | null>(null);
  const armSettleTimer = useCallback(() => {
    if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = window.setTimeout(() => {
      settleTimerRef.current = null;
      setTransformPromoted(false);
    }, WHEEL_SETTLE_MS);
  }, []);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pageTransformRef = useRef<HTMLDivElement | null>(null);
  const pendingPanRef = useRef<{ panX: number; panY: number } | null>(null);
  const panFrameRef = useRef<number | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [toolBusy, setToolBusy] = useState(false);
  const [toolResult, setToolResult] = useState<InteractiveMeasurementCandidate | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number; button: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  /** User zoom/pan since the current document became active (design §8). */
  const userAdjustedRef = useRef(false);

  const { zoom, panX, panY, tool } = state.canvas;

  const computeAspect = useCallback((): number => {
    if (pdfMetrics) return pdfMetrics.height / pdfMetrics.width;
    if (mappedSheet?.widthPx && mappedSheet.heightPx) return mappedSheet.heightPx / mappedSheet.widthPx;
    if (sheet) {
      return (sheet.geometry.heightMm + (PLAN_MARGIN + 1900) * 2) / (sheet.geometry.widthMm + (PLAN_MARGIN + 1900) * 2);
    }
    return 1;
  }, [pdfMetrics, mappedSheet, sheet]);
  const aspect = computeAspect();
  const baseW = BASE_WIDTH_PX;
  const baseH = BASE_WIDTH_PX * aspect;

  const setCanvas = useCallback(
    (patch: Partial<typeof state.canvas>) => dispatch({ type: 'canvas', patch }),
    [dispatch, state.canvas],
  );

  /**
   * Provisional aspect from thumbnail dimensions or sheet geometry only —
   * never from `pdfMetrics`, which may still belong to the previous sheet
   * during a switch (Task 4 invariant 1).
   */
  const fallbackSheetAspect = useCallback((): number => {
    if (mappedSheet?.widthPx && mappedSheet.heightPx) return mappedSheet.heightPx / mappedSheet.widthPx;
    if (sheet) {
      return (sheet.geometry.heightMm + (PLAN_MARGIN + 1900) * 2) / (sheet.geometry.widthMm + (PLAN_MARGIN + 1900) * 2);
    }
    return 1;
  }, [mappedSheet, sheet]);

  /**
   * Record of the exact aspect/source last applied by `fitSheetForRecord`
   * (design §8): later decisions compare against it, never against
   * `baseH/baseW` recomputed from the newly received metrics.
   */
  const fitRecordRef = useRef<FitRecord | null>(null);

  /**
   * Fit sheet ke container dengan padding untuk record aspek eksplisit, lalu
   * catat persis aspek yang dipakai.
   */
  const fitSheetForRecord = useCallback(
    (record: FitRecord) => {
      const el = containerRef.current;
      if (!el) return;
      userAdjustedRef.current = false;
      const fitW = BASE_WIDTH_PX;
      const fitH = BASE_WIDTH_PX * record.aspect;
      const pad = 48;
      const zw = (el.clientWidth - pad * 2) / fitW;
      const zh = (el.clientHeight - pad * 2) / fitH;
      const z = Math.max(MIN_ZOOM, Math.min(zw, zh));
      setCanvas({
        zoom: z,
        panX: (el.clientWidth - fitW * z) / 2,
        panY: (el.clientHeight - fitH * z) / 2,
      });
      fitRecordRef.current = record;
    },
    [setCanvas],
  );

  /**
   * Manual/structural fit (resize, dblclick, Ctrl+0, toolbar): re-fit against
   * the last applied aspect, or the current state aspect before any record.
   * A record belonging to a different document key is never reused.
   */
  const fitSheet = useCallback(() => {
    const record: FitRecord =
      fitRecordRef.current && fitRecordRef.current.documentKey === activeDocumentKey
        ? fitRecordRef.current
        : {
            documentKey: activeDocumentKey ?? '',
            aspect: computeAspect(),
            source: pdfMetrics ? 'pdf-metrics' : 'sheet-dimensions',
          };
    fitSheetForRecord(record);
  }, [fitSheetForRecord, activeDocumentKey, computeAspect, pdfMetrics]);

  const zoomTo = useCallback(
    (nextZoom: number, cx?: number, cy?: number) => {
      const el = containerRef.current;
      if (!el) return;
      userAdjustedRef.current = true;
      const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom));
      const rect = el.getBoundingClientRect();
      const px = cx ?? rect.width / 2;
      const py = cy ?? rect.height / 2;
      // pertahankan titik (px,py) tetap di tempat saat skala berubah
      const wx = (px - panX) / zoom;
      const wy = (py - panY) / zoom;
      setCanvas({ zoom: z, panX: px - wx * z, panY: py - wy * z });
    },
    [zoom, panX, panY, setCanvas],
  );

  // Fit pertama kali & saat ganti sheet; refit saat container berubah ukuran
  // selama user belum mengatur zoom manual. Semua keputusan keyed ke satu
  // document key aktif; callback lama tidak bisa menjadi fallback sheet baru.
  useEffect(() => {
    userAdjustedRef.current = false;
    // Bersihkan state drag/wheel yang masih berjalan (invariant 6/7).
    if (panFrameRef.current !== null) cancelAnimationFrame(panFrameRef.current);
    panFrameRef.current = null;
    pendingPanRef.current = null;
    dragRef.current = null;
    setDragging(false);
    lastViewportSyncRef.current = 0;
    setLivePan(null);
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    setTransformPromoted(false);
    const key = activeDocumentKey;
    if (!key) return;
    // P3: reuse cached PDF metrics for this run/page instead of dropping to the
    // thumbnail-aspect fallback, so revisiting a sheet does not refit twice.
    const cached = metricsCacheRef.current.get(key) ?? null;
    pdfMetricsKeyRef.current = key;
    setPdfMetrics(cached);
    // Reveal the matching underlay immediately; the layer's first `ready:false`
    // candidate keeps it visible until an atomic commit hides it.
    setCoverage({ documentKey: key, generation: 0, ready: false });
    const record: FitRecord = cached
      ? { documentKey: key, aspect: cached.height / cached.width, source: 'pdf-cache' }
      : { documentKey: key, aspect: fallbackSheetAspect(), source: 'sheet-dimensions' };
    if (shouldApplyFit(fitRecordRef.current, record)) {
      fitSheetForRecord(record);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activeSheetId]);

  // Exact metrics untuk dokumen aktif boleh memicu paling banyak satu fit
  // korektif, dan hanya kalau user belum zoom/pan manual sejak dokumen ini
  // aktif. Dijaga oleh key tempat `pdfMetrics` berasal, jadi nilai state basi
  // dari sheet sebelumnya tidak pernah menggerakkan fit dokumen baru (§8).
  useEffect(() => {
    if (!pdfMetrics || !activeDocumentKey) return;
    if (pdfMetricsKeyRef.current !== activeDocumentKey) return;
    const next: FitRecord = {
      documentKey: activeDocumentKey,
      aspect: pdfMetrics.height / pdfMetrics.width,
      source: 'pdf-metrics',
    };
    if (!userAdjustedRef.current && shouldApplyFit(fitRecordRef.current, next)) {
      fitSheetForRecord(next);
    }
  }, [pdfMetrics, activeDocumentKey, fitSheetForRecord]);

  useEffect(
    () => () => {
      if (panFrameRef.current !== null) cancelAnimationFrame(panFrameRef.current);
      if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (!userAdjustedRef.current) fitSheet();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitSheet]);

  // Keyboard shortcuts (§14.2)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (e.code === 'Space') {
        setSpaceDown(true);
        e.preventDefault();
        return;
      }
      if (e.key === 'Escape') {
        dispatch({ type: 'select-element', elementId: null });
        setCanvas({ tool: 'select' });
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        fitSheet();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '1') {
        e.preventDefault();
        zoomTo(1);
        return;
      }
      if (e.key === '+' || e.key === '=') zoomTo(zoom * 1.2);
      if (e.key === '-') zoomTo(zoom / 1.2);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceDown(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [dispatch, fitSheet, zoomTo, zoom, setCanvas]);

  const onWheel = useCallback(
    (e: ReactWheelEvent) => {
      const el = containerRef.current;
      if (!el) return;
      userAdjustedRef.current = true;
      // Wheel settles as a burst: promote the GPU layer for the settle window
      // and let repeated wheels reset the deadline (invariant 6).
      setTransformPromoted(true);
      armSettleTimer();
      const rect = el.getBoundingClientRect();
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      zoomTo(zoom * factor, e.clientX - rect.left, e.clientY - rect.top);
    },
    [zoom, zoomTo, armSettleTimer],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button === 0 && (tool === 'measure' || tool === 'takeoff')) {
        e.preventDefault();
        const el = containerRef.current;
        if (!el || !toolRunId || toolPageIndex === null) {
          dispatch({ type: 'set-status', message: 'This sheet is not linked to a persisted DEM run.' });
          return;
        }
        const rect = el.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (e.clientX - rect.left - panX) / zoom / baseW));
        const y = Math.max(0, Math.min(1, (e.clientY - rect.top - panY) / zoom / baseH));
        setToolBusy(true);
        setToolResult(null);
        const action = tool === 'takeoff' ? 'One-Click Area' : 'One-Click Line';
        dispatch({ type: 'set-status', message: `${action} is analyzing local vector geometry…` });
        import('../../drawing-intelligence-api')
          .then(({ runOneClickArea, runOneClickLine }) => (
            tool === 'takeoff'
              ? runOneClickArea(toolRunId, toolPageIndex, [[x, y]])
              : runOneClickLine(toolRunId, toolPageIndex, [x, y])
          ))
          .then((result) => {
            setToolResult(result);
            dispatch({
              type: 'set-status',
              message: `${action} created a review candidate; scale/approval is still required for final quantity.`,
            });
          })
          .catch((error) => {
            dispatch({ type: 'set-status', message: error instanceof Error ? error.message : `${action} failed.` });
          })
          .finally(() => setToolBusy(false));
        return;
      }

      const isPan = e.button === 1 || spaceDown || tool === 'pan';
      if (!isPan) return;
      e.preventDefault();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      dragRef.current = { startX: e.clientX, startY: e.clientY, panX, panY, button: e.button };
      setDragging(true);
      setTransformPromoted(true);
    },
    [spaceDown, tool, panX, panY, zoom, baseW, baseH, toolRunId, toolPageIndex, dispatch],
  );

  const [livePan, setLivePan] = useState<{ panX: number; panY: number } | null>(null);
  const lastViewportSyncRef = useRef(0);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const next = { panX: d.panX + (e.clientX - d.startX), panY: d.panY + (e.clientY - d.startY) };
      pendingPanRef.current = next;
      if (panFrameRef.current === null) {
        panFrameRef.current = requestAnimationFrame(() => {
          panFrameRef.current = null;
          const pending = pendingPanRef.current;
          if (pending) {
            // Visual pan is imperative (CSS transform, no React render per frame).
            if (pageTransformRef.current) {
              pageTransformRef.current.style.transform = `translate3d(${pending.panX}px, ${pending.panY}px, 0) scale(${zoom})`;
            }
            // The tile layer follows at ~10 Hz so tiles ahead of the drag are
            // prefetched without re-rendering the canvas subtree every frame.
            const now = performance.now();
            if (now - lastViewportSyncRef.current >= LIVE_VIEWPORT_SYNC_MS) {
              lastViewportSyncRef.current = now;
              setLivePan(pending);
            }
          }
        });
      }
    },
    [zoom],
  );

  // Pointer-up convergence: flush the latest pending pan into committed state
  // even if the RAF never fired, cancel the frame, clear the temporary GPU
  // promotion and the live-pan sync so the declarative transform (committed
  // panX/panY/zoom) and the DOM transform agree in the same event batch.
  const onPointerUp = useCallback(() => {
    if (panFrameRef.current !== null) cancelAnimationFrame(panFrameRef.current);
    panFrameRef.current = null;
    if (pendingPanRef.current) setCanvas(pendingPanRef.current);
    pendingPanRef.current = null;
    dragRef.current = null;
    lastViewportSyncRef.current = 0;
    setLivePan(null);
    setDragging(false);
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    setTransformPromoted(false);
  }, [setCanvas]);

  const curPanX = livePan ? livePan.panX : panX;
  const curPanY = livePan ? livePan.panY : panY;

  const viewport = useMemo(() => {
    const el = containerRef.current;
    if (!el) return null;
    return {
      x: -curPanX / zoom / baseW,
      y: -curPanY / zoom / baseH,
      w: el.clientWidth / zoom / baseW,
      h: el.clientHeight / zoom / baseH,
    };
  }, [curPanX, curPanY, zoom, baseW, baseH]);

  // Stable callbacks/arrays so memoized SVG children skip re-renders when the
  // live-pan viewport syncs (up to ~10x/s) (P2).
  const handleSelectElement = useCallback(
    (elementId: string | null) => dispatch({ type: 'select-element', elementId }),
    [dispatch],
  );
  const handleHoverElement = useCallback(
    (elementId: string | null) => dispatch({ type: 'hover-element', elementId }),
    [dispatch],
  );
  const canvasElements = useMemo(
    () => state.elements.filter((element) => element.sheetId === (mappedSheet?.id ?? sheet?.id)),
    [state.elements, mappedSheet?.id, sheet?.id],
  );
  const handleMinimapNavigate = useCallback(
    (fx: number, fy: number) => {
      const el = containerRef.current;
      if (!el) return;
      setCanvas({
        panX: el.clientWidth / 2 - fx * baseW * zoom,
        panY: el.clientHeight / 2 - fy * baseH * zoom,
      });
    },
    [setCanvas, baseW, baseH, zoom],
  );
  const handleZoomIn = useCallback(() => zoomTo(zoom * 1.2), [zoomTo, zoom]);
  const handleZoomOut = useCallback(() => zoomTo(zoom / 1.2), [zoomTo, zoom]);
  const handleActualSize = useCallback(() => zoomTo(1), [zoomTo]);

  if (!sheet && !mappedSheet) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--di-canvas-bg)',
          color: 'var(--di-text3)',
          fontSize: 12.5,
        }}
      >
        Select one or more sheets to begin analysis.
      </div>
    );
  }

  const cursor = dragging
    ? 'grabbing'
    : spaceDown || tool === 'pan'
      ? 'grab'
      : tool === 'measure' || tool === 'takeoff' || tool === 'calibrate'
        ? 'crosshair'
        : 'default';

  return (
    <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--di-canvas-bg)' }}>
      <MemoCanvasToolbar />
      <div
        ref={containerRef}
        data-testid="di-canvas-viewport"
        style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden', cursor }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => fitSheet()}
      >
        <div
          ref={pageTransformRef}
          data-testid="di-canvas-page-surface"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: baseW,
            height: baseH,
            transform: `translate3d(${panX}px, ${panY}px, 0) scale(${zoom})`,
            transformOrigin: '0 0',
            // Satu-satunya layer page yang dipromosikan ke GPU compositor;
            // will-change hanya aktif selama drag/wheel-settle (invariant 5/6).
            willChange: transformPromoted ? 'transform' : undefined,
            // tanpa transition — kanvas mengutamakan responsivitas (§23)
          }}
        >
          {mappedSheet ? <>
            {mappedSheet.imageUrl && (
              <img
                src={mappedSheet.imageUrl}
                alt=""
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  zIndex: 0,
                  pointerEvents: 'none',
                  // Thumbnail underlay selalu mounted di bawah compositor; hanya
                  // visibility/opacity yang berubah, geometri tidak (invariant 4).
                  visibility: coverage ? (coverage.ready ? 'hidden' : 'visible') : 'visible',
                  opacity: coverage ? (coverage.ready ? 0 : 1) : 1,
                }}
              />
            )}
            <PdfPageLayer
              runId={mappedSheet.runId}
              pageIndex={mappedSheet.pageIndex}
              viewportSpace="normalized"
              fallbackWidth={mappedSheet.widthPx ?? baseW}
              fallbackHeight={mappedSheet.heightPx ?? baseH}
              viewport={{ x: viewport?.x ?? 0, y: viewport?.y ?? 0, width: viewport?.w ?? 1, height: viewport?.h ?? 1, zoom, dpr: typeof window === 'undefined' ? 1 : window.devicePixelRatio }}
              onMetrics={metricsHandlerFor(activeDocumentKey ?? '')}
              onCoverageChange={handleCoverageChange}
            />
            <div style={{ position: 'absolute', inset: 0 }}><MemoRealPageSvg
            imageUrl={null}
            elements={canvasElements}
            selectedElementId={state.selectedElementId}
            onSelectElement={handleSelectElement}
          /></div></> : realImageUrl ? <MemoRealPageSvg imageUrl={realImageUrl} elements={canvasElements} selectedElementId={state.selectedElementId} onSelectElement={handleSelectElement} /> : sheet ? <MemoSheetPlanSvg
            sheet={sheet}
            elements={canvasElements}
            overlays={state.overlays}
            selectedElementId={state.selectedElementId}
            hoveredElementId={state.hoveredElementId}
            onSelectElement={handleSelectElement}
            onHoverElement={handleHoverElement}
          /> : null}
        </div>

        {(toolBusy || toolResult) && (
          <div
            className="di-panel di-rise"
            style={{
              position: 'absolute',
              top: 12,
              left: 12,
              zIndex: 25,
              width: 250,
              padding: 10,
              borderRadius: 8,
              display: 'flex',
              flexDirection: 'column',
              gap: 5,
              boxShadow: '0 8px 22px rgba(0,0,0,.28)',
            }}
          >
            <div style={{ fontSize: 11.5, fontWeight: 650, color: 'var(--di-text)' }}>
              {toolBusy ? 'Analyzing geometry…' : toolResult?.kind === 'area' ? 'Area candidate' : 'Line candidate'}
            </div>
            {toolResult && (
              <>
                <div className="di-mono" style={{ fontSize: 12, color: 'var(--di-text2)' }}>
                  {toolResult.raw_value === null ? 'No closed geometry found' : `${toolResult.raw_value.toFixed(2)} ${toolResult.raw_unit ?? ''}`}
                </div>
                <div style={{ fontSize: 10.5, lineHeight: 1.4, color: 'var(--di-text3)' }}>
                  Raw PDF geometry only. This is not a final quantity; confirm scale, boundary, and reviewer approval first.
                </div>
                <button
                  className="di-btn-ghost"
                  style={{ alignSelf: 'flex-end', border: 'none', padding: 0, color: 'var(--di-action)', fontSize: 10.5 }}
                  onClick={() => setToolResult(null)}
                >
                  Dismiss
                </button>
              </>
            )}
          </div>
        )}

        {selectedElement && <MemoSelectionContextBar element={selectedElement} />}

        <MemoZoomBar
          zoom={zoom}
          scaleLabel={sheet?.scale ?? mappedSheet?.scale ?? '—'}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onFit={fitSheet}
          onActualSize={handleActualSize}
        />

        {sheet && <MemoMinimap
          sheet={sheet}
          elements={canvasElements}
          overlays={state.overlays}
          viewport={viewport}
          onNavigate={handleMinimapNavigate}
        />}
      </div>
    </div>
  );
}
