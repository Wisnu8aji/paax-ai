'use client';

/** Professional Civil Work Item table.
 * Values are rendered exactly as delivered by the backend projection/Core Engine;
 * this component never performs engineering calculations.
 */
import { Fragment, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Download, ExternalLink,
  FileStack, Layers, X,
} from 'lucide-react';
import { civilWorkItemsExportUrl } from '../../drawing-intelligence-api';
import type { QuantityItem, QuantityRowStatus } from '../di-types';
import { useWorkspace } from '../workspace-store';

const STATUS_PILL: Record<QuantityRowStatus, { label: string; tone?: string }> = {
  verified: { label: 'Terverifikasi', tone: 'ok' },
  'needs-review': { label: 'Perlu review', tone: 'warn' },
  'ai-detected': { label: 'Kandidat AI', tone: 'info' },
  draft: { label: 'Draft' },
  conflict: { label: 'Data rancu', tone: 'err' },
  unsupported: { label: 'Belum didukung' },
  excluded: { label: 'Dikecualikan' },
};

type GroupMode = 'location-wbs' | 'wbs-only' | 'flat';
type ScopeFilter = 'all' | 'substructure' | 'l1' | 'l2' | 'roof' | 'structure' | 'architecture' | 'mep' | 'column' | 'beam';

const FILTERS: Array<{ id: ScopeFilter; label: string }> = [
  { id: 'all', label: 'Semua item' },
  { id: 'substructure', label: 'Substruktur' },
  { id: 'l1', label: 'Lantai 1' },
  { id: 'l2', label: 'Lantai 2' },
  { id: 'roof', label: 'Atap' },
  { id: 'structure', label: 'Struktur' },
  { id: 'architecture', label: 'Arsitektur' },
  { id: 'mep', label: 'MEP' },
  { id: 'column', label: 'Kolom' },
  { id: 'beam', label: 'Balok' },
];

function matchesFilter(item: QuantityItem, filter: ScopeFilter): boolean {
  const floor = item.floorLabel.toLowerCase();
  const wbs = `${item.wbsSection} ${item.wbsGroup}`.toLowerCase();
  if (filter === 'all') return true;
  if (filter === 'substructure') return floor.includes('substruktur') || wbs.includes('fondasi');
  if (filter === 'l1') return floor.includes('lantai 1');
  if (filter === 'l2') return floor.includes('lantai 2');
  if (filter === 'roof') return floor.includes('atap');
  if (filter === 'structure') return wbs.includes('struktur') || ['column', 'beam', 'slab', 'foundation'].includes(item.category);
  if (filter === 'architecture') return wbs.includes('arsitektur');
  if (filter === 'mep') return wbs.includes('mep');
  return item.category === filter;
}

function groupItems(items: QuantityItem[], mode: GroupMode): Array<{ title: string; rows: QuantityItem[] }> {
  if (mode === 'flat') return [{ title: 'Semua item pekerjaan', rows: items }];
  const groups = new Map<string, QuantityItem[]>();
  for (const item of items) {
    const title = mode === 'wbs-only' ? item.wbsSection : item.wbsGroup;
    groups.set(title, [...(groups.get(title) ?? []), item]);
  }
  return Array.from(groups, ([title, rows]) => ({ title, rows }));
}

