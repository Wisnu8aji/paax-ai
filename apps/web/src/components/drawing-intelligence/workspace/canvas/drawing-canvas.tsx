'use client';

/**
 * DrawingCanvas — viewer CAD-like (blueprint §14.2).
 *
 * Interaksi: wheel = zoom terpusat kursor · middle-drag / space+drag /
 * tool pan = pan · dblclick = fit · Ctrl+0 fit · Ctrl+1 100% · +/- zoom ·
 * Esc bersihkan seleksi. Responsif diprioritaskan di atas animasi (§23).
 */

import {
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
import type { InteractiveMeasurementCandidate } from '../../drawing-intelligence-api';

/** lebar dasar render SVG pada zoom=1 (px) — 100% ≈ lebar A1 landscape wajar */
const BASE_WIDTH_PX = 1400;
const MIN_ZOOM = 0.08;
const MAX_ZOOM = 8;

export function DrawingCanvas() {
  const { state, dispatch } = useWorkspace();
  const sheet = useActiveSheet();
  const selectedElement = useSelectedElement();
  const mappedSheet = state.mappedSheets.find((candidate) => candidate.id === state.activeSheetId) ?? null;
  const realImageUrl = mappedSheet?.imageUrl ?? null;
  const [pdfMetrics, setPdfMetrics] = useState<{ width: number; height: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pageTransformRef = useRef<HTMLDivElement | null>(null);
  const pendingPanRef = useRef<{ panX: number; panY: number } | null>(null);
  const panFrameRef = useRef<number | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [toolBusy, setToolBusy] = useState(false);
  const [toolResult, setToolResult] = useState<InteractiveMeasurementCandidate | null>(null);
  const toolRunId = sheet?.runId ?? mappedSheet?.runId ?? null;
  const toolPageIndex = sheet?.pageIndex ?? mappedSheet?.pageIndex ?? null;
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number; button: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const { zoom, panX, panY, tool } = state.canvas;

  const aspect = pdfMetrics
    ? pdfMetrics.height / pdfMetrics.width
    : mappedSheet?.widthPx && mappedSheet.heightPx
      ? mappedSheet.heightPx / mappedSheet.widthPx
      : sheet
    ? (sheet.geometry.heightMm + (PLAN_MARGIN + 1900) * 2) / (sheet.geometry.widthMm + (PLAN_MARGIN + 1900) * 2)
        : 1;
  const baseW = BASE_WIDTH_PX;
  const baseH = BASE_WIDTH_PX * aspect;

  const setCanvas = useCallback(
    (patch: Partial<typeof state.canvas>) => dispatch({ type: 'canvas', patch }),
    [dispatch, state.canvas],
  );

  /** Fit sheet ke container dengan padding. */
  const fitSheet = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    userAdjustedRef.current = false;
    const pad = 48;
    const zw = (el.clientWidth - pad * 2) / baseW;
    const zh = (el.clientHeight - pad * 2) / baseH;
    const z = Math.max(MIN_ZOOM, Math.min(zw, zh));
    setCanvas({
      zoom: z,
      panX: (el.clientWidth - baseW * z) / 2,
      panY: (el.clientHeight - baseH * z) / 2,
    });
  }, [baseW, baseH, setCanvas]);

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
  // selama user belum mengatur zoom manual.
  const userAdjustedRef = useRef(false);
  useEffect(() => {
    userAdjustedRef.current = false;
    setPdfMetrics(null);
    fitSheet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activeSheetId]);

  useEffect(() => {
    if (pdfMetrics && !userAdjustedRef.current) {
      fitSheet();
    }
  }, [pdfMetrics, fitSheet]);

  useEffect(() => () => { if (panFrameRef.current !== null) cancelAnimationFrame(panFrameRef.current); }, []);

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
      const rect = el.getBoundingClientRect();
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      zoomTo(zoom * factor, e.clientX - rect.left, e.clientY - rect.top);
    },
    [zoom, zoomTo],
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
    },
    [spaceDown, tool, panX, panY, zoom, baseW, baseH, toolRunId, toolPageIndex, dispatch],
  );

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
          if (pending && pageTransformRef.current) pageTransformRef.current.style.transform = `translate(${pending.panX}px, ${pending.panY}px) scale(${zoom})`;
        });
      }
    },
    [zoom],
  );

  const onPointerUp = useCallback(() => {
    if (panFrameRef.current !== null) cancelAnimationFrame(panFrameRef.current);
    panFrameRef.current = null;
    if (pendingPanRef.current) setCanvas(pendingPanRef.current);
    pendingPanRef.current = null;
    dragRef.current = null;
    setDragging(false);
  }, [setCanvas]);

  const viewport = useMemo(() => {
    const el = containerRef.current;
    if (!el) return null;
    return {
      x: -panX / zoom / baseW,
      y: -panY / zoom / baseH,
      w: el.clientWidth / zoom / baseW,
      h: el.clientHeight / zoom / baseH,
    };
  }, [panX, panY, zoom, baseW, baseH]);

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
      <CanvasToolbar />
      <div
        ref={containerRef}
        data-testid="di-canvas-viewport"
        style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden', cursor }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={fitSheet}
      >
        <div
          ref={pageTransformRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: baseW,
            height: baseH,
            transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
            transformOrigin: '0 0',
            // tanpa transition — kanvas mengutamakan responsivitas (§23)
          }}
        >
          {mappedSheet ? <>
            <PdfPageLayer
              runId={mappedSheet.runId}
              pageIndex={mappedSheet.pageIndex}
              fallbackWidth={mappedSheet.widthPx ?? baseW}
              fallbackHeight={mappedSheet.heightPx ?? baseH}
              viewport={{ x: viewport?.x ?? 0, y: viewport?.y ?? 0, width: viewport?.w ?? 1, height: viewport?.h ?? 1, zoom, dpr: typeof window === 'undefined' ? 1 : window.devicePixelRatio }}
              onMetrics={setPdfMetrics}
            />
            <div style={{ position: 'absolute', inset: 0 }}><RealPageSvg
            imageUrl={null}
            elements={state.elements.filter((element) => element.sheetId === (mappedSheet?.id ?? sheet?.id))}
            selectedElementId={state.selectedElementId}
            onSelectElement={(id) => dispatch({ type: 'select-element', elementId: id })}
          /></div></> : realImageUrl ? <RealPageSvg imageUrl={realImageUrl} elements={state.elements.filter((element) => element.sheetId === sheet?.id)} selectedElementId={state.selectedElementId} onSelectElement={(id) => dispatch({ type: 'select-element', elementId: id })} /> : sheet ? <SheetPlanSvg
            sheet={sheet}
            elements={state.elements}
            overlays={state.overlays}
            selectedElementId={state.selectedElementId}
            hoveredElementId={state.hoveredElementId}
            onSelectElement={(id) => dispatch({ type: 'select-element', elementId: id })}
            onHoverElement={(id) => dispatch({ type: 'hover-element', elementId: id })}
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

        {selectedElement && <SelectionContextBar element={selectedElement} />}

        <ZoomBar
          zoom={zoom}
          scaleLabel={sheet?.scale ?? mappedSheet?.scale ?? '—'}
          onZoomIn={() => zoomTo(zoom * 1.2)}
          onZoomOut={() => zoomTo(zoom / 1.2)}
          onFit={fitSheet}
          onActualSize={() => zoomTo(1)}
        />

        {sheet && <Minimap
          sheet={sheet}
          elements={state.elements}
          overlays={state.overlays}
          viewport={viewport}
          onNavigate={(fx, fy) => {
            const el = containerRef.current;
            if (!el) return;
            setCanvas({
              panX: el.clientWidth / 2 - fx * baseW * zoom,
              panY: el.clientHeight / 2 - fy * baseH * zoom,
            });
          }}
        />}
      </div>
    </div>
  );
}
