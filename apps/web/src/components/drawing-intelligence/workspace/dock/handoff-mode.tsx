'use client';

/**
 * Handoff mode — "Verified Quantities Ready" (blueprint §21, gambar 10).
 *
 * ATURAN EMAS: item yang belum verified TIDAK ikut terkirim dan statusnya
 * tidak diubah di sini. Semua angka (count/persen) dihitung dari COUNT baris
 * status di state.quantities — bukan perhitungan kuantitas teknik.
 */

import { Fragment, useMemo, useState } from 'react';
import { CheckCircle2, SendHorizonal, Table2, Download, ChevronDown, ChevronRight } from 'lucide-react';
import { useWorkspace } from '../workspace-store';
import type { QuantityItem } from '../di-types';
import { HandoffConfirmModal } from './handoff-confirm-modal';
import { useDockToast, DockToastHost } from './dock-toast';
import { RabProposalReviewPanel } from './rab-proposal-review-panel';
import { canHandoffQuantity } from '../quantity-authority';

function disciplineFromCategory(category: QuantityItem['category']): 'STR' | 'ARC' | 'MEP' {
  if (category === 'door' || category === 'window' || category === 'room') return 'ARC';
  if (category === 'mep-point') return 'MEP';
  return 'STR';
}

function topLevelGroup(wbsGroup: string): string {
  const g = wbsGroup.toLowerCase();
  if (g.includes('substructure') || g.includes('foundation')) return 'SUBSTRUCTURE';
  if (g.includes('superstructure') || g.includes('roof')) return 'SUPERSTRUCTURE';
  if (g.includes('architecture') || g.includes('finish')) return 'ARCHITECTURE';
  if (g.includes('mep')) return 'MEP';
  if (g.includes('site') || g.includes('earthwork')) return 'SUBSTRUCTURE';
  return 'ARCHITECTURE';
}

