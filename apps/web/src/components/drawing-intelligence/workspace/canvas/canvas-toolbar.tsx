'use client';

/** Canvas toolbar — tool selector, document tabs, and layer overlays (viewer §14.2). */

import { useState, useRef, useEffect } from 'react';
import { useWorkspace } from '../workspace-store';
import {
  MousePointer,
  Hand,
  Ruler,
  PenTool,
  Layers,
  Eye,
  ChevronDown,
  Scale,
  Maximize
} from 'lucide-react';
import type { ElementCategory } from '../di-types';

const CATEGORY_LABELS: Record<ElementCategory, string> = {
  column: 'Columns',
  beam: 'Beams',
  slab: 'Slabs',
  'shear-wall': 'Shear Walls',
  wall: 'Walls',
  stair: 'Stairs',
  door: 'Doors',
  window: 'Windows',
  room: 'Rooms',
  'grid-axis': 'Grid & Axes',
  dimension: 'Dimensions',
  'mep-point': 'MEP Points',
};

export function CanvasToolbar() {
  const { state, dispatch } = useWorkspace();
  const [layersOpen, setLayersOpen] = useState(false);
  const layersRef = useRef<HTMLDivElement>(null);

  // Click outside to close layers dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (layersRef.current && !layersRef.current.contains(event.target as Node)) {
        setLayersOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter sheets based on selectedSheetIds, or fallback to all sheets
  const selectedSheets = state.sheets.filter((s) =>
    state.selectedSheetIds.includes(s.id)
  );
  const sheetsToShow = selectedSheets.length > 0 ? selectedSheets : state.sheets;

  const tools: { id: typeof state.canvas.tool; label: string; icon: typeof MousePointer }[] = [
    { id: 'select', label: 'Select', icon: MousePointer },
    { id: 'pan', label: 'Pan', icon: Hand },
    { id: 'measure', label: 'Measure', icon: Ruler },
    { id: 'markup', label: 'Markup', icon: PenTool },
    { id: 'takeoff', label: 'Takeoff', icon: Layers },
    { id: 'calibrate', label: 'Calibrate', icon: Scale },
  ];

  return (
    <div
      style={{
        height: 44,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 10px',
        borderBottom: '1px solid var(--di-border)',
        background: 'var(--di-panel)',
        color: 'var(--di-text2)',
        fontSize: 12,
        flexShrink: 0,
        gap: 8,
      }}
    >
      {/* Kiri: Tab Dokumen */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          height: '100%',
          overflowX: 'auto',
          maxWidth: '40%',
          scrollbarWidth: 'none', // Hide scrollbar for clean tab look
        }}
      >
        {sheetsToShow.map((s) => {
          const isActive = s.id === state.activeSheetId;
          return (
            <button
              key={s.id}
              onClick={() => dispatch({ type: 'set-active-sheet', sheetId: s.id })}
              title={`${s.code} – ${s.title}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                height: 32,
                padding: '0 12px',
                borderRadius: '6px 6px 0 0',
                border: 'none',
                background: isActive ? 'var(--di-canvas-bg)' : 'transparent',
                color: isActive ? 'var(--di-text)' : 'var(--di-text3)',
                fontWeight: isActive ? 600 : 500,
                fontSize: 12,
                fontFamily: 'var(--di-font-mono)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                borderTop: isActive ? '2px solid var(--di-accent)' : '2px solid transparent',
                transition: 'background var(--di-t-fast) var(--di-ease), color var(--di-t-fast) var(--di-ease)',
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.color = 'var(--di-text2)';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.color = 'var(--di-text3)';
              }}
            >
              {s.code}
            </button>
          );
        })}
      </div>

      {/* Tengah: Tool Selector */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          background: 'var(--di-bg)',
          padding: 3,
          borderRadius: 8,
          border: '1px solid var(--di-border)',
        }}
      >
        {tools.map((t) => {
          const Icon = t.icon;
          const isActive = state.canvas.tool === t.id;
          return (
            <button
              key={t.id}
              className="di-icon-btn"
              data-active={isActive}
              title={`${t.label} Tool`}
              onClick={() => dispatch({ type: 'canvas', patch: { tool: t.id } })}
              style={{
                width: 28,
                height: 28,
              }}
            >
              <Icon size={14} />
            </button>
          );
        })}
      </div>

      {/* Kanan: Overlays (Layer Visibility) Dropdown */}
      <div ref={layersRef} style={{ position: 'relative' }}>
        <button
          type="button"
          className="di-btn"
          onClick={() => setLayersOpen(!layersOpen)}
          style={{
            height: 28,
            padding: '0 8px',
            gap: 6,
          }}
        >
          <Eye size={13} />
          <span>Layers</span>
          <ChevronDown size={11} style={{ opacity: 0.6 }} />
        </button>

        {layersOpen && (
          <div
            className="di-panel di-rise"
            style={{
              position: 'absolute',
              top: 34,
              right: 0,
              width: 180,
              borderRadius: 8,
              padding: 6,
              zIndex: 30,
              boxShadow: '0 10px 24px rgba(0, 0, 0, 0.5)',
            }}
          >
            <div
              className="di-section-title"
              style={{
                padding: '4px 8px 6px',
                borderBottom: '1px solid var(--di-border)',
                marginBottom: 4,
              }}
            >
              Visible Layers
            </div>
            <div
              style={{
                maxHeight: 280,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
              }}
            >
              {(Object.keys(CATEGORY_LABELS) as ElementCategory[]).map((cat) => {
                const isVisible = state.overlays[cat] !== false;
                return (
                  <button
                    key={cat}
                    onClick={() => dispatch({ type: 'toggle-overlay', category: cat })}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      padding: '4px 8px',
                      borderRadius: 4,
                      background: isVisible ? 'var(--di-accent-soft)' : 'transparent',
                      color: isVisible ? 'var(--di-text)' : 'var(--di-text3)',
                      border: 'none',
                      fontSize: 11.5,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background var(--di-t-fast) var(--di-ease), color var(--di-t-fast) var(--di-ease)',
                    }}
                  >
                    <span>{CATEGORY_LABELS[cat]}</span>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: isVisible
                          ? `var(--di-ov-${cat === 'shear-wall' ? 'shear' : cat === 'stair' ? 'wall' : cat})` || 'var(--di-accent)'
                          : 'transparent',
                        border: isVisible ? 'none' : '1px solid var(--di-border-strong)',
                      }}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

