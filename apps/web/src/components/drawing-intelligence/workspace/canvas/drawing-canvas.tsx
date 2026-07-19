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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number; button: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const { zoom, panX, panY, tool } = state.canvas;

  const aspect = sheet
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
    fitSheet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activeSheetId]);

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
      const isPan = e.button === 1 || spaceDown || tool === 'pan';
      if (!isPan) return;
      e.preventDefault();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      dragRef.current = { startX: e.clientX, startY: e.clientY, panX, panY, button: e.button };
      setDragging(true);
    },
    [spaceDown, tool, panX, panY],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      setCanvas({ panX: d.panX + (e.clientX - d.startX), panY: d.panY + (e.clientY - d.startY) });
    },
    [setCanvas],
  );

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
    setDragging(false);
  }, []);

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
  if (!sheet && mappedSheet && !realImageUrl) {
    return <div style={{ flex: 1, display: 'grid', placeItems: 'center', background: 'var(--di-canvas-bg)', color: 'var(--di-text3)', fontSize: 12.5 }}>Source image is unavailable for this sheet. No canvas overlay is shown.</div>;
  }

  const cursor = dragging
    ? 'grabbing'
    : spaceDown || tool === 'pan'
      ? 'grab'
      : tool === 'measure' || tool === 'calibrate'
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
        onDoubleClick={fitSheet}
      >
        <div
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
          {sheet ? <SheetPlanSvg
            sheet={sheet}
            elements={state.elements}
            overlays={state.overlays}
            selectedElementId={state.selectedElementId}
            hoveredElementId={state.hoveredElementId}
            onSelectElement={(id) => dispatch({ type: 'select-element', elementId: id })}
            onHoverElement={(id) => dispatch({ type: 'hover-element', elementId: id })}
          /> : realImageUrl ? <RealPageSvg
            imageUrl={realImageUrl}
            elements={state.elements.filter((element) => element.sheetId === mappedSheet!.id)}
            selectedElementId={state.selectedElementId}
            onSelectElement={(id) => dispatch({ type: 'select-element', elementId: id })}
          /> : null}
        </div>

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
