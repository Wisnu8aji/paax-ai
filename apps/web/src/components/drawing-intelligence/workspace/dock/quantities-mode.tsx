'use client';

/**
 * Quantities mode — Extracted Work Items grouped by Location & WBS, +
 * Extraction Inspector kanan dengan donut summary (gambar 9).
 *
 * ATURAN EMAS: semua qty tetap string dari data (state.quantities). Statistik
 * di sini (total/verified/review/floors, donut, bar) adalah COUNT baris —
 * bukan perhitungan kuantitas teknik.
 */

import { Fragment, useMemo, useState } from 'react';
import {
  FileStack,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  X,
} from 'lucide-react';
import { useWorkspace } from '../workspace-store';
import type { QuantityItem, QuantityRowStatus } from '../di-types';

const STATUS_PILL: Record<QuantityRowStatus, { label: string; tone?: string; strike?: boolean }> = {
  verified: { label: 'Verified', tone: 'ok' },
  'needs-review': { label: 'Needs review', tone: 'warn' },
  'ai-detected': { label: 'AI detected', tone: 'info' },
  draft: { label: 'Draft' },
  conflict: { label: 'Conflict', tone: 'err' },
  unsupported: { label: 'Unsupported' },
  excluded: { label: 'Excluded', strike: true },
};

type GroupMode = 'location-wbs' | 'wbs-only' | 'flat';

function groupItems(items: QuantityItem[], mode: GroupMode): { title: string; rows: QuantityItem[] }[] {
  if (mode === 'flat') return [{ title: 'All Items', rows: items }];
  const key = (q: QuantityItem) => (mode === 'wbs-only' ? q.wbsSection : q.wbsGroup);
  const map = new Map<string, QuantityItem[]>();
  for (const q of items) {
    const k = key(q);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(q);
  }
  return Array.from(map, ([title, rows]) => ({ title, rows }));
}

