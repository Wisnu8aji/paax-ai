'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { Card, StatusPill, PageHeader } from '@/components/ui';
import { ahspRows } from '@/lib/mock/workspace';

export default function DatabaseAhspPage() {
  const [q, setQ] = useState('');
  const rows = ahspRows.filter(
    (r) => r.name.toLowerCase().includes(q.toLowerCase()) || r.code.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader title="Database AHSP" subtitle="Acuan koefisien Analisa Harga Satuan Pekerjaan (Cipta Karya)" />

      <Card padding={0}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: 14, borderBottom: '1px solid var(--border-soft)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 1, maxWidth: 360, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px' }}>
            <Search size={16} color="var(--text3)" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari kode / uraian AHSP…"
              aria-label="Cari AHSP"
              style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, fontSize: 13, color: 'var(--text)' }}
            />
          </div>
          <StatusPill tone="neutral" mono>{rows.length} item</StatusPill>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Kode', 'Uraian Pekerjaan', 'Satuan', 'Bidang'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '11px 16px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text2)', borderBottom: '1px solid var(--border)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.code} className="pax-row-hover">
                  <td className="pax-mono" style={{ padding: '11px 16px', color: 'var(--text2)', borderBottom: '1px solid var(--border-soft)' }}>{r.code}</td>
                  <td style={{ padding: '11px 16px', color: 'var(--text)', borderBottom: '1px solid var(--border-soft)' }}>{r.name}</td>
                  <td style={{ padding: '11px 16px', color: 'var(--text2)', borderBottom: '1px solid var(--border-soft)' }}>{r.unit}</td>
                  <td style={{ padding: '11px 16px', color: 'var(--text2)', borderBottom: '1px solid var(--border-soft)' }}>{r.bidang}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p style={{ fontSize: 11, color: 'var(--text3)' }}>Data contoh — koefisien resmi AHSP dikelola di repositori data engine.</p>
    </div>
  );
}
