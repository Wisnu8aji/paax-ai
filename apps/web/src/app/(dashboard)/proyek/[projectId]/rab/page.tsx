'use client';

import Link from 'next/link';
import { Info, FlaskConical } from 'lucide-react';
import { Card, StatusPill } from '@/components/ui';
import { formatRupiah, formatNumber, formatPercent } from '@/lib/format';
import { boqLines, rabSummary, rabChapter } from '@/lib/mock/workspace';

export default function ProjectRabPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Placeholder note — these numbers are NOT engine-computed */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          padding: '12px 14px',
          borderRadius: 12,
          background: 'var(--warn-bg)',
          border: '1px solid var(--warn-bd)',
        }}
      >
        <Info size={16} color="var(--warn-fg)" style={{ marginTop: 1, flexShrink: 0 }} />
        <div style={{ fontSize: 12, color: 'var(--warn-fg)', lineHeight: 1.5 }}>
          <strong>Data contoh / placeholder.</strong> Angka pada halaman ini hanya untuk tampilan
          desain dan <strong>bukan</strong> hasil perhitungan engine. RAB/HSP/Kurva-S yang dapat
          diaudit dihitung oleh engine deterministik di{' '}
          <Link href="/rab-tester" style={{ color: 'var(--warn-fg)', fontWeight: 700, textDecoration: 'underline' }}>
            Uji RAB (v0.6)
          </Link>
          .
        </div>
      </div>

      <Card padding={18}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Rencana Anggaran Biaya — BOQ</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>Bab {rabChapter}</div>
          </div>
          <Link href="/rab-tester" style={{ textDecoration: 'none' }}>
            <StatusPill tone="ok"><FlaskConical size={12} /> Engine Deterministik</StatusPill>
          </Link>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['No', 'Uraian Pekerjaan', 'Volume', 'Sat.', 'HSP (Rp)', 'Jumlah (Rp)', 'Bobot'].map((h, i) => (
                  <th
                    key={h}
                    style={{ textAlign: i >= 2 && i !== 3 ? 'right' : 'left', padding: '11px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text2)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {boqLines.map((ln) => (
                <tr key={ln.no} className="pax-row-hover">
                  <td className="pax-mono" style={{ padding: '11px 14px', color: 'var(--text3)', borderBottom: '1px solid var(--border-soft)' }}>{ln.no}</td>
                  <td style={{ padding: '11px 14px', color: 'var(--text)', borderBottom: '1px solid var(--border-soft)' }}>{ln.uraian}</td>
                  <td className="pax-mono" style={{ padding: '11px 14px', textAlign: 'right', color: 'var(--text)', borderBottom: '1px solid var(--border-soft)' }}>{formatNumber(ln.volume)}</td>
                  <td style={{ padding: '11px 14px', color: 'var(--text2)', borderBottom: '1px solid var(--border-soft)' }}>{ln.satuan}</td>
                  <td className="pax-mono" style={{ padding: '11px 14px', textAlign: 'right', color: 'var(--text)', borderBottom: '1px solid var(--border-soft)' }}>{formatRupiah(ln.hsp)}</td>
                  <td className="pax-mono" style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 600, color: 'var(--text)', borderBottom: '1px solid var(--border-soft)' }}>{formatRupiah(ln.jumlah)}</td>
                  <td className="pax-mono" style={{ padding: '11px 14px', textAlign: 'right', color: 'var(--text2)', borderBottom: '1px solid var(--border-soft)' }}>{formatPercent(ln.bobot)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5} style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 600, color: 'var(--text2)' }}>Subtotal</td>
                <td className="pax-mono" style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 600, color: 'var(--text)' }}>{formatRupiah(rabSummary.subtotal)}</td>
                <td />
              </tr>
              <tr>
                <td colSpan={5} style={{ padding: '6px 14px', textAlign: 'right', color: 'var(--text2)' }}>PPN {formatPercent(rabSummary.ppnRate * 100)}</td>
                <td className="pax-mono" style={{ padding: '6px 14px', textAlign: 'right', color: 'var(--text)' }}>{formatRupiah(rabSummary.ppn)}</td>
                <td />
              </tr>
              <tr>
                <td colSpan={5} style={{ padding: '11px 14px', textAlign: 'right', fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>RAB Total</td>
                <td className="pax-mono" style={{ padding: '11px 14px', textAlign: 'right', fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>{formatRupiah(rabSummary.total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}
