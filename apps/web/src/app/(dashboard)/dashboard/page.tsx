'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Plus,
  Receipt,
  MapPin,
  AlertTriangle,
  Calculator,
  FileImage,
  CalendarClock,
  FileSpreadsheet,
} from 'lucide-react';
import { Card, StatCard, StatusPill, Button, ProgressBar, PageHeader, EmptyState } from '@/components/ui';
import { useShell } from '@/components/app-shell/shell-context';
import { quickActions } from '@/lib/mock/workspace';
import { useProjects } from '@/lib/projects/projects-context';
import { PROJECT_STATUS_LABEL, PROJECT_STATUS_TONE, type Project } from '@/lib/projects/types';

const quickIcons: Record<string, ReactNode> = {
  rab: <Calculator size={16} />,
  gambar: <FileImage size={16} />,
  jadwal: <CalendarClock size={16} />,
  laporan: <FileSpreadsheet size={16} />,
};

function dashboardStats(projects: Project[]) {
  const active = projects.filter((project) => project.status === 'active').length;
  const warnings = projects.reduce((sum, project) => sum + project.warnings, 0);
  const avgHealth = projects.length ? Math.round(projects.reduce((sum, project) => sum + project.health, 0) / projects.length) : 0;
  return [
    { label: 'Proyek Aktif', value: String(active), sub: `${projects.length} total proyek`, dot: 'var(--ok-dot)' },
    { label: 'Warning Terbuka', value: String(warnings), sub: 'metadata proyek', dot: warnings ? 'var(--warn-fg)' : 'var(--ok-dot)' },
    { label: 'Rata-rata Health', value: projects.length ? `${avgHealth}%` : '-', sub: 'metadata proyek', dot: 'var(--ok-dot)' },
  ];
}

function rabDisplay(project: Project): string {
  return project.rabValue === null ? 'Belum dihitung' : project.rabValue.toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
}

export default function DashboardPage() {
  const router = useRouter();
  const { openOverlay } = useShell();
  const { projects, loading } = useProjects();
  const stats = dashboardStats(projects);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title="Dashboard"
        subtitle="Ringkasan portfolio & aktivitas PAAX Workspace"
        actions={
          <Button onClick={() => openOverlay('newProject')}>
            <Plus size={15} /> Proyek Baru
          </Button>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 14 }} className="pax-grid-hero">
        <Card emboss padding="22px 24px" radius={18} style={{ gridRow: 'span 2', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text2)' }}>
              Total Nilai Portfolio RAB
            </span>
            <Receipt size={18} color="var(--text3)" />
          </div>
          <div>
            <div className="pax-mono" style={{ fontSize: 32, fontWeight: 600, color: 'var(--text)', lineHeight: 1 }}>
              Belum dihitung
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 14 }}>
              <StatusPill tone="neutral">Menunggu Core Engine</StatusPill>
              <span style={{ fontSize: 11.5, color: 'var(--text2)' }}>{projects.length} proyek tersimpan</span>
            </div>
          </div>
          <div
            onClick={() => router.push('/proyek')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--text)', cursor: 'pointer', marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-soft)' }}
          >
            Lihat semua proyek <ArrowRight size={14} />
          </div>
        </Card>
        {stats.map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} sub={s.sub} dot={s.dot} />
        ))}
      </div>

      <Card padding="16px 18px">
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 13 }}>Quick Actions</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }} className="pax-grid-4">
          {quickActions.map((q) => (
            <div
              key={q.key}
              onClick={() => router.push(q.href)}
              className="pax-card-hover"
              style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '13px 14px', borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)', cursor: 'pointer', transition: 'all .15s' }}
            >
              <span style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--accent)', color: 'var(--accent-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {quickIcons[q.key]}
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', lineHeight: 1.25 }}>{q.label}</span>
            </div>
          ))}
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 14 }} className="pax-grid-2">
        <Card padding={18}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Proyek Aktif</span>
            <span onClick={() => router.push('/proyek')} style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text2)', cursor: 'pointer' }}>Semua</span>
          </div>
          {loading ? (
            <EmptyState title="Memuat proyek..." />
          ) : projects.length === 0 ? (
            <EmptyState title="Belum ada proyek" message="Buat proyek pertama dari tombol Proyek Baru." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {projects.slice(0, 4).map((p) => (
                <div
                  key={p.id}
                  onClick={() => router.push(`/proyek/${p.id}`)}
                  className="pax-card-hover"
                  style={{ padding: 14, borderRadius: 13, background: 'var(--surface)', border: '1px solid var(--border)', cursor: 'pointer', transition: 'all .15s' }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 9 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{p.name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3, fontSize: 11, color: 'var(--text2)' }}>
                        <MapPin size={12} /> {p.location || 'Lokasi belum diisi'}
                      </div>
                    </div>
                    <StatusPill tone={PROJECT_STATUS_TONE[p.status]}>{PROJECT_STATUS_LABEL[p.status]}</StatusPill>
                  </div>
                  <div className="pax-mono" style={{ fontSize: 14.5, fontWeight: 600, color: p.rabValue === null ? 'var(--text3)' : 'var(--text)', marginBottom: 10 }}>{rabDisplay(p)}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, marginBottom: 4 }}>
                        <span style={{ color: 'var(--text2)' }}>Progress</span>
                        <span className="pax-mono" style={{ fontWeight: 600, color: 'var(--text)' }}>{p.progress}%</span>
                      </div>
                      <ProgressBar value={p.progress} />
                    </div>
                    <div className="pax-mono" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: p.warnings ? 'var(--warn-fg)' : 'var(--text3)' }}>
                      <AlertTriangle size={13} /> {p.warnings}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card padding={18}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <AlertTriangle size={16} color="var(--warn-fg)" />
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Warning Proyek</span>
          </div>
          {projects.some((project) => project.warnings > 0) ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {projects.filter((project) => project.warnings > 0).map((project) => (
                <div key={project.id} className="pax-row-hover" style={{ display: 'flex', gap: 11, padding: '11px 8px', borderRadius: 10 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', marginTop: 5, flexShrink: 0, background: 'var(--warn-fg)' }} />
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.4 }}>{project.warnings} warning terbuka</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 4 }}>{project.name}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Belum ada warning" message="Warning akan muncul setelah validasi proyek berjalan." />
          )}
        </Card>
      </div>
    </div>
  );
}
