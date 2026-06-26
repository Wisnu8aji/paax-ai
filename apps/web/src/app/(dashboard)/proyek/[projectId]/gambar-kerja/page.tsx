'use client';

import Link from 'next/link';
import { FileImage, UploadCloud, ArrowRight } from 'lucide-react';
import { Card, StatCard, StatusPill, Button, type PillTone } from '@/components/ui';
import { useShell } from '@/components/app-shell/shell-context';
import { drawingSummary, drawings } from '@/lib/mock/workspace';

const statusMap: Record<string, { tone: PillTone; label: string }> = {
  analyzed: { tone: 'ok', label: 'DIANALISIS' },
  pending: { tone: 'warn', label: 'MENUNGGU' },
  failed: { tone: 'dng', label: 'GAGAL' },
};

export default function ProjectGambarKerjaPage() {
  const { openOverlay } = useShell();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }} className="pax-grid-4">
        {drawingSummary.map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} sub={s.sub} />
        ))}
      </div>

      <Card padding={18}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Gambar Proyek</span>
          <Button variant="secondary" onClick={() => openOverlay('upload')}>
            <UploadCloud size={14} /> Unggah
          </Button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {drawings.map((d) => {
            const st = statusMap[d.status];
            return (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <span style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)' }}>
                  <FileImage size={18} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{d.name}</div>
                  <div className="pax-mono" style={{ fontSize: 11, color: 'var(--text3)' }}>{d.sheet} · {d.type}</div>
                </div>
                <StatusPill tone={st.tone}>{st.label}</StatusPill>
              </div>
            );
          })}
        </div>
      </Card>

      <Link href="/gambar-kerja-ai" style={{ textDecoration: 'none' }}>
        <Card padding={16} hover>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 12.5, color: 'var(--text2)' }}>Buka workspace analisis gambar AI lengkap</div>
            <ArrowRight size={16} color="var(--text2)" />
          </div>
        </Card>
      </Link>
      <p style={{ fontSize: 11, color: 'var(--text3)' }}>Data contoh — analisis gambar berjalan dalam mode demo fallback.</p>
    </div>
  );
}
