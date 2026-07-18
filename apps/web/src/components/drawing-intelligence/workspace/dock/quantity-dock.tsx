'use client';

/**
 * Quantity Dock — dock bawah mode Review (blueprint §16, gambar 1/8).
 *
 * ATURAN EMAS: dock ini TIDAK PERNAH menghitung kuantitas. Semua qty adalah
 * string yang disalin apa adanya dari state.quantities (mock/engine). Angka
 * yang tampil di badge/pill di sini adalah COUNT baris (jumlah UI), bukan
 * hasil perhitungan teknik.
 */

import { Fragment, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Filter,
  Columns3,
  Settings,
  Download,
  Maximize2,
  MoreVertical,
  Sigma,
  Square,
  Hash,
  Flag,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { useWorkspace } from '../workspace-store';
import { MOCK_ASSUMPTIONS } from '../di-mock-data';
import type { DockTab } from '../workspace-store';
import type { QuantityItem, QuantityRowStatus, VerificationStatus } from '../di-types';
import { useDockToast, DockToastHost } from './dock-toast';

const TABS: { id: DockTab; label: string }[] = [
  { id: 'detected', label: 'Detected Items' },
  { id: 'quantities', label: 'Quantities' },
  { id: 'review-queue', label: 'Review Queue' },
  { id: 'assumptions', label: 'Assumptions' },
  { id: 'activity', label: 'Activity' },
];

const STATUS_PILL: Record<QuantityRowStatus, { label: string; tone?: string; strike?: boolean }> = {
  verified: { label: 'Verified', tone: 'ok' },
  'needs-review': { label: 'Needs review', tone: 'warn' },
  'ai-detected': { label: 'AI detected', tone: 'info' },
  draft: { label: 'Draft' },
  conflict: { label: 'Conflict', tone: 'err' },
  unsupported: { label: 'Unsupported' },
  excluded: { label: 'Excluded', strike: true },
};

const VERIFICATION_PILL: Record<VerificationStatus, { label: string; tone?: string }> = {
  detected: { label: 'Detected', tone: 'info' },
  verified: { label: 'Verified', tone: 'ok' },
  'needs-review': { label: 'Needs review', tone: 'warn' },
  rejected: { label: 'Rejected', tone: 'err' },
  unsupported: { label: 'Unsupported' },
  'missing-source': { label: 'Missing source', tone: 'err' },
};

const FORMULA_ICON: Record<QuantityItem['formulaBasis'], typeof Sigma> = {
  Count: Hash,
  Length: Sigma,
  Area: Square,
  Volume: Square,
};

type StatusFilter = 'all' | 'verified' | 'needs-review' | 'ai-detected';
type SortKey = 'itemCode' | 'floorId' | 'qty' | null;
type SortDir = 'asc' | 'desc';

const OPTIONAL_COLUMNS = ['formula', 'confidence', 'source'] as const;
type OptionalColumn = (typeof OPTIONAL_COLUMNS)[number];

function activityDotTone(kind: string): string {
  switch (kind) {
    case 'verify':
    case 'handoff':
      return 'var(--di-ok)';
    case 'analysis':
      return 'var(--di-info)';
    case 'upload':
      return 'var(--di-accent)';
    case 'correction':
      return 'var(--di-warn)';
    default:
      return 'var(--di-text3)';
  }
}

export function QuantityDock() {
  const { state, dispatch } = useWorkspace();
  const { dock } = state;
  const { toasts, showToast } = useDockToast();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [visibleCols, setVisibleCols] = useState<Record<OptionalColumn, boolean>>({
    formula: true,
    confidence: false,
    source: true,
  });
  const [sortKey, setSortKey] = useState<SortKey>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [rowMenuId, setRowMenuId] = useState<string | null>(null);

  const dockRef = useRef<HTMLElement>(null);
  const resizing = useRef(false);

  const unresolvedReviewCount = state.reviewQueue.filter((r) => !r.resolved).length;

  function startResize(e: React.PointerEvent) {
    e.preventDefault();
    resizing.current = true;
    const onMove = (ev: PointerEvent) => {
      if (!resizing.current) return;
      const winH = window.innerHeight;
      const fromBottom = winH - ev.clientY;
      const pct = Math.min(55, Math.max(20, (fromBottom / winH) * 100));
      dispatch({ type: 'dock', patch: { heightPct: pct } });
    };
    const onUp = () => {
      resizing.current = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  const filteredQuantities = useMemo(() => {
    let rows = state.quantities;
    if (statusFilter !== 'all') rows = rows.filter((q) => q.status === statusFilter);
    if (sortKey) {
      rows = [...rows].sort((a, b) => {
        let av: string | number = '';
        let bv: string | number = '';
        if (sortKey === 'itemCode') {
          av = a.itemCode;
          bv = b.itemCode;
        } else if (sortKey === 'floorId') {
          av = a.floorId;
          bv = b.floorId;
        } else if (sortKey === 'qty') {
          av = parseFloat(a.qty.replace(/,/g, '')) || 0;
          bv = parseFloat(b.qty.replace(/,/g, '')) || 0;
        }
        if (av < bv) return sortDir === 'asc' ? -1 : 1;
        if (av > bv) return sortDir === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return rows;
  }, [state.quantities, statusFilter, sortKey, sortDir]);

  const sheetElements = useMemo(
    () => state.elements.filter((e) => e.sheetId === state.activeSheetId),
    [state.elements, state.activeSheetId],
  );

  function toggleSort(key: Exclude<SortKey, null>) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function verifyRow(q: QuantityItem) {
    dispatch({ type: 'set-quantity-status', quantityId: q.id, status: 'verified' });
    dispatch({
      type: 'push-activity',
      entry: { time: 'Now', message: `Verified ${q.itemCode} — ${q.workItem}`, kind: 'verify' },
    });
    setRowMenuId(null);
  }

  function markNeedsReview(q: QuantityItem) {
    dispatch({ type: 'set-quantity-status', quantityId: q.id, status: 'needs-review' });
    dispatch({
      type: 'push-activity',
      entry: { time: 'Now', message: `Marked needs review: ${q.itemCode}`, kind: 'correction' },
    });
    setRowMenuId(null);
  }

  function excludeRow(q: QuantityItem) {
    dispatch({ type: 'set-quantity-status', quantityId: q.id, status: 'excluded' });
    dispatch({
      type: 'push-activity',
      entry: { time: 'Now', message: `Excluded ${q.itemCode} from handoff`, kind: 'correction' },
    });
    setRowMenuId(null);
  }

  async function resolveReviewItem(itemId: string, title: string) {
    dispatch({ type: 'resolve-review-item', itemId });
    dispatch({
      type: 'push-activity',
      entry: { time: 'Now', message: `Resolved: ${title}`, kind: 'correction' },
    });

    if (state.projectId) {
      try {
        const { resolveCorrection } = await import('../../drawing-intelligence-api');
        await resolveCorrection(state.projectId, itemId, {
          status: 'resolved',
          resolution_note: 'Resolved via Review Queue UI',
        });
        showToast(`Successfully resolved correction on backend`);
      } catch (err: any) {
        console.warn('Backend resolveCorrection failed (synthetic queue item):', err);
        showToast(`Resolved locally.`);
      }
    }
  }

  async function proposeFix(item: any) {
    if (!state.projectId) {
      showToast('No active project found');
      return;
    }
    if (!state.activeSnapshotId) {
      showToast('No active snapshot found');
      return;
    }

    const parts = item.id.split(':');
    const targetType = parts[1] || 'node';
    const targetId = parts[2] || item.elementId || item.id;

    const proposedValue = window.prompt(`Propose a new value for target ${targetId}:`, '');
    if (proposedValue === null || proposedValue.trim() === '') return;

    const rationale = window.prompt(`Provide rationale/reason for this proposed fix:`, 'Human correction');
    if (rationale === null || rationale.trim() === '') return;

    try {
      const { createCorrection } = await import('../../drawing-intelligence-api');
      const uuidVal = typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID 
        ? window.crypto.randomUUID() 
        : 'corr-' + Math.random().toString(36).substring(2, 9) + '-' + Date.now();

      await createCorrection(state.projectId, {
        id: uuidVal,
        snapshot_id: state.activeSnapshotId,
        target_type: targetType,
        target_id: targetId,
        correction_type: 'override',
        proposed_value: { value: proposedValue },
        rationale: rationale,
      });
      showToast('Correction proposal created successfully');
      dispatch({
        type: 'push-activity',
        entry: { time: 'Now', message: `Proposed fix for ${targetId}: ${proposedValue}`, kind: 'correction' },
      });
    } catch (err: any) {
      console.error('Failed to create correction:', err);
      showToast(`Failed to create correction: ${err.message || 'Unknown error'}`);
    }
  }

  function openReviewItem(sheetId: string | null, elementId: string | null) {
    if (sheetId) dispatch({ type: 'set-active-sheet', sheetId });
    if (elementId) dispatch({ type: 'select-element', elementId });
  }

  const collapsedHeight = 'var(--di-dock-collapsed-h)';

  return (
    <section
      ref={dockRef}
      className="di-panel"
      style={{
        position: 'relative',
        height: dock.expanded ? `${dock.heightPct}%` : collapsedHeight,
        display: 'flex',
        flexDirection: 'column',
        borderLeft: 'none',
        borderRight: 'none',
        borderBottom: 'none',
        overflow: 'hidden',
        transition: resizing.current ? 'none' : 'height var(--di-t-med) var(--di-ease)',
      }}
    >
      {dock.expanded && (
        <div
          onPointerDown={startResize}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 5,
            cursor: 'row-resize',
            zIndex: 5,
          }}
        />
      )}

      {!dock.expanded && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', height: '100%' }}>
          <strong style={{ fontSize: 12.5 }}>Quantity Dock</strong>
          <span className="di-pill">{state.quantities.length} Items</span>
          <Filter size={14} color="var(--di-text3)" />
          <button
            className="di-icon-btn"
            style={{ marginLeft: 'auto' }}
            aria-label="Expand dock"
            onClick={() => dispatch({ type: 'dock', patch: { expanded: true } })}
          >
            <ChevronUp size={16} />
          </button>
        </div>
      )}

      {dock.expanded && (
        <>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: '1px solid var(--di-border)' }}>
            <strong style={{ fontSize: 12.5 }}>Quantity Dock</strong>
            <span className="di-pill">{state.quantities.length} Items</span>

            <div style={{ position: 'relative' }}>
              <button
                className="di-icon-btn"
                data-active={filterOpen}
                aria-label="Filter by status"
                onClick={() => {
                  setFilterOpen((v) => !v);
                  setColumnsOpen(false);
                }}
              >
                <Filter size={14} />
              </button>
              {filterOpen && (
                <div
                  className="di-panel di-rise"
                  style={{ position: 'absolute', top: 34, left: 0, zIndex: 20, borderRadius: 8, minWidth: 160, padding: 4 }}
                >
                  {(['all', 'verified', 'needs-review', 'ai-detected'] as StatusFilter[]).map((f) => (
                    <button
                      key={f}
                      onClick={() => {
                        setStatusFilter(f);
                        setFilterOpen(false);
                      }}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '6px 10px',
                        borderRadius: 6,
                        background: statusFilter === f ? 'var(--di-accent-soft)' : 'transparent',
                        color: statusFilter === f ? 'var(--di-accent)' : 'var(--di-text)',
                        fontSize: 12,
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      {f === 'all' ? 'All' : f === 'verified' ? 'Verified' : f === 'needs-review' ? 'Needs review' : 'AI detected'}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ position: 'relative' }}>
                <button
                  className="di-btn di-btn-ghost"
                  onClick={() => {
                    setColumnsOpen((v) => !v);
                    setFilterOpen(false);
                  }}
                >
                  <Columns3 size={14} /> Columns
                </button>
                {columnsOpen && (
                  <div
                    className="di-panel di-rise"
                    style={{ position: 'absolute', top: 36, right: 0, zIndex: 20, borderRadius: 8, minWidth: 180, padding: 8 }}
                  >
                    {OPTIONAL_COLUMNS.map((c) => (
                      <label
                        key={c}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', fontSize: 12, cursor: 'pointer' }}
                      >
                        <input
                          type="checkbox"
                          checked={visibleCols[c]}
                          onChange={() => setVisibleCols((v) => ({ ...v, [c]: !v[c] }))}
                        />
                        {c === 'formula' ? 'Formula' : c === 'confidence' ? 'Confidence' : 'Source'}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <button className="di-btn di-btn-ghost" onClick={() => showToast('Coming soon')}>
                <Settings size={14} /> Settings
              </button>

              <button
                className="di-icon-btn"
                aria-label="Export quantity register"
                onClick={() => showToast('Exported quantity register (CSV)')}
              >
                <Download size={15} />
              </button>

              <button
                className="di-icon-btn"
                aria-label="Maximize dock"
                onClick={() => dispatch({ type: 'dock', patch: { heightPct: 55 } })}
              >
                <Maximize2 size={14} />
              </button>
              <button
                className="di-icon-btn"
                aria-label="Collapse dock"
                onClick={() => dispatch({ type: 'dock', patch: { expanded: false } })}
              >
                <ChevronDown size={16} />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, padding: '6px 10px', borderBottom: '1px solid var(--di-border)' }}>
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => dispatch({ type: 'dock', patch: { tab: t.id } })}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '5px 10px',
                  borderRadius: 7,
                  fontSize: 12,
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  background: dock.tab === t.id ? 'var(--di-panel2)' : 'transparent',
                  color: dock.tab === t.id ? 'var(--di-text)' : 'var(--di-text2)',
                }}
              >
                {t.label}
                {t.id === 'review-queue' && unresolvedReviewCount > 0 && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: 16,
                      height: 16,
                      padding: '0 4px',
                      borderRadius: 999,
                      background: 'var(--di-err)',
                      color: 'var(--di-action-ink)',
                      fontSize: 10,
                      fontWeight: 700,
                    }}
                  >
                    {unresolvedReviewCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Body */}
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }} onClick={() => rowMenuId && setRowMenuId(null)}>
            {dock.tab === 'quantities' && (
              <table className="di-table">
                <thead>
                  <tr>
                    <th style={{ width: 28 }} />
                    <th onClick={() => toggleSort('itemCode')} style={{ cursor: 'pointer' }}>
                      Item Code {sortKey === 'itemCode' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th>Work Item</th>
                    <th onClick={() => toggleSort('floorId')} style={{ cursor: 'pointer' }}>
                      Floor {sortKey === 'floorId' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th>Category</th>
                    {visibleCols.formula && <th>Formula</th>}
                    <th>Unit</th>
                    <th onClick={() => toggleSort('qty')} style={{ cursor: 'pointer', textAlign: 'right' }}>
                      Qty {sortKey === 'qty' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th>Status</th>
                    {visibleCols.confidence && <th>Confidence</th>}
                    {visibleCols.source && <th>Source</th>}
                    <th style={{ width: 28 }} />
                  </tr>
                </thead>
                <tbody>
                  {filteredQuantities.map((q) => {
                    const FormulaIcon = FORMULA_ICON[q.formulaBasis];
                    const pill = STATUS_PILL[q.status];
                    const isExpanded = expandedRowId === q.id;
                    return (
                      <Fragment key={q.id}>
                        <tr
                          data-selected={state.selectedQuantityId === q.id}
                          onClick={() => dispatch({ type: 'select-quantity', quantityId: q.id })}
                        >
                          <td onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox" readOnly checked={q.status === 'verified'} />
                          </td>
                          <td className="di-mono">{q.itemCode}</td>
                          <td>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedRowId(isExpanded ? null : q.id);
                              }}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                background: 'none',
                                border: 'none',
                                color: 'inherit',
                                cursor: 'pointer',
                                padding: 0,
                                font: 'inherit',
                              }}
                            >
                              <ChevronRight
                                size={12}
                                style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 160ms' }}
                              />
                              {q.workItem}
                            </button>
                          </td>
                          <td className="di-mono">{q.floorLabel}</td>
                          <td>{q.category}</td>
                          {visibleCols.formula && (
                            <td>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                <FormulaIcon size={12} color="var(--di-text3)" />
                                {q.formulaBasis}
                              </span>
                            </td>
                          )}
                          <td className="di-mono">{q.unit}</td>
                          <td className="di-mono" style={{ textAlign: 'right', fontWeight: 700, color: 'var(--di-text)' }}>
                            {q.qty}
                          </td>
                          <td>
                            <span
                              className="di-pill"
                              data-tone={pill.tone}
                              style={pill.strike ? { textDecoration: 'line-through', opacity: 0.7 } : undefined}
                            >
                              {pill.label}
                            </span>
                          </td>
                          {visibleCols.confidence && <td className="di-mono">{q.confidence ?? '—'}%</td>}
                          {visibleCols.source && <td className="di-mono">{q.source}</td>}
                          <td onClick={(e) => e.stopPropagation()} style={{ position: 'relative' }}>
                            <button
                              className="di-icon-btn"
                              aria-label="Row actions"
                              onClick={() => setRowMenuId(rowMenuId === q.id ? null : q.id)}
                            >
                              <MoreVertical size={14} />
                            </button>
                            {rowMenuId === q.id && (
                              <div
                                className="di-panel di-rise"
                                style={{ position: 'absolute', top: 30, right: 8, zIndex: 20, borderRadius: 8, minWidth: 150, padding: 4 }}
                              >
                                <button className="di-menu-item" style={menuItemStyle} onClick={() => verifyRow(q)}>
                                  Verify
                                </button>
                                <button className="di-menu-item" style={menuItemStyle} onClick={() => markNeedsReview(q)}>
                                  Mark needs review
                                </button>
                                <button className="di-menu-item" style={menuItemStyle} onClick={() => excludeRow(q)}>
                                  Exclude
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr style={{ cursor: 'default' }}>
                            <td colSpan={11} style={{ background: 'var(--di-panel2)' }}>
                              <div style={{ padding: '8px 6px' }}>
                                <div style={{ fontSize: 12, color: 'var(--di-text)', marginBottom: 6 }}>{q.formula}</div>
                                <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 3 }}>
                                  {q.formulaEvidence.map((line, i) => (
                                    <li key={i} className="di-mono" style={{ fontSize: 11, color: 'var(--di-text2)' }}>
                                      {line}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}

            {dock.tab === 'detected' && (
              <table className="di-table">
                <thead>
                  <tr>
                    <th>AI ID</th>
                    <th>Code</th>
                    <th>Category</th>
                    <th>Grid</th>
                    <th>Dimensions</th>
                    <th>Confidence</th>
                    <th>Verification</th>
                  </tr>
                </thead>
                <tbody>
                  {sheetElements.map((el) => {
                    const pill = VERIFICATION_PILL[el.verification];
                    return (
                      <tr
                        key={el.id}
                        data-selected={state.selectedElementId === el.id}
                        onClick={() => dispatch({ type: 'select-element', elementId: el.id })}
                      >
                        <td className="di-mono">{el.aiId}</td>
                        <td>{el.code}</td>
                        <td>{el.category}</td>
                        <td className="di-mono">{el.grid ?? '—'}</td>
                        <td>{el.dimensions ?? '—'}</td>
                        <td className="di-mono">{el.confidence}%</td>
                        <td>
                          <span className="di-pill" data-tone={pill.tone}>
                            {pill.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {dock.tab === 'review-queue' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12 }}>
                {state.reviewQueue.filter((r) => !r.resolved).length === 0 ? (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 8,
                      padding: '28px 0',
                      color: 'var(--di-ok)',
                    }}
                  >
                    <CheckCircle2 size={28} />
                    <span style={{ fontSize: 12.5 }}>No detections match the active filters.</span>
                  </div>
                ) : (
                  state.reviewQueue
                    .filter((r) => !r.resolved)
                    .map((r) => (
                      <div
                        key={r.id}
                        className="di-panel"
                        style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 10 }}
                      >
                        {r.severity === 'issue' ? (
                          <Flag size={16} color="var(--di-err)" style={{ marginTop: 2, flexShrink: 0 }} />
                        ) : (
                          <AlertCircle size={16} color="var(--di-warn)" style={{ marginTop: 2, flexShrink: 0 }} />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600 }}>{r.title}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--di-text2)', marginTop: 2 }}>{r.reason}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          {(r.sheetId || r.elementId) && (
                            <button
                              className="di-btn di-btn-ghost"
                              onClick={() => openReviewItem(r.sheetId, r.elementId)}
                            >
                              Open
                            </button>
                          )}
                            <button
                              className="di-btn"
                              style={{ background: 'var(--di-warn-bg)', color: 'var(--di-warn)', border: '1px solid var(--di-warn-bd)' }}
                              onClick={() => proposeFix(r)}
                            >
                              Propose Fix
                            </button>
                            <button className="di-btn di-btn-ok" onClick={() => resolveReviewItem(r.id, r.title)}>
                              Resolve
                            </button>
                        </div>
                      </div>
                    ))
                )}
              </div>
            )}

            {dock.tab === 'assumptions' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12 }}>
                {MOCK_ASSUMPTIONS.map((a) => (
                  <div key={a.id} className="di-panel" style={{ padding: 12, borderRadius: 10 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700 }}>{a.topic}</div>
                    <div style={{ fontSize: 12, color: 'var(--di-text2)', marginTop: 4 }}>{a.assumption}</div>
                    <div style={{ fontSize: 11, color: 'var(--di-text3)', marginTop: 6 }}>Affects: {a.affects}</div>
                  </div>
                ))}
              </div>
            )}

            {dock.tab === 'activity' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px' }}>
                {state.activity.map((a, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background: activityDotTone(a.kind),
                        flexShrink: 0,
                      }}
                    />
                    <span className="di-mono" style={{ fontSize: 11, color: 'var(--di-text3)', width: 72, flexShrink: 0 }}>
                      {a.time}
                    </span>
                    <span style={{ fontSize: 12.5 }}>{a.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <DockToastHost toasts={toasts} />
    </section>
  );
}

const menuItemStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '6px 10px',
  borderRadius: 6,
  background: 'transparent',
  color: 'var(--di-text)',
  fontSize: 12,
  border: 'none',
  cursor: 'pointer',
};