export function QuantitiesMode() {
  const { state, dispatch } = useWorkspace();
  const { quantities } = state;

  const [groupMode, setGroupMode] = useState<GroupMode>('location-wbs');
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(true);

  const total = quantities.length;
  const nVerified = quantities.filter((q) => q.status === 'verified').length;
  const nReview = quantities.filter((q) => q.status === 'needs-review').length;
  const nAiDetected = quantities.filter((q) => q.status === 'ai-detected').length;
  const nFloors = useMemo(() => new Set(quantities.map((q) => q.floorId)).size, [quantities]);

  const groups = useMemo(() => groupItems(quantities, groupMode), [quantities, groupMode]);

  function toggleGroup(title: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }

  // ── By Floor / By Category aggregation (COUNT, UI only) ──
  const byFloor = useMemo(() => {
    const map = new Map<string, number>();
    for (const q of quantities) map.set(q.floorLabel, (map.get(q.floorLabel) ?? 0) + 1);
    return Array.from(map, ([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  }, [quantities]);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const q of quantities) map.set(q.wbsSection, (map.get(q.wbsSection) ?? 0) + 1);
    return Array.from(map, ([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  }, [quantities]);

  const maxFloorCount = Math.max(1, ...byFloor.map((f) => f.count));
  const maxCategoryCount = Math.max(1, ...byCategory.map((c) => c.count));

  // ── Donut geometry (proportion of counts — UI only) ──
  const donut = useMemo(() => {
    const r = 46;
    const circumference = 2 * Math.PI * r;
    const segs = [
      { key: 'verified', count: nVerified, color: 'var(--di-ok)' },
      { key: 'needs-review', count: nReview, color: 'var(--di-warn)' },
      { key: 'ai-detected', count: nAiDetected, color: 'var(--di-info)' },
    ];
    let offset = 0;
    const arcs = segs.map((s) => {
      const frac = total > 0 ? s.count / total : 0;
      const len = frac * circumference;
      const arc = { ...s, dasharray: `${len} ${circumference - len}`, dashoffset: -offset };
      offset += len;
      return arc;
    });
    return { r, circumference, arcs };
  }, [total, nVerified, nReview, nAiDetected]);

  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  return (
    <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex' }}>
      {/* Konten tabel */}
      <section style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <StatCard
            icon={<FileStack size={18} color="var(--di-accent)" />}
            value={total}
            label="items detected"
            border="var(--di-accent)"
          />
          <StatCard icon={<CheckCircle2 size={18} color="var(--di-ok)" />} value={nVerified} label="verified" />
          <StatCard icon={<AlertTriangle size={18} color="var(--di-warn)" />} value={nReview} label="need review" />
          <StatCard icon={<Layers size={18} color="var(--di-info)" />} value={nFloors} label="grouped floors" />
        </div>

        {/* Table header + options */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontFamily: 'var(--di-font-display)', fontSize: 15, margin: 0 }}>
            Extracted Work Items (Grouped by Location &amp; WBS)
          </h2>
          <div style={{ position: 'relative' }}>
            <button className="di-btn di-btn-ghost" onClick={() => setOptionsOpen((v) => !v)}>
              Options <ChevronDown size={13} />
            </button>
            {optionsOpen && (
              <div
                className="di-panel di-rise"
                style={{ position: 'absolute', top: 36, right: 0, zIndex: 20, borderRadius: 8, minWidth: 220, padding: 4 }}
              >
                {(
                  [
                    { id: 'location-wbs', label: 'Group by Location & WBS' },
                    { id: 'wbs-only', label: 'Group by WBS only' },
                    { id: 'flat', label: 'Flat list' },
                  ] as { id: GroupMode; label: string }[]
                ).map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      setGroupMode(opt.id);
                      setOptionsOpen(false);
                    }}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '7px 10px',
                      borderRadius: 6,
                      background: groupMode === opt.id ? 'var(--di-accent-soft)' : 'transparent',
                      color: groupMode === opt.id ? 'var(--di-accent)' : 'var(--di-text)',
                      fontSize: 12,
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="di-panel" style={{ borderRadius: 10, overflow: 'hidden' }}>
          <table className="di-table">
            <thead>
              <tr>
                <th style={{ width: 28 }} />
                <th>Item</th>
                <th>Code</th>
                <th>Floor</th>
                <th>Work Package</th>
                <th>Formula</th>
                <th>Unit</th>
                <th style={{ textAlign: 'right' }}>Qty</th>
                <th>Verification Status</th>
                <th style={{ width: 28 }} />
              </tr>
            </thead>
            <tbody>
              {groups.map((g, gi) => {
                const collapsed = collapsedGroups.has(g.title);
                return (
                  <Fragment key={g.title}>
                    {groupMode !== 'flat' && (
                      <tr
                        onClick={() => toggleGroup(g.title)}
                        style={{ background: 'var(--di-panel2)', cursor: 'pointer' }}
                      >
                        <td colSpan={10}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                            <span className="di-mono" style={{ color: 'var(--di-text3)' }}>
                              {gi + 1}
                            </span>
                            <strong style={{ fontSize: 12.5 }}>{g.title}</strong>
                            <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--di-text2)' }}>
                              Total: {g.rows.length} items
                            </span>
                          </div>
                        </td>
                      </tr>
                    )}
                    {!collapsed &&
                      g.rows.map((q) => {
                        const pill = STATUS_PILL[q.status];
                        return (
                          <tr
                            key={q.id}
                            data-selected={state.selectedQuantityId === q.id}
                            onMouseEnter={() => setHoveredRowId(q.id)}
                            onMouseLeave={() => setHoveredRowId((id) => (id === q.id ? null : id))}
                            onClick={() => dispatch({ type: 'select-quantity', quantityId: q.id })}
                          >
                            <td />
                            <td>{q.workItem}</td>
                            <td className="di-mono">{q.itemCode}</td>
                            <td className="di-mono">{q.floorLabel}</td>
                            <td className="di-mono" style={{ fontSize: 11 }}>
                              {q.wbsSection}
                            </td>
                            <td>{q.formulaBasis}</td>
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
                            <td onClick={(e) => e.stopPropagation()}>
                              {hoveredRowId === q.id && (
                                <button
                                  className="di-icon-btn"
                                  aria-label="Open in Review"
                                  title="Open in Review"
                                  onClick={() => dispatch({ type: 'set-mode', mode: 'review' })}
                                >
                                  <ExternalLink size={13} />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Extraction Inspector kanan */}
      {inspectorOpen && (
        <aside
          className="di-panel"
          style={{
            width: 320,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            padding: 16,
            overflow: 'auto',
            borderTop: 'none',
            borderBottom: 'none',
            borderRight: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <strong style={{ fontSize: 13 }}>Extraction Inspector</strong>
            <button className="di-icon-btn" aria-label="Collapse inspector" onClick={() => setInspectorOpen(false)}>
              <X size={15} />
            </button>
          </div>

          <div>
            <div className="di-section-title" style={{ marginBottom: 10 }}>
              Extraction Summary
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <svg width={120} height={120} viewBox="0 0 120 120">
                <circle cx="60" cy="60" r={donut.r} fill="none" stroke="var(--di-panel2)" strokeWidth={14} />
                {donut.arcs.map((a) => (
                  <circle
                    key={a.key}
                    cx="60"
                    cy="60"
                    r={donut.r}
                    fill="none"
                    stroke={a.color}
                    strokeWidth={14}
                    strokeDasharray={a.dasharray}
                    strokeDashoffset={a.dashoffset}
                    transform="rotate(-90 60 60)"
                    strokeLinecap="butt"
                  />
                ))}
                <text
                  x="60"
                  y="56"
                  textAnchor="middle"
                  fontSize="18"
                  fontFamily="var(--di-font-mono)"
                  fill="var(--di-text)"
                  fontWeight={700}
                >
                  {total}
                </text>
                <text x="60" y="72" textAnchor="middle" fontSize="9" fill="var(--di-text3)">
                  Total Items
                </text>
              </svg>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11.5 }}>
                <LegendRow color="var(--di-ok)" label={`${nVerified} Verified (${pct(nVerified)}%)`} />
                <LegendRow color="var(--di-warn)" label={`${nReview} Need Review (${pct(nReview)}%)`} />
                <LegendRow color="var(--di-info)" label={`${nAiDetected} AI Detected (${pct(nAiDetected)}%)`} />
              </div>
            </div>
          </div>

          <div>
            <div className="di-section-title" style={{ marginBottom: 8 }}>
              By Floor
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {byFloor.map((f) => (
                <BarRow key={f.label} label={f.label} count={f.count} max={maxFloorCount} color="var(--di-info)" />
              ))}
            </div>
          </div>

          <div>
            <div className="di-section-title" style={{ marginBottom: 8 }}>
              By Category (WBS)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {byCategory.map((c) => (
                <BarRow key={c.label} label={c.label} count={c.count} max={maxCategoryCount} color="var(--di-action)" />
              ))}
            </div>
          </div>

          <div>
            <div className="di-section-title" style={{ marginBottom: 8 }}>
              Verification Notes
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <NoteRow icon={<CheckCircle2 size={13} color="var(--di-ok)" />} text="AI + rules verified" />
              <NoteRow icon={<AlertTriangle size={13} color="var(--di-warn)" />} text="Check geometry/assumptions" />
              <NoteRow icon={<FileStack size={13} color="var(--di-info)" />} text="Awaiting verification" />
            </div>
            <button
              onClick={() => {
                dispatch({ type: 'set-mode', mode: 'review' });
                dispatch({ type: 'dock', patch: { tab: 'review-queue', expanded: true } });
              }}
              style={{
                marginTop: 8,
                background: 'none',
                border: 'none',
                color: 'var(--di-accent)',
                fontSize: 11.5,
                cursor: 'pointer',
                padding: 0,
              }}
            >
              View all notes ›
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}

function StatCard({
  icon,
  value,
  label,
  border,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  border?: string;
}) {
  return (
    <div
      className="di-panel"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '12px 14px',
        borderRadius: 10,
        borderColor: border ? `color-mix(in srgb, ${border} 45%, transparent)` : undefined,
      }}
    >
      {icon}
      <div>
        <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--di-font-mono)', lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 11.5, color: 'var(--di-text2)' }}>{label}</div>
      </div>
    </div>
  );
}

function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ color: 'var(--di-text2)' }}>{label}</span>
    </div>
  );
}

function BarRow({ label, count, max, color }: { label: string; count: number; max: number; color: string }) {
  const widthPct = Math.max(4, (count / max) * 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}>
      <span style={{ width: 90, flexShrink: 0, color: 'var(--di-text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 7, background: 'var(--di-panel2)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${widthPct}%`, height: '100%', background: color, borderRadius: 4 }} />
      </div>
      <span className="di-mono" style={{ width: 26, textAlign: 'right', color: 'var(--di-text)' }}>
        {count}
      </span>
    </div>
  );
}

function NoteRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--di-text2)' }}>
      {icon}
      <span>{text}</span>
    </div>
  );
}
