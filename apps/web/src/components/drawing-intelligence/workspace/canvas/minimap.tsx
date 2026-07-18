'use client';

/** Interactive Minimap (blueprint §14.4). */

import { useRef } from 'react';
import type { DetectedElement, Sheet } from '../di-types';
import { SheetPlanSvg, PLAN_MARGIN } from './sheet-plan-svg';

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
  const containerRef = useRef<HTMLDivElement>(null);

  // Hitung aspek rasio termasuk ruang margin bubble/dimensi
  const aspect = sheet
    ? (sheet.geometry.heightMm + (PLAN_MARGIN + 1900) * 2) /
      (sheet.geometry.widthMm + (PLAN_MARGIN + 1900) * 2)
    : 0.55;

  const widthPx = 180;
  const heightPx = widthPx * aspect;

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    container.setPointerCapture(e.pointerId);

    const updatePosition = (clientX: number, clientY: number) => {
      const rect = container.getBoundingClientRect();
      const fx = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const fy = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      onNavigate(fx, fy);
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      updatePosition(moveEvent.clientX, moveEvent.clientY);
    };

    const handlePointerUp = () => {
      if (container) {
        container.removeEventListener('pointermove', handlePointerMove);
        container.removeEventListener('pointerup', handlePointerUp);
      }
    };

    container.addEventListener('pointermove', handlePointerMove);
    container.addEventListener('pointerup', handlePointerUp);

    // Update segera pada klik awal
    updatePosition(e.clientX, e.clientY);
  };

  return (
    <div
      className="di-panel"
      style={{
        position: 'absolute',
        bottom: 16,
        right: 16,
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
        className="di-mono"
        style={{
          fontSize: 9,
          fontWeight: 600,
          color: 'var(--di-text3)',
          letterSpacing: '0.08em',
          padding: '2px 4px 4px',
          textTransform: 'uppercase',
          borderBottom: '1px solid var(--di-border)',
          marginBottom: 4,
        }}
      >
        Viewport Navigator
      </div>

      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
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
              transition: 'left 80ms var(--di-ease), top 80ms var(--di-ease), width 80ms var(--di-ease), height 80ms var(--di-ease)',
            }}
          />
        )}
      </div>
    </div>
  );
}
