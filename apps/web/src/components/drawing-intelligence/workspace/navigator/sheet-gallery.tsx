'use client';

/** Sheet gallery mode Sheets (blueprint §10, gambar referensi 5). */

import { useMemo, useState } from 'react';
import {
  ChevronDown,
  LayoutGrid,
  List,
  MoreVertical,
  SendHorizonal,
} from 'lucide-react';
import { useWorkspace } from '../workspace-store';
import { SheetPlanSvg } from '../canvas/sheet-plan-svg';
import { DISCIPLINE_LABELS, formatBytes, type Discipline, type Sheet } from '../di-types';

const OVERLAY_DOTS = ['column', 'beam', 'slab', 'shear-wall', 'wall'] as const;

function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      className="di-panel di-fade"
      style={{
        position: 'absolute',
        bottom: 62,
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '6px 12px',
        borderRadius: 8,
        fontSize: 11.5,
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

function GalleryCard({ sheet, showTitles, onToast }: { sheet: Sheet; showTitles: boolean; onToast: (m: string) => void }) {
  const { state, dispatch } = useWorkspace();
  const checked = state.selectedSheetIds.includes(sheet.id);
  const needsReview = sheet.status === 'needs-review' || sheet.reviewIssueCount > 0;

  return (
    <div
      className="di-panel"
      style={{
        borderRadius: 10,
        overflow: 'hidden',
        cursor: 'pointer',
        borderColor: checked ? 'var(--di-action)' : undefined,
        borderWidth: checked ? 2 : 1,
      }}
      onClick={() => {
        dispatch({ type: 'set-active-sheet', sheetId: sheet.id });
        dispatch({ type: 'set-mode', mode: 'review' });
      }}
    >
      <div style={{ position: 'relative', aspectRatio: '16 / 10', background: 'var(--di-paper)' }}>
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
          style={{ position: 'absolute', top: 8, left: 8, width: 15, height: 15, cursor: 'pointer' }}
          aria-label={`Select ${sheet.code}`}
        />
        <span
          className="di-mono di-pill"
          style={{ position: 'absolute', bottom: 8, left: 8, fontSize: 10 }}
        >
          {sheet.scale ?? '—'}
        </span>
      </div>
      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="di-mono" style={{ fontSize: 13, fontWeight: 700 }}>
            {sheet.floorId}
          </span>
          <div style={{ flex: 1 }} />
          <SheetMenu onAction={() => onToast(`Applied to 1 sheets`)} />
        </div>
        {showTitles && (
          <div style={{ fontSize: 12, color: 'var(--di-text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {sheet.title}
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {sheet.disciplines.slice(0, 4).map((d) => (
            <span key={d} className="di-disc" data-d={d} title={DISCIPLINE_LABELS[d]}>
              {d}
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {OVERLAY_DOTS.map((cat) => (
            <span
              key={cat}
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: `var(--di-ov-${cat === 'shear-wall' ? 'shear' : cat})`,
              }}
            />
          ))}
          <div style={{ flex: 1 }} />
          <span className="di-pill" data-tone={needsReview ? 'warn' : 'ok'}>
            {needsReview ? 'Needs review' : 'Verified'}
          </span>
        </div>
      </div>
    </div>
  );
}

function ListRow({ sheet }: { sheet: Sheet }) {
  const { state, dispatch } = useWorkspace();
  const checked = state.selectedSheetIds.includes(sheet.id);
  const needsReview = sheet.status === 'needs-review' || sheet.reviewIssueCount > 0;
  return (
    <tr
      data-selected={checked}
      onClick={() => {
        dispatch({ type: 'set-active-sheet', sheetId: sheet.id });
        dispatch({ type: 'set-mode', mode: 'review' });
      }}
    >
      <td onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={checked}
          onChange={() => dispatch({ type: 'toggle-sheet-selection', sheetId: sheet.id })}
          style={{ cursor: 'pointer' }}
        />
      </td>
      <td className="di-mono">{sheet.code}</td>
      <td>{sheet.title}</td>
      <td className="di-mono">{sheet.floorId}</td>
      <td>
        <div style={{ display: 'flex', gap: 4 }}>
          {sheet.disciplines.map((d) => (
            <span key={d} className="di-disc" data-d={d}>
              {d}
            </span>
          ))}
        </div>
      </td>
      <td className="di-mono">{sheet.scale ?? '—'}</td>
      <td>
        <span className="di-pill" data-tone={needsReview ? 'warn' : 'ok'}>
          {needsReview ? 'Needs review' : 'Verified'}
        </span>
      </td>
    </tr>
  );
}

export function SheetGallery() {
  const { state, dispatch, askPaax } = useWorkspace();
  const [disciplineFilter, setDisciplineFilter] = useState<Discipline | null>(null);
  const [scaleFilter, setScaleFilter] = useState<string | null>(null);
  const [disciplineMenuOpen, setDisciplineMenuOpen] = useState(false);
  const [scaleMenuOpen, setScaleMenuOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [question, setQuestion] = useState('');

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 1500);
  };

  const scales = useMemo(
    () => Array.from(new Set(state.sheets.map((s) => s.scale).filter(Boolean))) as string[],
    [state.sheets],
  );

  const filtered = useMemo(() => {
    return state.sheets.filter((s) => {
      if (disciplineFilter && !s.disciplines.includes(disciplineFilter)) return false;
      if (scaleFilter && s.scale !== scaleFilter) return false;
      return true;
    });
  }, [state.sheets, disciplineFilter, scaleFilter]);

  const grouped = useMemo(() => {
    if (state.gallery.groupBy !== 'floor') return [{ floorLabel: null, sheets: filtered }];
    const order: string[] = [];
    const map = new Map<string, Sheet[]>();
    for (const s of filtered) {
      if (!map.has(s.floorId)) {
        order.push(s.floorId);
        map.set(s.floorId, []);
      }
      map.get(s.floorId)!.push(s);
    }
    const groups = order.map((floorId) => ({ floorLabel: map.get(floorId)![0].floorLabel, sheets: map.get(floorId)! }));
    // Satu sheet per lantai → heading grup hanya memboroskan ruang; tampilkan
    // grid flat seperti referensi (kartu sudah memuat label lantai).
    if (groups.every((g) => g.sheets.length <= 1)) return [{ floorLabel: null, sheets: filtered }];
    return groups;
  }, [filtered, state.gallery.groupBy]);

  const totalSizeMb = state.files.reduce((sum, f) => sum + f.sizeBytes, 0);
  const selected = state.selectedSheetIds;

  return (
    <section style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 20 }}>
        <h2 style={{ fontFamily: 'var(--di-font-display)', fontSize: 16, marginBottom: 12 }}>
          All Sheets ({state.sheets.length})
        </h2>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <button className="di-btn" onClick={() => setDisciplineMenuOpen((v) => !v)}>
              {disciplineFilter ?? 'All disciplines'}
              <ChevronDown size={13} />
            </button>
            {disciplineMenuOpen && (
              <div
                className="di-panel di-fade"
                style={{ position: 'absolute', top: 36, left: 0, zIndex: 40, borderRadius: 8, padding: 4, minWidth: 140 }}
              >
                <button
                  className="di-btn di-btn-ghost"
                  style={{ width: '100%', justifyContent: 'flex-start', height: 26, fontSize: 11.5 }}
                  onClick={() => {
                    setDisciplineFilter(null);
                    setDisciplineMenuOpen(false);
                  }}
                >
                  All disciplines
                </button>
                {(['STR', 'ARC', 'MEP', 'CIV', 'OTH'] as Discipline[]).map((d) => (
                  <button
                    key={d}
                    className="di-btn di-btn-ghost"
                    style={{ width: '100%', justifyContent: 'flex-start', height: 26, fontSize: 11.5 }}
                    onClick={() => {
                      setDisciplineFilter(d);
                      setDisciplineMenuOpen(false);
                    }}
                  >
                    {DISCIPLINE_LABELS[d]}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ position: 'relative' }}>
            <button className="di-btn" onClick={() => setScaleMenuOpen((v) => !v)}>
              {scaleFilter ?? 'All scales'}
              <ChevronDown size={13} />
            </button>
            {scaleMenuOpen && (
              <div
                className="di-panel di-fade"
                style={{ position: 'absolute', top: 36, left: 0, zIndex: 40, borderRadius: 8, padding: 4, minWidth: 120 }}
              >
                <button
                  className="di-btn di-btn-ghost"
                  style={{ width: '100%', justifyContent: 'flex-start', height: 26, fontSize: 11.5 }}
                  onClick={() => {
                    setScaleFilter(null);
                    setScaleMenuOpen(false);
                  }}
                >
                  All scales
                </button>
                {scales.map((sc) => (
                  <button
                    key={sc}
                    className="di-btn di-btn-ghost di-mono"
                    style={{ width: '100%', justifyContent: 'flex-start', height: 26, fontSize: 11.5 }}
                    onClick={() => {
                      setScaleFilter(sc);
                      setScaleMenuOpen(false);
                    }}
                  >
                    {sc}
                  </button>
                ))}
              </div>
            )}
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--di-text2)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={state.gallery.showTitles}
              onChange={(e) => dispatch({ type: 'gallery', patch: { showTitles: e.target.checked } })}
            />
            Show sheet titles
          </label>

          <div style={{ flex: 1 }} />

          {selected.length > 0 && (
            <>
              <button
                className="di-btn-ghost"
                style={{ border: 'none', background: 'none', color: 'var(--di-action)', fontSize: 12, cursor: 'pointer' }}
                onClick={() => dispatch({ type: 'set-sheet-selection', sheetIds: [] })}
              >
                Clear selection
              </button>
              <span style={{ fontSize: 12, color: 'var(--di-text2)' }}>{selected.length} selected</span>
            </>
          )}

          <button
            className="di-icon-btn"
            data-active={state.gallery.view === 'grid'}
            onClick={() => dispatch({ type: 'gallery', patch: { view: 'grid' } })}
            aria-label="Grid view"
          >
            <LayoutGrid size={15} />
          </button>
          <button
            className="di-icon-btn"
            data-active={state.gallery.view === 'list'}
            onClick={() => dispatch({ type: 'gallery', patch: { view: 'list' } })}
            aria-label="List view"
          >
            <List size={15} />
          </button>
        </div>

        {state.gallery.view === 'grid' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {grouped.map((g, i) => (
              <div key={g.floorLabel ?? i}>
                {g.floorLabel && (
                  <div className="di-section-title" style={{ marginBottom: 8 }}>
                    {g.floorLabel}
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                  {g.sheets.map((s) => (
                    <GalleryCard key={s.id} sheet={s} showTitles={state.gallery.showTitles} onToast={showToast} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <table className="di-table">
            <thead>
              <tr>
                <th></th>
                <th>Code</th>
                <th>Title</th>
                <th>Floor</th>
                <th>Disciplines</th>
                <th>Scale</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <ListRow key={s.id} sheet={s} />
              ))}
            </tbody>
          </table>
        )}

        {selected.length > 0 && (
          <div className="di-panel di-rise" style={{ borderRadius: 10, margin: '16px 0 0', padding: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', position: 'sticky', bottom: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 500 }}>
              {selected.length} of {state.sheets.length} selected
            </span>
            <div style={{ flex: 1 }} />
            <button className="di-btn di-btn-accent" onClick={() => dispatch({ type: 'set-mode', mode: 'analyze' })}>
              Analyze selected
            </button>
            <button className="di-btn" onClick={() => showToast(`Applied to ${selected.length} sheets`)}>
              Set discipline
            </button>
            <button className="di-btn" onClick={() => showToast(`Applied to ${selected.length} sheets`)}>
              Set floor
            </button>
            <button className="di-btn" onClick={() => showToast(`Applied to ${selected.length} sheets`)}>
              Rename
            </button>
            <button className="di-btn" onClick={() => showToast(`Applied to ${selected.length} sheets`)}>
              Exclude
            </button>
            <button className="di-btn di-btn-ghost" onClick={() => dispatch({ type: 'set-sheet-selection', sheetIds: [] })}>
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '8px 20px',
          borderTop: '1px solid var(--di-border)',
          flexShrink: 0,
        }}
      >
        <span className="di-mono" style={{ fontSize: 11, color: 'var(--di-text3)' }}>
          {state.sheets.length} sheets · {selected.length} selected · Total size: {formatBytes(totalSizeMb)}
        </span>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: 320 }}>
          <input
            className="di-input"
            placeholder="Ask a question about these sheets..."
            style={{ flex: 1 }}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && question.trim()) {
                dispatch({ type: 'ask-paax', patch: { open: true } });
                askPaax(question.trim());
                setQuestion('');
              }
            }}
          />
          <button
            className="di-icon-btn"
            aria-label="Ask PAAX"
            onClick={() => {
              if (!question.trim()) return;
              dispatch({ type: 'ask-paax', patch: { open: true } });
              askPaax(question.trim());
              setQuestion('');
            }}
          >
            <SendHorizonal size={15} />
          </button>
        </div>
      </div>

      <Toast message={toast} />
    </section>
  );
}
