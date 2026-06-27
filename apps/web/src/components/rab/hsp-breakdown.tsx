'use client';

import type { HSPBreakdown } from '@paax/schemas';
import { StatusPill } from '@/components/ui';
import { formatRupiah, formatNumber, formatPercent } from '@/lib/format';

/**
 * Rincian Harga Satuan Pekerjaan yang auditable (bahan/upah/alat + komponen).
 * Semua angka berasal dari engine (services/core-engine) — komponen ini hanya
 * menampilkan & memformat. Dipakai bersama oleh editor RAB & browser AHSP.
 */

export const hspCategoryTone: Record<string, 'ok' | 'warn' | 'dng' | 'neutral'> = {
  bahan: 'ok',
  upah: 'warn',
  alat: 'dng',
};

export function HspBreakdownBody({ data }: { data: HSPBreakdown }) {
  const th: React.CSSProperties = {
    padding: '9px 12px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.05em', color: 'var(--text2)', borderBottom: '1px solid var(--border)',
  };
  const td: React.CSSProperties = { padding: '9px 12px', borderBottom: '1px solid var(--border-soft)' };
  return (
    <div>
      <div style={{ fontSize: 11.5, color: 'var(--text3)', marginBottom: 12 }}>
        {data.ahsp_code} · per {data.unit}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }}>Resource</th>
              <th style={{ ...th, textAlign: 'left' }}>Kategori</th>
              <th style={{ ...th, textAlign: 'right' }}>Koefisien</th>
              <th style={{ ...th, textAlign: 'right' }}>Harga Sat.</th>
              <th style={{ ...th, textAlign: 'right' }}>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {data.components.map((c) => (
              <tr key={c.resource_code}>
                <td style={{ ...td, color: 'var(--text)' }}>
                  {c.resource_name} <span style={{ color: 'var(--text3)' }}>[{c.unit}]</span>
                </td>
                <td style={td}>
                  <StatusPill tone={hspCategoryTone[c.category] ?? 'neutral'}>{c.category}</StatusPill>
                </td>
                <td className="pax-mono" style={{ ...td, textAlign: 'right', color: 'var(--text)' }}>{formatNumber(c.coefficient, 4)}</td>
                <td className="pax-mono" style={{ ...td, textAlign: 'right', color: 'var(--text)' }}>{formatRupiah(c.unit_price)}</td>
                <td className="pax-mono" style={{ ...td, textAlign: 'right', color: 'var(--text)' }}>{formatRupiah(c.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginTop: 14 }}>
        <MiniStat label="Bahan (A)" value={formatRupiah(data.bahan)} />
        <MiniStat label="Upah (B)" value={formatRupiah(data.upah)} />
        <MiniStat label="Alat (C)" value={formatRupiah(data.alat)} />
        <MiniStat label="Base (A+B+C)" value={formatRupiah(data.base)} />
        <MiniStat label={`Overhead+Profit (${formatPercent(data.overhead_profit * 100)})`} value={formatRupiah(data.overhead_profit_value)} />
        <MiniStat label={`HSP / ${data.unit}`} value={formatRupiah(data.hsp)} highlight />
      </div>
    </div>
  );
}

function MiniStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', padding: '10px 12px' }}>
      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text3)' }}>{label}</div>
      <div className="pax-mono" style={{ marginTop: 4, fontSize: 14, fontWeight: 700, color: highlight ? 'var(--ok-dot)' : 'var(--text)' }}>{value}</div>
    </div>
  );
}
