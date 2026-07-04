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
  FolderKanban,
  TrendingUp,
  HeartPulse,
} from 'lucide-react';
import { Card, StatusPill, Button, ProgressBar, PageHeader, EmptyState } from '@/components/ui';
import { DonutChart, HBarList, ColumnChart, RingGauge } from '@/components/charts/dashboard-charts';
import { useShell } from '@/components/app-shell/shell-context';
import { quickActions } from '@/lib/mock/workspace';
import { formatRupiahCompact } from '@/lib/format';
import { useProjects } from '@/lib/projects/projects-context';
import { PROJECT_STATUS_LABEL, PROJECT_STATUS_TONE, type Project, type ProjectStatus } from '@/lib/projects/types';

/**
 * Dashboard bisnis civil engineering.
 * ATURAN EMAS: semua angka di halaman ini adalah METADATA TERSIMPAN proyek
 * (progress, warnings, health, cache rabValue dari engine). Chart hanya
 * MENAMPILKAN nilai itu — tidak ada perhitungan RAB/HSP di frontend.
 */

const quickIcons: Record<string, ReactNode> = {
  rab: <Calculator size={16} />,
  gambar: <FileImage size={16} />,
  jadwal: <CalendarClock size={16} />,
  laporan: <FileSpreadsheet size={16} />,
};

const STATUS_CHART_COLOR: Record<ProjectStatus, string> = {
  active: 'var(--chart-1)',
  review: 'var(--chart-4)',
  hold: 'var(--chart-3)',
  done: 'var(--chart-2)',
};

function rabDisplay(project: Project): string {
  return project.rabValue === null
    ? 'Belum dihitung'
    : project.rabValue.toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
}

