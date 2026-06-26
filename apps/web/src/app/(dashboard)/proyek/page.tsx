'use client';

import { useRouter } from 'next/navigation';
import { Plus, MapPin } from 'lucide-react';
import { Card, StatCard, StatusPill, Button, ProgressBar, PageHeader } from '@/components/ui';
import { useShell } from '@/components/app-shell/shell-context';
import { formatRupiah } from '@/lib/format';
import { projects, proyekStats, statusTone } from '@/lib/mock/workspace';

export default function ProyekPage() {
  const router = useRouter();
  const { openOverlay } = useShell();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title="Proyek"
        subtitle="Kelola semua proyek konstruksi Anda"
        actions={
          <Button onClick={() => openOverlay('newProject')}>
            <Plus size={15} /> Buat Proyek Baru
          </Button>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }} className="pax-grid-4">
        {proyekStats.map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} sub={s.sub} />
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }} className="pax-grid-3">
        {projects.map((p) => (
          <Card key={p.id} hover padding={18} onClick={() => router.push(`/proyek/${p.id}`)}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 9 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{p.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3, fontSize: 11, color: 'var(--text2)' }}>
                  <MapPin size={12} /> {p.location}
                </div>
              </div>
              <StatusPill tone={statusTone[p.status]}>{p.statusLabel}</StatusPill>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 11, minHeight: 34 }}>{p.description}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11 }}>
              <StatusPill tone="neutral">{p.type}</StatusPill>
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>· {p.client}</span>
            </div>
            <div className="pax-mono" style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)', marginBottom: 11 }}>{formatRupiah(p.rabValue)}</div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, marginBottom: 4 }}>
                <span style={{ color: 'var(--text2)' }}>Progress</span>
                <span className="pax-mono" style={{ fontWeight: 600, color: 'var(--text)' }}>{p.progress}%</span>
              </div>
              <ProgressBar value={p.progress} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid var(--border-soft)' }}>
              <div className="pax-mono" style={{ display: 'flex', gap: 12, fontSize: 10.5 }}>
                <span style={{ color: 'var(--warn-fg)' }}>⚠ {p.warnings}</span>
                <span style={{ color: 'var(--text2)' }}>♥ {p.health}%</span>
              </div>
              <span style={{ fontSize: 10.5, color: 'var(--text3)' }}>{p.lastActivity}</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
