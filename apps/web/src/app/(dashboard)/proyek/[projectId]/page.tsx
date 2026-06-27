'use client';

import { useParams } from 'next/navigation';
import { useMemo } from 'react';
import { TrendingUp, AlertTriangle, Activity, CheckCircle2 } from 'lucide-react';
import { Card, StatCard, ProgressBar } from '@/components/ui';
import { formatRupiah } from '@/lib/format';
import { projects as mockProjects, scheduleTasks, type MockProject } from '@/lib/mock/workspace';

export default function ProjectOverviewPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const project: MockProject = useMemo(
    () => mockProjects.find((p) => p.id === projectId) ?? { ...mockProjects[0], id: projectId },
    [projectId],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }} className="pax-grid-4">
        <StatCard label="Nilai RAB" value={formatRupiah(project.rabValue)} sub="data contoh" />
        <StatCard label="Progress" value={`${project.progress}%`} sub="tertimbang" dot="var(--ok-dot)" />
        <StatCard label="Warning" value={String(project.warnings)} sub="terbuka" dot="var(--warn-fg)" />
        <StatCard label="Health" value={`${project.health}%`} sub="indeks proyek" dot="var(--ok-dot)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 14 }} className="pax-grid-2">
        <Card padding={18}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 14 }}>Milestone Pekerjaan</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {scheduleTasks.map((t) => (
              <div key={t.wbs} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ color: t.progress === 100 ? 'var(--ok-dot)' : 'var(--text3)' }}>
                  {t.progress === 100 ? <CheckCircle2 size={18} /> : <Activity size={18} />}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                    <span style={{ color: 'var(--text)', fontWeight: 600 }}>{t.name}</span>
                    <span className="pax-mono" style={{ color: 'var(--text2)' }}>{t.progress}%</span>
                  </div>
                  <ProgressBar value={t.progress} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card padding={18}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <TrendingUp size={16} color="var(--ok-dot)" />
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Ringkasan</span>
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.6 }}>{project.description}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, padding: '10px 12px', borderRadius: 10, background: 'var(--warn-bg)', border: '1px solid var(--warn-bd)' }}>
            <AlertTriangle size={15} color="var(--warn-fg)" />
            <span style={{ fontSize: 12, color: 'var(--warn-fg)' }}>{project.warnings} warning menunggu tindak lanjut</span>
          </div>
        </Card>
      </div>
    </div>
  );
}
