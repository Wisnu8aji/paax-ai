'use client';

import { FileSpreadsheet, Download } from 'lucide-react';
import { Card, Button, StatusPill, PageHeader } from '@/components/ui';
import { reports } from '@/lib/mock/workspace';

export default function LaporanPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader title="Laporan & Export" subtitle="Hasilkan dokumen RAB, jadwal, dan jejak audit angka" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }} className="pax-grid-3">
        {reports.map((r) => (
          <Card key={r.id} padding={18} hover>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--accent)', color: 'var(--accent-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FileSpreadsheet size={18} />
              </span>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{r.title}</div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 14, minHeight: 36 }}>{r.desc}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {r.formats.map((f) => (
                <StatusPill key={f} tone="neutral" mono>{f}</StatusPill>
              ))}
              <div style={{ flex: 1 }} />
              <Button variant="secondary">
                <Download size={14} /> Export
              </Button>
            </div>
          </Card>
        ))}
      </div>
      <p style={{ fontSize: 11, color: 'var(--text3)' }}>Tampilan contoh — export belum tersambung ke backend.</p>
    </div>
  );
}
