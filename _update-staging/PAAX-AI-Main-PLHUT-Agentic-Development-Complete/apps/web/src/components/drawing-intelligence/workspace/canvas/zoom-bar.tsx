'use client';

/** Floating zoom bar (referensi gambar 1: −/+, %, fit, scale). */

import { Minus, Plus, Maximize, RefreshCw } from 'lucide-react';

export interface ZoomBarProps {
  zoom: number;
  scaleLabel: string;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onActualSize: () => void;
}

export function ZoomBar({
  zoom,
  scaleLabel,
  onZoomIn,
  onZoomOut,
  onFit,
  onActualSize,
}: ZoomBarProps) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'var(--di-panel)',
        border: '1px solid var(--di-border-strong)',
        borderRadius: 10,
        padding: '5px 12px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
        zIndex: 20,
        height: 38,
      }}
    >
      {/* Zoom Out */}
      <button
        className="di-icon-btn"
        onClick={onZoomOut}
        title="Zoom Out"
        aria-label="Zoom out"
        style={{ width: 28, height: 28 }}
      >
        <Minus size={14} />
      </button>

      {/* Zoom % / Reset */}
      <button
        className="di-mono"
        onClick={onActualSize}
        title="Reset to 100% (Actual Size)"
        style={{
          alignSelf: 'center',
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--di-text)',
          background: 'var(--di-panel2)',
          border: '1px solid var(--di-border)',
          borderRadius: 6,
          padding: '2px 8px',
          cursor: 'pointer',
          minWidth: 54,
          textAlign: 'center',
          transition: 'background var(--di-t-fast) var(--di-ease), border-color var(--di-t-fast) var(--di-ease)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--di-border-strong)';
          e.currentTarget.style.background = 'var(--di-elev)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--di-border)';
          e.currentTarget.style.background = 'var(--di-panel2)';
        }}
      >
        {Math.round(zoom * 100)}%
      </button>

      {/* Zoom In */}
      <button
        className="di-icon-btn"
        onClick={onZoomIn}
        title="Zoom In"
        aria-label="Zoom in"
        style={{ width: 28, height: 28 }}
      >
        <Plus size={14} />
      </button>

      {/* Divider */}
      <span
        style={{
          width: 1,
          height: 18,
          background: 'var(--di-border-strong)',
          margin: '0 4px',
        }}
      />

      {/* Fit Screen */}
      <button
        className="di-btn di-btn-ghost"
        onClick={onFit}
        title="Fit Drawing to Screen (Ctrl+0)"
        style={{
          height: 28,
          padding: '0 8px',
          gap: 6,
          fontSize: 12,
          color: 'var(--di-text2)',
        }}
      >
        <Maximize size={13} />
        Fit
      </button>

      {/* Divider */}
      <span
        style={{
          width: 1,
          height: 18,
          background: 'var(--di-border-strong)',
          margin: '0 4px',
        }}
      />

      {/* Scale Badge */}
      <div
        className="di-pill"
        data-tone="accent"
        title="Current sheet design scale"
        style={{
          height: 22,
          padding: '0 8px',
          fontWeight: 600,
          fontSize: 11,
        }}
      >
        Scale: {scaleLabel}
      </div>
    </div>
  );
}

