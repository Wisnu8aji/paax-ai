'use client';

/**
 * PAAX v0.7 — Browser Database AHSP (live dari engine).
 *
 * Read-only dari services/core-engine: daftar item AHSP + rincian koefisien & harga
 * satuan per-wilayah (HSP auditable). Tidak ada angka yang dihitung di frontend.
 */
import { useEffect, useMemo, useState } from 'react';
import { Search, Loader2, AlertCircle, Eye } from 'lucide-react';
import type { HSPBreakdown } from '@paax/schemas';
import { Card, StatusPill, PageHeader, EmptyState, Modal } from '@/components/ui';
import { HspBreakdownBody } from '@/components/rab/hsp-breakdown';
import {
  fetchAHSPList,
  fetchRegions,
  getHSPDetail,
  type AHSPListItem,
  type RegionItem,
} from '@/lib/engine';
import { ahspRows } from '@/lib/mock/workspace';

export default function DatabaseAhspPage() {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<AHSPListItem[]>([]);
  const [regions, setRegions] = useState<RegionItem[]>([]);
  const [regionCode, setRegionCode] = useState('jateng');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  const [detail, setDetail] = useState<HSPBreakdown | null>(null);
  const [detailBusy, setDetailBusy] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [list, regionList] = await Promise.all([fetchAHSPList(), fetchRegions()]);
        if (!active) return;
        setItems(list);
        setRegions(regionList);
        if (regionList[0]) setRegionCode(regionList[0].code);
        setOffline(false);
      } catch (e) {
        if (!active) return;
        // Fallback manual: engine mati → tampilkan daftar contoh agar halaman tetap berguna.
        setOffline(true);
        setItems(ahspRows.map((r) => ({ code: r.code, name: r.name, unit: r.unit, bidang: r.bidang })));
        setError(e instanceof Error ? e.message : 'Engine tidak aktif — menampilkan daftar contoh.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const rows = useMemo(
    () =>
      items.filter(
        (r) => r.name.toLowerCase().includes(q.toLowerCase()) || r.code.toLowerCase().includes(q.toLowerCase()),
      ),
    [items, q],
  );

  async function openDetail(code: string) {
    if (offline) {
      setError('Rincian koefisien butuh engine aktif (pnpm run dev:core).');
      return;
    }
    setError(null);
    setDetailBusy(code);
    try {
      setDetail(await getHSPDetail(code, regionCode));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat rincian HSP.');
    } finally {
      setDetailBusy(null);
    }
  }

  const th: React.CSSProperties = {
    textAlign: 'left', padding: '11px 16px', fontSize: 11, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text2)', borderBottom: '1px solid var(--border)',
  };
  const td: React.CSSProperties = { padding: '11px 16px', borderBottom: '1px solid var(--border-soft)' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title="Database AHSP"
        subtitle="Acuan koefisien Analisa Harga Satuan Pekerjaan — live dari engine deterministik"
      />

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderRadius: 12, background: 'var(--warn-bg)', border: '1px solid var(--warn-bd)' }}>
          <AlertCircle size={16} color="var(--warn-fg)" style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 12.5, color: 'var(--warn-fg)' }}>{error}</span>
          <button onClick={() => setError(null)} style={{ background: 'transparent', border: 'none', color: 'var(--warn-fg)', cursor: 'pointer', fontSize: 12 }}>Tutup</button>
        </div>
      )}

      <Card padding={0}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: 14, borderBottom: '1px solid var(--border-soft)', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 1, minWidth: 220, maxWidth: 360, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px' }}>
            <Search size={16} color="var(--text3)" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari kode / uraian AHSP…"
              aria-label="Cari AHSP"
              style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, fontSize: 13, color: 'var(--text)' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 11.5, color: 'var(--text2)' }}>Wilayah harga</label>
            <select className="pax-input" style={{ width: 'auto', height: 34 }} value={regionCode} disabled={offline || regions.length === 0} onChange={(e) => setRegionCode(e.target.value)}>
              {regions.length === 0 && <option value={regionCode}>{regionCode}</option>}
              {regions.map((r) => (
                <option key={r.code} value={r.code}>{r.name}</option>
              ))}
            </select>
          </div>
          <StatusPill tone={offline ? 'warn' : 'ok'} mono>
            {loading ? '…' : `${rows.length} item`}{offline ? ' · contoh' : ''}
          </StatusPill>
        </div>

        {loading ? (
          <div style={{ padding: 28, display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text3)', fontSize: 13 }}>
            <Loader2 size={16} className="animate-spin" /> Memuat AHSP dari engine…
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 18 }}>
            <EmptyState title="Tidak ada item cocok" message="Ubah kata kunci pencarian." />
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={th}>Kode</th>
                  <th style={th}>Uraian Pekerjaan</th>
                  <th style={th}>Satuan</th>
                  <th style={th}>Bidang</th>
                  <th style={{ ...th, textAlign: 'right' }}>Rincian</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.code} className="pax-row-hover">
                    <td className="pax-mono" style={{ ...td, color: 'var(--text2)' }}>{r.code}</td>
                    <td style={{ ...td, color: 'var(--text)' }}>{r.name}</td>
                    <td style={{ ...td, color: 'var(--text2)' }}>{r.unit}</td>
                    <td style={{ ...td, color: 'var(--text2)' }}>{r.bidang}</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <button
                        onClick={() => openDetail(r.code)}
                        disabled={detailBusy === r.code}
                        title="Lihat koefisien & harga (HSP)"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text2)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                      >
                        {detailBusy === r.code ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />} Koefisien
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p style={{ fontSize: 11, color: 'var(--text3)' }}>
        Koefisien & harga berasal dari repositori data engine (<span className="pax-mono">data/ahsp</span>,{' '}
        <span className="pax-mono">data/harga-satuan</span>). Pengeditan harga regional dari UI direncanakan sebagai slice tambahan.
      </p>

      {detail && (
        <Modal open onClose={() => setDetail(null)} title={`Rincian HSP — ${detail.name}`} width={760}>
          <HspBreakdownBody data={detail} />
        </Modal>
      )}
    </div>
  );
}