export function HandoffMode({ projectName = 'Proyek aktif' }: { projectName?: string }) {
  const { state, dispatch } = useWorkspace();
  const { quantities } = state;
  const { toasts, showToast } = useDockToast();

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  if (state.handoff.reviewPanelOpen) {
    return <RabProposalReviewPanel />;
  }

  const total = quantities.length;
  const eligibleQuantities = quantities.filter((q) => canHandoffQuantity({ sourceAuthority: q.sourceAuthority ?? 'none', status: q.status, unit: q.unit }));
  const nVerified = eligibleQuantities.length;
  const nReview = quantities.filter((q) => q.status === 'needs-review').length;
  const pctVerified = total > 0 ? Math.round((nVerified / total) * 100) : 0;
  const pctReview = total > 0 ? Math.round((nReview / total) * 100) : 0;

  const totalSheets = state.sheets.length;
  const totalFloors = useMemo(() => {
    const floors = new Set(state.sheets.map(s => s.floorId).filter(Boolean));
    return floors.size;
  }, [state.sheets]);

  const groups = useMemo(() => {
    const map = new Map<string, QuantityItem[]>();
    for (const q of quantities) {
      const g = topLevelGroup(q.wbsGroup);
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(q);
    }
    const order = ['SUBSTRUCTURE', 'SUPERSTRUCTURE', 'ARCHITECTURE', 'MEP'];
    return order.filter((o) => map.has(o)).map((title) => ({ title, rows: map.get(title)! }));
  }, [quantities]);

  function toggleGroup(title: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }

  const sentDateLabel = useMemo(() => {
    if (state.handoff.sentAt) {
      const d = new Date(state.handoff.sentAt);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    return '';
  }, [state.handoff.sentAt]);

  return (
    <section style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ flex: 1, overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {state.handoff.sent && (
          <div
            className="di-rise"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              borderRadius: 10,
              background: 'var(--di-ok-bg)',
              border: '1px solid var(--di-ok-bd)',
              color: 'var(--di-ok)',
              fontSize: 12.5,
              fontWeight: 600,
            }}
          >
            <CheckCircle2 size={15} />
            {nVerified} quantities sent for approval (Proposal ID: {state.handoff.proposalId || 'N/A'}) — {sentDateLabel}
          </div>
        )}

        {/* Hero header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <CheckCircle2 size={44} color="var(--di-ok)" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontFamily: 'var(--di-font-display)', fontSize: 20, margin: 0 }}>Verified Quantities Ready</h1>
            <p style={{ fontSize: 12.5, color: 'var(--di-text2)', margin: '6px 0 0', maxWidth: 560 }}>
              Only Core Engine-authoritative quantities are eligible. Review, blocked, and evidence-only rows remain visible but cannot be handed off.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button
              className="di-btn di-btn-ok"
              onClick={() => dispatch({ type: 'handoff', patch: { confirmOpen: true } })}
            >
              <SendHorizonal size={14} /> {state.handoff.sent ? 'Send again' : 'Send verified quantities'}
            </button>
            <button className="di-btn" onClick={() => showToast('Opening Cost & Quantity…')}>
              <Table2 size={14} /> Open Cost &amp; Quantity
            </button>
            <button className="di-btn" onClick={() => showToast('Review report exported')}>
              <Download size={14} /> Export review report
            </button>
          </div>
        </div>

        {/* 5 stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
          <HandoffStat title="Sheets analyzed" value={String(totalSheets)} sub={totalSheets > 0 ? projectName : "Belum ada gambar"} ok={totalSheets > 0} />
          <HandoffStat title="Verified items" value={String(nVerified)} sub={`${pctVerified}% of total items`} ok />
          <HandoffStat title="Needs review" value={String(nReview)} sub={`${pctReview}% of total items`} warn />
          <HandoffStat title="Total levels grouped" value={String(totalFloors)} sub={totalFloors > 0 ? "Berdasarkan metadata gambar" : "Level belum tersedia"} ok={totalFloors > 0} />
          <HandoffStat title="Ready for Cost & Quantity" value={String(nVerified)} sub={nVerified > 0 ? "Core Engine-authoritative rows" : "No eligible rows yet"} ok={nVerified > 0} warn={nVerified === 0} />
        </div>

        {/* Verified Work Package Summary */}
        <div>
          <h2 style={{ fontFamily: 'var(--di-font-display)', fontSize: 15, margin: '0 0 10px' }}>
            Verified Work Package Summary
          </h2>
          <div className="di-panel" style={{ borderRadius: 10, overflow: 'hidden' }}>
            <table className="di-table">
              <thead>
                <tr>
                  <th>Work Package</th>
                  <th>Discipline</th>
                  <th style={{ textAlign: 'right' }}>Verified Items</th>
                  <th>Quantity (Primary Unit)</th>
                  <th style={{ textAlign: 'right' }}>Needs Review</th>
                  <th>Verification</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => {
                  const collapsed = collapsedGroups.has(g.title);
                  const verifiedCount = g.rows.filter((r) => canHandoffQuantity({ sourceAuthority: r.sourceAuthority ?? 'none', status: r.status, unit: r.unit })).length;
                  const reviewCount = g.rows.filter((r) => r.status === 'needs-review').length;
                  const groupPct = g.rows.length > 0 ? Math.round((verifiedCount / g.rows.length) * 100) : 0;
                  const disciplines = new Set(g.rows.map((r) => disciplineFromCategory(r.category)));
                  const groupDiscipline = disciplines.size === 1 ? Array.from(disciplines)[0] : '—';
                  return (
                    <Fragment key={g.title}>
                      <tr onClick={() => toggleGroup(g.title)} style={{ background: 'var(--di-panel2)', cursor: 'pointer' }}>
                        <td colSpan={7}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                            <strong style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                              {g.title}
                            </strong>
                          </div>
                        </td>
                      </tr>
                      {!collapsed &&
                        g.rows.map((q) => (
                          <tr key={q.id}>
                            <td style={{ paddingLeft: 26 }}>{q.workItem}</td>
                            <td>
                              <span className="di-disc" data-d={disciplineFromCategory(q.category)}>
                                {disciplineFromCategory(q.category)}
                              </span>
                            </td>
                            <td className="di-mono" style={{ textAlign: 'right' }}>
                              {canHandoffQuantity({ sourceAuthority: q.sourceAuthority ?? 'none', status: q.status, unit: q.unit }) ? 1 : 0}
                            </td>
                            <td className="di-mono">{canHandoffQuantity({ sourceAuthority: q.sourceAuthority ?? 'none', status: q.status, unit: q.unit }) ? `${q.qty} ${q.unit}` : '—'}</td>
                            <td className="di-mono" style={{ textAlign: 'right' }}>
                              {q.status === 'needs-review' ? 1 : 0}
                            </td>
                            <td>
                              <MiniProgress pct={canHandoffQuantity({ sourceAuthority: q.sourceAuthority ?? 'none', status: q.status, unit: q.unit }) ? 100 : 0} />
                            </td>
                            <td>
                              <span className="di-pill" data-tone={q.status === 'verified' ? 'ok' : 'warn'}>
                                {q.status === 'verified' ? 'Verified' : 'Pending'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      {!collapsed && (
                        <tr style={{ cursor: 'default' }}>
                          <td colSpan={2} style={{ fontStyle: 'italic', color: 'var(--di-text3)' }}>
                            {g.title} totals
                          </td>
                          <td className="di-mono" style={{ textAlign: 'right', fontWeight: 700 }}>
                            {verifiedCount}
                          </td>
                          <td className="di-mono">{groupDiscipline === '—' ? '—' : '—'}</td>
                          <td className="di-mono" style={{ textAlign: 'right' }}>
                            {reviewCount}
                          </td>
                          <td>
                            <MiniProgress pct={groupPct} label={`${groupPct}%`} />
                          </td>
                          <td>
                            <span className="di-pill" data-tone="ok">
                              Verified
                            </span>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}

                {/* Total row */}
                <tr style={{ cursor: 'default', background: 'var(--di-panel2)' }}>
                  <td style={{ fontWeight: 700 }}>TOTAL</td>
                  <td>—</td>
                  <td className="di-mono" style={{ textAlign: 'right', fontWeight: 700 }}>
                    {nVerified}
                  </td>
                  <td>—</td>
                  <td className="di-mono" style={{ textAlign: 'right', fontWeight: 700 }}>
                    {nReview}
                  </td>
                  <td>
                    <MiniProgress pct={pctVerified} label={`${pctVerified}%`} />
                  </td>
                  <td>
                    <span className="di-pill" data-tone={nReview > 0 ? 'warn' : nVerified > 0 ? 'ok' : undefined}>
                      {nReview > 0 ? 'Review required' : nVerified > 0 ? 'Eligible' : 'Not ready'}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Footer strip */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 20px',
          background: 'var(--di-ok-bg)',
          borderTop: '1px solid var(--di-ok-bd)',
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--di-ok)', flexShrink: 0 }} />
        <span style={{ fontSize: 12.5 }}>
          <strong>{nVerified > 0 ? 'Eligible for handoff' : 'Handoff blocked'}</strong> — {nVerified > 0 ? `${nVerified} Core Engine-authoritative quantities can be sent.` : 'No Core Engine-authoritative quantity is available yet.'}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="di-btn di-btn-ghost" onClick={() => showToast('Opening Cost & Quantity…')}>
            View Cost &amp; Quantity
          </button>
          <button
            className="di-btn di-btn-ok"
            onClick={() => dispatch({ type: 'handoff', patch: { confirmOpen: true } })}
          >
            Send verified quantities
          </button>
        </div>
      </div>

      <HandoffConfirmModal
        nVerified={nVerified}
        nReview={nReview}
        projectName={projectName}
        onSent={() => showToast(`${nVerified} verified quantities sent to Cost & Quantity`)}
      />
      <DockToastHost toasts={toasts} />
    </section>
  );
}

function HandoffStat({
  title,
  value,
  sub,
  ok,
  warn,
}: {
  title: string;
  value: string;
  sub: string;
  ok?: boolean;
  warn?: boolean;
}) {
  const color = warn ? 'var(--di-warn)' : ok ? 'var(--di-ok)' : 'var(--di-text2)';
  return (
    <div className="di-panel" style={{ padding: '12px 14px', borderRadius: 10 }}>
      <div style={{ fontSize: 11, color: 'var(--di-text2)' }}>{title}</div>
      <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--di-font-mono)', margin: '4px 0' }}>{value}</div>
      <div style={{ fontSize: 11, color, display: 'flex', alignItems: 'center', gap: 4 }}>
        {sub} {warn ? '⚠' : '✓'}
      </div>
    </div>
  );
}

function MiniProgress({ pct, label }: { pct: number; label?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 90 }}>
      <div style={{ flex: 1, height: 6, background: 'var(--di-panel2)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--di-ok)', borderRadius: 4 }} />
      </div>
      <span className="di-mono" style={{ fontSize: 10.5, color: 'var(--di-text2)', width: 32, textAlign: 'right' }}>
        {label ?? `${pct}%`}
      </span>
    </div>
  );
}