function KpiCard({
  label,
  value,
  sub,
  icon,
  pill,
  delay = 0,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon: ReactNode;
  pill?: ReactNode;
  delay?: number;
}) {
  return (
    <div
      className="pax-glass pax-glass-edge pax-card-hover pax-fade"
      style={{
        borderRadius: 16,
        padding: '18px 20px',
        boxShadow: 'var(--shadow-card)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        transition: 'all .2s',
        animationDelay: `${delay}ms`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text2)' }}>
          {label}
        </span>
        <span
          aria-hidden="true"
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            background: 'var(--gold-soft)',
            border: '1px solid var(--gold-bd)',
            color: 'var(--gold)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </span>
      </div>
      <div className="pax-mono" style={{ fontSize: 25, fontWeight: 600, color: 'var(--text)', lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 18 }}>
        {pill}
        {sub && <span style={{ fontSize: 11, color: 'var(--text3)' }}>{sub}</span>}
      </div>
    </div>
  );
}

function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
      <span className="pax-display" style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{children}</span>
      {action}
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { openOverlay } = useShell();
  const { projects, loading } = useProjects();

  // Agregasi TAMPILAN atas metadata tersimpan (bukan perhitungan engine).
  const withRab = projects.filter((p) => p.rabValue !== null);
  const portfolioValue = withRab.reduce((sum, p) => sum + (p.rabValue ?? 0), 0);
  const activeCount = projects.filter((p) => p.status === 'active').length;
  const totalWarnings = projects.reduce((sum, p) => sum + p.warnings, 0);
  const avgProgress = projects.length
    ? Math.round(projects.reduce((sum, p) => sum + p.progress, 0) / projects.length)
    : 0;

  const statusSlices = (Object.keys(PROJECT_STATUS_LABEL) as ProjectStatus[])
    .map((status) => ({
      label: PROJECT_STATUS_LABEL[status],
      value: projects.filter((p) => p.status === status).length,
      color: STATUS_CHART_COLOR[status],
    }))
    .filter((s) => s.value > 0 || projects.length === 0);

  const warningProjects = projects.filter((p) => p.warnings > 0);

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

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }} className="pax-grid-4">
        <KpiCard
          label="Nilai Portfolio RAB"
          icon={<Receipt size={16} />}
          value={withRab.length ? formatRupiahCompact(portfolioValue) : 'Belum dihitung'}
          pill={withRab.length === 0 ? <StatusPill tone="neutral">Menunggu Core Engine</StatusPill> : undefined}
          sub={withRab.length ? `${withRab.length} dari ${projects.length} proyek (cache engine)` : `${projects.length} proyek tersimpan`}
        />
        <KpiCard
          label="Proyek Aktif"
          icon={<FolderKanban size={16} />}
          value={String(activeCount)}
          sub={`${projects.length} total proyek`}
          delay={50}
        />
        <KpiCard
          label="Progres Rata-rata"
          icon={<TrendingUp size={16} />}
          value={projects.length ? `${avgProgress}%` : '-'}
          sub="metadata progres proyek"
          delay={100}
        />
        <KpiCard
          label="Warning Terbuka"
          icon={<AlertTriangle size={16} />}
          value={String(totalWarnings)}
          pill={totalWarnings > 0 ? <StatusPill tone="warn">PERLU TINDAKAN</StatusPill> : <StatusPill tone="ok">BERSIH</StatusPill>}
          delay={150}
        />
      </div>

      {/* Chart utama: progres + komposisi status */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 14 }} className="pax-grid-2">
        <Card padding={20} className="pax-fade">
          <SectionTitle
            action={
              <span onClick={() => router.push('/proyek')} style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                Semua proyek <ArrowRight size={13} />
              </span>
            }
          >
            Progres per Proyek
          </SectionTitle>
          {loading ? (
            <EmptyState title="Memuat proyek..." />
          ) : projects.length === 0 ? (
            <EmptyState title="Belum ada proyek" message="Buat proyek pertama untuk melihat progres di sini." />
          ) : (
            <HBarList
              rows={projects.map((p, i) => ({
                label: p.name,
                pct: p.progress,
                valueLabel: `${p.progress}%`,
                color: i % 2 === 0 ? 'var(--chart-1)' : 'var(--chart-4)',
              }))}
            />
          )}
        </Card>

        <Card padding={20} className="pax-fade" style={{ animationDelay: '60ms' }}>
          <SectionTitle>Komposisi Status</SectionTitle>
          {projects.length === 0 ? (
            <EmptyState title="Belum ada data" message="Status proyek muncul setelah proyek dibuat." />
          ) : (
            <DonutChart
              slices={statusSlices}
              centerValue={projects.length}
              centerLabel="Proyek"
            />
          )}
        </Card>
      </div>

      {/* Nilai RAB + health + warning */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 14 }} className="pax-grid-2">
        <Card padding={20} className="pax-fade" style={{ animationDelay: '90ms' }}>
          <SectionTitle>Nilai Draft RAB per Proyek</SectionTitle>
          {projects.length === 0 ? (
            <EmptyState title="Belum ada data" message="Nilai muncul setelah RAB dihitung Core Engine." />
          ) : (
            <>
              <ColumnChart
                data={projects.map((p, i) => ({
                  label: p.name,
                  value: p.rabValue,
                  valueLabel: p.rabValue === null ? 'belum' : formatRupiahCompact(p.rabValue),
                  color: i % 2 === 0 ? 'var(--chart-1)' : 'var(--chart-4)',
                }))}
              />
              <p style={{ margin: '8px 0 0', fontSize: 10.5, color: 'var(--text3)' }}>
                Nilai adalah cache hasil Core Engine per proyek — bukan dihitung di halaman ini.
              </p>
            </>
          )}
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card padding={20} className="pax-fade" style={{ animationDelay: '120ms' }}>
            <SectionTitle>Health Proyek</SectionTitle>
            {projects.length === 0 ? (
              <EmptyState title="Belum ada data" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {projects.slice(0, 4).map((p) => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <RingGauge pct={p.health} color={p.health >= 80 ? 'var(--chart-1)' : 'var(--warn-fg)'} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.name}
                      </div>
                      <div style={{ fontSize: 10.5, color: 'var(--text3)' }}>{p.lastActivity}</div>
                    </div>
                    <HeartPulse size={14} color={p.health >= 80 ? 'var(--ok-dot)' : 'var(--warn-fg)'} aria-hidden="true" />
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card padding={20} className="pax-fade" style={{ animationDelay: '150ms' }}>
            <SectionTitle>Warning Proyek</SectionTitle>
            {warningProjects.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {warningProjects.map((project) => (
                  <div
                    key={project.id}
                    className="pax-row-hover"
                    onClick={() => router.push(`/proyek/${project.id}`)}
                    style={{ display: 'flex', gap: 11, padding: '10px 8px', borderRadius: 10, cursor: 'pointer' }}
                  >
                    <span style={{ width: 7, height: 7, borderRadius: '50%', marginTop: 5, flexShrink: 0, background: 'var(--warn-fg)' }} />
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.4 }}>{project.warnings} warning terbuka</div>
                      <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 3 }}>{project.name}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="Belum ada warning" message="Warning muncul setelah validasi proyek berjalan." />
            )}
          </Card>
        </div>
      </div>

      {/* Quick actions */}
      <Card padding="16px 18px" className="pax-fade" style={{ animationDelay: '180ms' }}>
        <div className="pax-display" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 13 }}>Quick Actions</div>
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

      {/* Proyek aktif */}
      <Card padding={18} className="pax-fade" style={{ animationDelay: '210ms' }}>
        <SectionTitle
          action={
            <span onClick={() => router.push('/proyek')} style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text2)', cursor: 'pointer' }}>Semua</span>
          }
        >
          Proyek Aktif
        </SectionTitle>
        {loading ? (
          <EmptyState title="Memuat proyek..." />
        ) : projects.length === 0 ? (
          <EmptyState title="Belum ada proyek" message="Buat proyek pertama dari tombol Proyek Baru." />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }} className="pax-grid-2">
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
    </div>
  );
}
