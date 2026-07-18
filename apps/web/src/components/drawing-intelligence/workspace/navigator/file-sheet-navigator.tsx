'use client';

/** File & Sheet Navigator kiri (blueprint §14.1, gambar referensi 1/2). */

import { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileText,
  FolderOpen,
  MoreVertical,
  PanelLeftClose,
  PanelLeftOpen,
  UploadCloud,
} from 'lucide-react';
import { useWorkspace } from '../workspace-store';
import { SheetPlanSvg } from '../canvas/sheet-plan-svg';
import { LevelTreeView } from './level-tree-view';
import { DISCIPLINE_LABELS, formatBytes, type Discipline, type Sheet } from '../di-types';

const DISCIPLINES: Discipline[] = ['STR', 'ARC', 'MEP', 'CIV', 'OTH'];

function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      className="di-panel di-fade"
      style={{
        position: 'absolute',
        bottom: 10,
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '6px 12px',
        borderRadius: 8,
        fontSize: 11.5,
        color: 'var(--di-text)',
        zIndex: 80,
        boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
        whiteSpace: 'nowrap',
      }}
    >
      {message}
    </div>
  );
}

function SheetMenu({ onAction }: { onAction: (label: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button
        className="di-icon-btn"
        style={{ width: 22, height: 22 }}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label="Sheet menu"
      >
        <MoreVertical size={13} />
      </button>
      {open && (
        <div
          className="di-panel di-fade"
          style={{
            position: 'absolute',
            top: 24,
            right: 0,
            zIndex: 50,
            borderRadius: 8,
            padding: 4,
            minWidth: 128,
            boxShadow: '0 10px 24px rgba(0,0,0,0.4)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {['Rename', 'Reclassify', 'Exclude'].map((label) => (
            <button
              key={label}
              className="di-btn di-btn-ghost"
              style={{ width: '100%', justifyContent: 'flex-start', height: 26, fontSize: 11.5 }}
              onClick={() => {
                setOpen(false);
                onAction(label);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SheetCard({ sheet }: { sheet: Sheet }) {
  const { state, dispatch } = useWorkspace();
  const [toast, setToast] = useState<string | null>(null);
  const active = state.activeSheetId === sheet.id;
  const checked = state.selectedSheetIds.includes(sheet.id);

  const showToast = (label: string) => {
    setToast(`Saved`);
    void label;
    setTimeout(() => setToast(null), 1500);
  };

  return (
    <div
      className="di-panel"
      style={{
        position: 'relative',
        borderRadius: 9,
        padding: 8,
        cursor: 'pointer',
        borderColor: active ? 'var(--di-accent)' : undefined,
        borderWidth: active ? 1.5 : 1,
      }}
      onClick={() => {
        dispatch({ type: 'set-active-sheet', sheetId: sheet.id });
        if (state.mode !== 'review' && state.mode !== 'analyze') {
          // biarkan mode saat ini — hanya ganti sheet aktif
        }
      }}
    >
      <div
        style={{
          position: 'relative',
          aspectRatio: '46 / 25',
          borderRadius: 5,
          overflow: 'hidden',
          background: 'var(--di-paper)',
          border: '1px solid var(--di-border)',
        }}
      >
        <SheetPlanSvg
          sheet={sheet}
          elements={[]}
          overlays={{ room: true, 'grid-axis': true }}
          selectedElementId={null}
          hoveredElementId={null}
          thumbnail
        />
        <input
          type="checkbox"
          checked={checked}
          onClick={(e) => e.stopPropagation()}
          onChange={() => dispatch({ type: 'toggle-sheet-selection', sheetId: sheet.id })}
          style={{ position: 'absolute', top: 5, left: 5, width: 13, height: 13, cursor: 'pointer' }}
          aria-label={`Select ${sheet.code}`}
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
        <span className="di-mono" style={{ fontSize: 11.5, fontWeight: 700 }}>
          {sheet.code}
        </span>
        <span
          className="di-mono di-pill"
          style={{ fontSize: 9.5, height: 16, padding: '0 5px' }}
        >
          {sheet.scale ?? '—'}
        </span>
        <div style={{ flex: 1 }} />
        <SheetMenu onAction={showToast} />
      </div>
      <div style={{ fontSize: 11, color: 'var(--di-text2)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {sheet.title}
      </div>
      <Toast message={toast} />
    </div>
  );
}

function FloorRow({ floorId, floorLabel, sheets }: { floorId: string; floorLabel: string; sheets: Sheet[] }) {
  const { state, dispatch } = useWorkspace();
  const expanded = state.navigator.expandedFloors.includes(floorId);
  const running = state.analysis.running;

  const toggle = () => {
    const next = expanded
      ? state.navigator.expandedFloors.filter((f) => f !== floorId)
      : [...state.navigator.expandedFloors, floorId];
    dispatch({ type: 'navigator', patch: { expandedFloors: next } });
  };

  const activeFloor = state.sheets.find((s) => s.id === state.activeSheetId)?.floorId;
  const showProcessing = running && activeFloor === floorId;
  const showQueued = running && activeFloor !== floorId;

  return (
    <div>
      <button
        className="di-btn di-btn-ghost"
        style={{ width: '100%', justifyContent: 'flex-start', height: 30, padding: '0 4px', gap: 4 }}
        onClick={toggle}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span style={{ fontSize: 12, fontWeight: 500 }}>
          {floorId} – {floorLabel}
        </span>
        <div style={{ flex: 1 }} />
        {showProcessing && (
          <span className="di-pill di-pulse" data-tone="accent" style={{ marginRight: 4 }}>
            Processing
          </span>
        )}
        {showQueued && (
          <span className="di-pill" data-tone="info" style={{ marginRight: 4 }}>
            Queued
          </span>
        )}
        <span className="di-pill" style={{ marginRight: 2 }}>
          {sheets.length}
        </span>
      </button>
      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 4px 4px 20px' }}>
          {sheets.map((s) => (
            <SheetCard key={s.id} sheet={s} />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileSheetNavigator() {
  const { state, dispatch } = useWorkspace();
  const [importToast, setImportToast] = useState<string | null>(null);

  const disciplineCounts = useMemo(() => {
    const counts: Record<Discipline, number> = { STR: 0, ARC: 0, MEP: 0, CIV: 0, OTH: 0 };
    for (const s of state.sheets) {
      for (const d of s.disciplines) counts[d] += 1;
    }
    return counts;
  }, [state.sheets]);

  const floors = useMemo(() => {
    const search = state.navigator.search.trim().toLowerCase();
    const disciplineFilter = state.navigator.disciplineFilter as Discipline | null;
    const filtered = state.sheets.filter((s) => {
      if (disciplineFilter && !s.disciplines.includes(disciplineFilter)) return false;
      if (!search) return true;
      return (
        s.code.toLowerCase().includes(search) ||
        s.title.toLowerCase().includes(search) ||
        s.floorLabel.toLowerCase().includes(search)
      );
    });
    const order: string[] = [];
    const map = new Map<string, Sheet[]>();
    for (const s of filtered) {
      if (!map.has(s.floorId)) {
        order.push(s.floorId);
        map.set(s.floorId, []);
      }
      map.get(s.floorId)!.push(s);
    }
    return order.map((floorId) => ({
      floorId,
      floorLabel: map.get(floorId)![0].floorLabel,
      sheets: map.get(floorId)!,
    }));
  }, [state.sheets, state.navigator.search, state.navigator.disciplineFilter]);

  if (state.navigator.collapsed) {
    return (
      <aside
        className="di-panel"
        style={{
          width: 40,
          minWidth: 40,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 10,
          borderTop: 'none',
          borderBottom: 'none',
          borderLeft: 'none',
        }}
      >
        <button
          className="di-icon-btn"
          onClick={() => dispatch({ type: 'navigator', patch: { collapsed: false } })}
          aria-label="Expand navigator"
        >
          <PanelLeftOpen size={16} />
        </button>
      </aside>
    );
  }

  return (
    <aside
      className="di-panel"
      style={{
        width: 'var(--di-nav-w)',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        borderTop: 'none',
        borderBottom: 'none',
        borderLeft: 'none',
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 12px 8px', gap: 6 }}>
        <div className="di-section-title" style={{ flex: 1 }}>
          File &amp; Sheet Navigator
        </div>
        <button
          className="di-icon-btn"
          onClick={() => dispatch({ type: 'navigator', patch: { collapsed: true } })}
          aria-label="Collapse navigator"
        >
          <PanelLeftClose size={15} />
        </button>
      </div>

      <div style={{ padding: '0 12px 10px' }}>
        <div style={{ display: 'flex', background: 'var(--di-paper)', borderRadius: 8, padding: 2, border: '1px solid var(--di-border)' }}>
          <button
            className="di-btn di-btn-ghost"
            style={{ flex: 1, justifyContent: 'center', height: 26, fontSize: 11, background: state.navigator.tab === 'sheets' ? 'var(--di-surface2)' : 'transparent', fontWeight: state.navigator.tab === 'sheets' ? 600 : 500 }}
            onClick={() => dispatch({ type: 'navigator', patch: { tab: 'sheets' } })}
          >
            Sheets
          </button>
          <button
            className="di-btn di-btn-ghost"
            style={{ flex: 1, justifyContent: 'center', height: 26, fontSize: 11, background: state.navigator.tab === 'classification' ? 'var(--di-surface2)' : 'transparent', fontWeight: state.navigator.tab === 'classification' ? 600 : 500 }}
            onClick={() => dispatch({ type: 'navigator', patch: { tab: 'classification' } })}
          >
            Level Tree
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {state.navigator.tab === 'classification' ? (
          <LevelTreeView />
        ) : (
          <>
            {/* Kartu file */}
        {state.files.length === 0 ? (
          <div
            className="di-panel"
            style={{ borderRadius: 10, padding: 16, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}
          >
            <FolderOpen size={22} style={{ color: 'var(--di-text3)' }} />
            <div style={{ fontSize: 12, fontWeight: 500 }}>No files uploaded yet</div>
            <div style={{ fontSize: 11, color: 'var(--di-text2)', lineHeight: 1.5 }}>
              Upload PDF, DWG, or image sheets to get started.
            </div>
            <button
              className="di-btn di-btn-primary"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => dispatch({ type: 'upload', patch: { modalOpen: true } })}
            >
              <UploadCloud size={14} />
              Upload new files
            </button>
            <button
              className="di-btn-ghost"
              style={{
                border: 'none',
                background: 'none',
                color: 'var(--di-action)',
                fontSize: 11.5,
                cursor: 'pointer',
                padding: 0,
              }}
              onClick={() => {
                setImportToast('Coming soon');
                setTimeout(() => setImportToast(null), 1500);
              }}
            >
              Import from project documents
            </button>
          </div>
        ) : (
          state.files.map((f) => (
            <div key={f.id} className="di-panel" style={{ borderRadius: 10, padding: 10, display: 'flex', gap: 9, alignItems: 'center' }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 7,
                  background: 'rgba(217,108,108,0.16)',
                  color: 'var(--di-err)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <FileText size={17} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.name}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--di-text3)' }}>
                  {formatBytes(f.sizeBytes)} · {f.sheetCount} sheets
                </div>
              </div>
              <span className="di-pill" data-tone="ok">
                Analyzed
              </span>
            </div>
          ))
        )}

        {/* Disciplines */}
        <div>
          <div className="di-section-title" style={{ marginBottom: 6 }}>
            Disciplines {state.navigator.disciplineFilter ? `(${state.navigator.disciplineFilter})` : '(All)'}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {DISCIPLINES.map((d) => {
              const isActive = state.navigator.disciplineFilter === d;
              return (
                <button
                  key={d}
                  className="di-disc"
                  data-d={d}
                  style={{
                    cursor: 'pointer',
                    background: isActive ? 'color-mix(in srgb, var(--di-disc-' + d.toLowerCase() + ') 22%, transparent)' : undefined,
                  }}
                  title={DISCIPLINE_LABELS[d]}
                  onClick={() =>
                    dispatch({
                      type: 'navigator',
                      patch: { disciplineFilter: isActive ? null : d },
                    })
                  }
                >
                  {d} {disciplineCounts[d]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Search */}
        <input
          className="di-input"
          placeholder="Search sheets..."
          value={state.navigator.search}
          onChange={(e) => dispatch({ type: 'navigator', patch: { search: e.target.value } })}
          style={{ width: '100%' }}
        />

        {/* Floors */}
        <div>
          <div className="di-section-title" style={{ marginBottom: 6 }}>
            FLOORS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {floors.length === 0 && (
              <div style={{ fontSize: 11.5, color: 'var(--di-text3)', padding: '4px 4px' }}>No sheets match.</div>
            )}
            {floors.map((f) => (
              <FloorRow key={f.floorId} floorId={f.floorId} floorLabel={f.floorLabel} sheets={f.sheets} />
            ))}
          </div>
        </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: 12, borderTop: '1px solid var(--di-border)' }}>
        <button
          className="di-btn"
          style={{ width: '100%', justifyContent: 'center' }}
          onClick={() => dispatch({ type: 'upload', patch: { modalOpen: true } })}
        >
          <UploadCloud size={14} />
          Upload new files
        </button>
      </div>

      <Toast message={importToast} />
    </aside>
  );
}
