'use client';

/** Interactive Minimap (blueprint §14.4). */

import { useRef } from 'react';
import { Minimize2, Maximize2, X } from 'lucide-react';
import type { DetectedElement, Sheet } from '../di-types';
import { SheetPlanSvg, PLAN_MARGIN } from './sheet-plan-svg';
import { useWorkspace } from '../workspace-store';

export interface MinimapProps {
  sheet: Sheet;
  elements: DetectedElement[];
  overlays: Record<string, boolean>;
  /** viewport dalam fraksi 0..1 relatif ke bidang render dasar */
  viewport: { x: number; y: number; w: number; h: number } | null;
  onNavigate: (fx: number, fy: number) => void;
}

export function Minimap({
  sheet,
  elements,
  overlays,
  viewport,
  onNavigate,
}: MinimapProps) {
  const { state, dispatch } = useWorkspace();
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const { visible, minimized, position } = state.canvas.minimap;

  if (!visible) return null;

  // Hitung aspek rasio termasuk ruang margin bubble/dimensi
  const aspect = sheet
    ? (sheet.geometry.heightMm + (PLAN_MARGIN + 1900) * 2) /
      (sheet.geometry.widthMm + (PLAN_MARGIN + 1900) * 2)
    : 0.55;

  const widthPx = 180;
  const heightPx = widthPx * aspect;

  const handleHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();

    const panel = panelRef.current;
    if (!panel) return;

    const parent = panel.parentElement;
    const parentRect = parent ? parent.getBoundingClientRect() : { width: 1000, height: 800 };
    const panelRect = panel.getBoundingClientRect();

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const startPosX = position.x;
    const startPosY = position.y;

    if (panel.setPointerCapture) {
      try {
        panel.setPointerCapture(e.pointerId);
      } catch (_) {}
    }

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startClientX;
      const dy = moveEvent.clientY - startClientY;

      // Position represents right & bottom offsets in pixels
      const rawX = startPosX - dx;
      const rawY = startPosY - dy;

      const maxX = Math.max(0, parentRect.width - panelRect.width);
      const maxY = Math.max(0, parentRect.height - panelRect.height);

      const clampedX = Math.max(0, Math.min(maxX, rawX));
      const clampedY = Math.max(0, Math.min(maxY, rawY));

      dispatch({
        type: 'canvas',
        patch: {
          minimap: {
            position: { x: clampedX, y: clampedY },
          },
        },
      });
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      if (panel.releasePointerCapture) {
        try {
          panel.releasePointerCapture(upEvent.pointerId);
        } catch (_) {}
      }
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

  const handlePreviewPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    if (container.setPointerCapture) {
      try {
        container.setPointerCapture(e.pointerId);
      } catch (_) {}
    }

    const updatePosition = (clientX: number, clientY: number) => {
      const rect = container.getBoundingClientRect();
      const fx = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const fy = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      onNavigate(fx, fy);
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      updatePosition(moveEvent.clientX, moveEvent.clientY);
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      if (container.releasePointerCapture) {
        try {
          container.releasePointerCapture(upEvent.pointerId);
        } catch (_) {}
      }
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    updatePosition(e.clientX, e.clientY);
  };

  return (
    <div
      ref={panelRef}
      className="di-panel"
      style={{
        position: 'absolute',
        bottom: `${position.y}px`,
        right: `${position.x}px`,
        background: 'var(--di-panel)',
        border: '1px solid var(--di-border-strong)',
        borderRadius: 8,
        padding: 4,
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
        zIndex: 20,
        userSelect: 'none',
      }}
    >
      <div
        onPointerDown={handleHeaderPointerDown}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '2px 4px 4px',
          borderBottom: minimized ? 'none' : '1px solid var(--di-border)',
          marginBottom: minimized ? 0 : 4,
          cursor: 'grab',
        }}
      >
        <div
          className="di-mono"
          style={{
            fontSize: 9,
            fontWeight: 600,
            color: 'var(--di-text3)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          Viewport Navigator
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button
            type="button"
            className="di-icon-btn"
            aria-label={minimized ? 'Restore Minimap' : 'Minimize Minimap'}
            title={minimized ? 'Restore Minimap' : 'Minimize Minimap'}
            onClick={() =>
              dispatch({
                type: 'canvas',
                patch: {
                  minimap: { minimized: !minimized },
                },
              })
            }
            style={{ width: 18, height: 18, padding: 0 }}
          >
            {minimized ? <Maximize2 size={10} /> : <Minimize2 size={10} />}
          </button>
          <button
            type="button"
            className="di-icon-btn"
            aria-label="Close Minimap"
            title="Close Minimap"
            onClick={() =>
              dispatch({
                type: 'canvas',
                patch: {
                  minimap: { visible: false },
                },
              })
            }
            style={{ width: 18, height: 18, padding: 0 }}
          >
            <X size={10} />
          </button>
        </div>
      </div>

      {!minimized && (
        <div
          ref={containerRef}
          data-testid="di-minimap-preview"
          onPointerDown={handlePreviewPointerDown}
          style={{
            position: 'relative',
            width: widthPx,
            height: heightPx,
            cursor: 'crosshair',
            overflow: 'hidden',
            borderRadius: 4,
          }}
        >
          {/* Render drawing preview */}
          <SheetPlanSvg
            sheet={sheet}
            elements={elements}
            overlays={overlays}
            selectedElementId={null}
            hoveredElementId={null}
            thumbnail={true}
          />

          {/* Viewport Overlay Box */}
          {viewport && (
            <div
              style={{
                position: 'absolute',
                left: `${Math.max(-20, Math.min(120, viewport.x * 100))}%`,
                top: `${Math.max(-20, Math.min(120, viewport.y * 100))}%`,
                width: `${Math.max(2, Math.min(120, viewport.w * 100))}%`,
                height: `${Math.max(2, Math.min(120, viewport.h * 100))}%`,
                border: '1.5px solid var(--di-accent)',
                background: 'rgba(155, 106, 85, 0.15)',
                pointerEvents: 'none',
                boxShadow: '0 0 0 4000px rgba(10, 17, 24, 0.45)', // Overlay dimming outside viewport
                transition:
                  'left 80ms var(--di-ease), top 80ms var(--di-ease), width 80ms var(--di-ease), height 80ms var(--di-ease)',
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