export function QuantitiesMode() {
  const { state, dispatch } = useWorkspace();
  const [groupMode, setGroupMode] = useState<GroupMode>('location-wbs');
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(true);

  const quantities = useMemo(
    () => state.quantities.filter((item) => matchesFilter(item, scopeFilter)),
    [state.quantities, scopeFilter],
  );
  const groups = useMemo(() => groupItems(quantities, groupMode), [quantities, groupMode]);
  const total = quantities.length;
  const nVerified = quantities.filter((q) => q.status === 'verified').length;
  const nReview = quantities.filter((q) => ['needs-review', 'conflict'].includes(q.status)).length;
  const nFloors = new Set(quantities.map((q) => q.floorLabel)).size;
  const activeFilterLabel = FILTERS.find((entry) => entry.id === scopeFilter)?.label ?? 'Semua item';

  const byFloor = useMemo(() => {
    const map = new Map<string, number>();
    for (const q of quantities) map.set(q.floorLabel, (map.get(q.floorLabel) ?? 0) + 1);
    return Array.from(map, ([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  }, [quantities]);
  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const q of quantities) map.set(q.category, (map.get(q.category) ?? 0) + 1);
    return Array.from(map, ([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  }, [quantities]);

  function toggleGroup(title: string) {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(title)) next.delete(title); else next.add(title);
      return next;
    });
  }

  function openFirstSource(item: QuantityItem) {
    const firstPage = item.sourcePages?.[0];
    if (!firstPage) {
      dispatch({ type: 'set-mode', mode: 'review' });
      return;
    }
    const target = state.sheets.find((sheet) => sheet.pageNumber === firstPage);
    if (target) {
      dispatch({ type: 'set-active-sheet', sheetId: target.id });
      dispatch({ type: 'set-mode', mode: 'review' });
      dispatch({ type: 'set-status', message: `Membuka sumber Halaman ${firstPage} untuk ${item.workItem}` });
    } else {
      dispatch({ type: 'set-status', message: `Sumber Halaman ${firstPage} belum terhubung ke viewer.` });
    }
  }

  return (
    <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex' }}>
      <section style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(150px, 1fr))', gap: 12 }}>
          <StatCard icon={<FileStack size={18} color="var(--di-accent)" />} value={total} label="item pekerjaan" border="var(--di-accent)" />
          <StatCard icon={<CheckCircle2 size={18} color="var(--di-ok)" />} value={nVerified} label="terverifikasi" />
          <StatCard icon={<AlertTriangle size={18} color="var(--di-warn)" />} value={nReview} label="perlu keputusan" />
          <StatCard icon={<Layers size={18} color="var(--di-info)" />} value={nFloors} label="lokasi/tingkat" />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ fontFamily: 'var(--di-font-display)', fontSize: 15, margin: 0 }}>Daftar Item Pekerjaan &amp; Perhitungan</h2>
            <div style={{ marginTop: 4, fontSize: 11.5, color: 'var(--di-text3)' }}>
              Nilai terverifikasi berasal dari Measurement Facts dan Core Engine; kode internal disembunyikan dari tabel utama.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {state.projectId && (
              <a className="di-btn di-btn-ghost" href={civilWorkItemsExportUrl(state.projectId)} style={{ textDecoration: 'none' }}>
                <Download size={13} /> Perhitungan Excel
              </a>
            )}
            <div style={{ position: 'relative' }}>
              <button className="di-btn di-btn-ghost" onClick={() => setOptionsOpen((open) => !open)}>
                {activeFilterLabel} <ChevronDown size={13} />
              </button>
              {optionsOpen && (
                <div className="di-panel di-rise" style={{ position: 'absolute', top: 36, right: 0, zIndex: 30, borderRadius: 8, minWidth: 245, padding: 6 }}>
                  <div className="di-section-title" style={{ padding: '5px 8px' }}>Tampilkan berdasarkan scope</div>
                  {FILTERS.map((option) => (
                    <button key={option.id} onClick={() => { setScopeFilter(option.id); setOptionsOpen(false); }} style={menuStyle(scopeFilter === option.id)}>
                      {option.label}
                    </button>
                  ))}
                  <div className="di-section-title" style={{ padding: '10px 8px 5px' }}>Pengelompokan</div>
                  {([
                    ['location-wbs', 'Lokasi & WBS'], ['wbs-only', 'WBS saja'], ['flat', 'Daftar datar'],
                  ] as Array<[GroupMode, string]>).map(([id, label]) => (
                    <button key={id} onClick={() => { setGroupMode(id); setOptionsOpen(false); }} style={menuStyle(groupMode === id)}>{label}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="di-panel" style={{ borderRadius: 10, overflowX: 'auto' }}>
          <table className="di-table" style={{ minWidth: 1240 }}>
            <thead><tr>
              <th style={{ width: 28 }} />
              <th>Item pekerjaan</th><th>Lokasi / Lantai</th><th>Jenis</th><th>Satuan</th><th>Ukuran</th>
              <th style={{ textAlign: 'right' }}>Jumlah</th><th>Formula</th><th style={{ textAlign: 'right' }}>Volume / Hasil</th>
              <th>Status</th><th>Sumber</th><th style={{ width: 28 }} />
            </tr></thead>
            <tbody>
              {groups.map((group, index) => {
                const collapsed = collapsedGroups.has(group.title);
                return <Fragment key={group.title}>
                  {groupMode !== 'flat' && <tr onClick={() => toggleGroup(group.title)} style={{ background: 'var(--di-panel2)', cursor: 'pointer' }}>
                    <td colSpan={12}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                      <span className="di-mono" style={{ color: 'var(--di-text3)' }}>{index + 1}</span>
                      <strong style={{ fontSize: 12.5 }}>{group.title}</strong>
                      <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--di-text2)' }}>{group.rows.length} item</span>
                    </div></td>
                  </tr>}
                  {!collapsed && group.rows.map((item) => {
                    const pill = STATUS_PILL[item.status];
                    return <tr key={item.id} data-selected={state.selectedQuantityId === item.id}
                      onMouseEnter={() => setHoveredRowId(item.id)} onMouseLeave={() => setHoveredRowId(null)}
                      onClick={() => dispatch({ type: 'select-quantity', quantityId: item.id })}>
                      <td />
                      <td><strong>{item.workItem}</strong>{item.technicalCode && <div className="di-mono" style={{ fontSize: 10, color: 'var(--di-text3)', marginTop: 3 }}>Tipe {item.technicalCode}</div>}</td>
                      <td>{item.floorLabel}</td><td style={{ textTransform: 'capitalize' }}>{categoryLabel(item.category)}</td>
                      <td className="di-mono">{item.unit}</td><td className="di-mono">{item.dimensionsDisplay ?? '-'}</td>
                      <td className="di-mono" style={{ textAlign: 'right' }}>{item.countDisplay ?? '-'}</td>
                      <td className="di-mono" style={{ fontSize: 11 }}>{item.formula}</td>
                      <td className="di-mono" style={{ textAlign: 'right', fontWeight: 700 }}>{item.resultDisplay ?? item.qty}</td>
                      <td><span className="di-pill" data-tone={pill.tone}>{pill.label}</span></td>
                      <td style={{ maxWidth: 250, fontSize: 11, color: 'var(--di-text2)' }}>{item.source}</td>
                      <td onClick={(event) => event.stopPropagation()}>{hoveredRowId === item.id && <button className="di-icon-btn" title="Buka sumber/review" onClick={() => openFirstSource(item)}><ExternalLink size={13} /></button>}</td>
                    </tr>;
                  })}
                </Fragment>;
              })}
              {quantities.length === 0 && <tr><td colSpan={12} style={{ padding: 32, textAlign: 'center', color: 'var(--di-text3)' }}>Tidak ada item pada filter ini.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {inspectorOpen ? <aside className="di-panel" style={{ width: 300, flexShrink: 0, padding: 16, overflow: 'auto', borderTop: 0, borderBottom: 0, borderRight: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><strong style={{ fontSize: 13 }}>Ringkasan Klasifikasi</strong><button className="di-icon-btn" onClick={() => setInspectorOpen(false)}><X size={15} /></button></div>
        <SummaryBlock title="Menurut lantai" entries={byFloor} />
        <SummaryBlock title="Menurut jenis" entries={byCategory.map((entry) => ({ ...entry, label: categoryLabel(entry.label) }))} />
        <div style={{ marginTop: 18, padding: 12, borderRadius: 8, background: 'var(--di-panel2)', fontSize: 11.5, lineHeight: 1.55, color: 'var(--di-text2)' }}>
          <strong style={{ color: 'var(--di-text)' }}>Aturan authority</strong><br />
          Draft/kandidat AI tidak masuk Core Engine. Item berstatus “Terverifikasi” memiliki sumber lembar dan formula yang dapat diaudit.
        </div>
      </aside> : null}
    </div>
  );
}

function categoryLabel(value: string): string {
  const labels: Record<string, string> = { column: 'Kolom', beam: 'Balok', slab: 'Pelat', wall: 'Dinding', foundation: 'Fondasi', door: 'Pintu', window: 'Jendela', room: 'Ruang' };
  return labels[value] ?? value;
}
function menuStyle(active: boolean): CSSProperties { return { display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', borderRadius: 6, background: active ? 'var(--di-accent-soft)' : 'transparent', color: active ? 'var(--di-accent)' : 'var(--di-text)', fontSize: 12, border: 0, cursor: 'pointer' }; }
function StatCard({ icon, value, label, border }: { icon: ReactNode; value: number; label: string; border?: string }) { return <div className="di-panel" style={{ padding: 14, borderRadius: 10, borderLeft: `3px solid ${border ?? 'var(--di-border)'}` }}><div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>{icon}<div><div className="di-mono" style={{ fontWeight: 800, fontSize: 20 }}>{value}</div><div style={{ color: 'var(--di-text3)', fontSize: 11 }}>{label}</div></div></div></div>; }
function SummaryBlock({ title, entries }: { title: string; entries: Array<{ label: string; count: number }> }) { const max = Math.max(1, ...entries.map((entry) => entry.count)); return <div style={{ marginTop: 20 }}><div className="di-section-title" style={{ marginBottom: 8 }}>{title}</div>{entries.map((entry) => <div key={entry.label} style={{ marginBottom: 8 }}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5 }}><span>{entry.label}</span><span className="di-mono">{entry.count}</span></div><div style={{ height: 5, marginTop: 4, borderRadius: 999, background: 'var(--di-panel2)' }}><div style={{ width: `${(entry.count / max) * 100}%`, height: '100%', borderRadius: 999, background: 'var(--di-accent)' }} /></div></div>)}</div>; }
