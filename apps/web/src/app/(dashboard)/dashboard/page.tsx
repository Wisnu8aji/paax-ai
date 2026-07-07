'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Plus,
  MapPin,
  AlertTriangle,
  Calculator,
  FileImage,
  CalendarClock,
  FileSpreadsheet,
  HeartPulse,
} from 'lucide-react';
import { Card, StatusPill, Button, ProgressBar, EmptyState } from '@/components/ui';
import { DonutChart, HBarList, WaveSpark, RingGauge } from '@/components/charts/dashboard-charts';
import { useShell } from '@/components/app-shell/shell-context';
import { quickActions, currentUser } from '@/lib/mock/workspace';
import { formatRupiahCompact } from '@/lib/format';
import { useProjects } from '@/lib/projects/projects-context';
import { PROJECT_STATUS_LABEL, PROJECT_STATUS_TONE, type Project, type ProjectStatus } from '@/lib/projects/types';

/**
 * OVERVIEW (rombak 2026-07-07, komposisi referensi G:\Dashboard\dashboard utama):
 * kartu statistik bergelombang (1 gelap), tabel aktivitas, donut status,
 * kolom kanan profil + bar progres. ATURAN EMAS: semua angka = metadata
 * tersimpan / cache hasil engine — chart hanya MENAMPILKAN.
 */

const quickIcons: Record<string, ReactNode> = {
  rab: <Calculator size={15} />,
  gambar: <FileImage size={15} />,
  jadwal: <CalendarClock size={15} />,
  laporan: <FileSpreadsheet size={15} />,
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

/** Kartu statistik bergelombang ala referensi; `dark` = kartu gelap ke-3. */
function WaveStat({
  label,
  value,
  badge,
  values,
  dark = false,
  color,
  sub,
}: {
  label: string;
  value: ReactNode;
  badge?: string;
  values: number[];
  dark?: boolean;
  color?: string;
  sub?: string;
}) {
  return (
    <div
      className="pax-card-hover"
      style={{
        borderRadius: 18,
        overflow: 'hidden',
        background: dark ? 'var(--rail-grad)' : 'var(--elev)',
        border: dark ? 'none' : '1px solid var(--border)',
        boxShadow: dark ? 'var(--shadow-rail)' : 'var(--shadow-card)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ padding: '16px 18px 6px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: dark ? 'rgba(255,255,255,0.85)' : 'var(--text)' }}>{label}</div>
          <div className="pax-mono" style={{ fontSize: 'clamp(15px, 1.4vw, 21px)', fontWeight: 600, marginTop: 6, color: dark ? '#fff' : 'var(--text)', lineHeight: 1.1, overflowWrap: 'anywhere' }}>
            {value}
          </div>
          {sub && (
            <div style={{ fontSize: 10, marginTop: 5, color: dark ? 'rgba(255,255,255,0.55)' : 'var(--text3)' }}>{sub}</div>
          )}
        </div>
        {badge && (
          <span className="pax-mono" style={{ fontSize: 10.5, fontWeight: 600, color: dark ? 'rgba(255,255,255,0.75)' : 'var(--text2)' }}>
            {badge}
          </span>
        )}
      </div>
      <div style={{ marginTop: 'auto' }}>
        <WaveSpark
          values={values}
          height={52}
          color={dark ? 'rgba(255,255,255,0.9)' : (color ?? 'var(--chart-1)')}
          fillOpacity={dark ? 0.18 : 0.12}
        />
      </div>
    </div>
  );
}

function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
      <span className="pax-display" style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{children}</span>
      {action}
    </div>
  );
}

export default function OverviewPage() {
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

  // Deret gelombang dari nilai TERSIMPAN per proyek (murni tampilan).
  const rabSeries = projects.map((p) => (p.rabValue ?? 0) / 1e6);
  const progressSeries = projects.map((p) => p.progress);
  const healthSeries = projects.map((p) => p.health);

  const statusSlices = (Object.keys(PROJECT_STATUS_LABEL) as ProjectStatus[])
    .map((status) => ({
      label: PROJECT_STATUS_LABEL[status],
      value: projects.filter((p) => p.status === status).length,
      color: STATUS_CHART_COLOR[status],
    }))
    .filter((s) => s.value > 0 || projects.length === 0);

  const warningProjects = projects.filter((p) => p.warnings > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header */}
      <div className="pax-rise" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '2px 2px 0' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 className="pax-display" style={{ fontSize: 19, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Overview</h1>
          <p style={{ fontSize: 11.5, color: 'var(--text3)', margin: '3px 0 0' }}>Ringkasan portfolio & aktivitas workspace</p>
        </div>
        <Button onClick={() => openOverlay('newProject')}>
          <Plus size={14} /> Proyek Baru
        </Button>
      </div>

      {/* Grid utama: 3 kartu statistik + kolom kanan (profil) */}
      <div
        className="pax-stagger pax-grid-hero"
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 0.9fr', gap: 14, alignItems: 'stretch' }}
      >
        <WaveStat
          label="Nilai Portfolio"
          value={withRab.length ? formatRupiahCompact(portfolioValue) : 'Belum dihitung'}
          badge={withRab.length ? `${withRab.length}/${projects.length}` : undefined}
          values={rabSeries}
          color="var(--chart-2)"
          sub="cache hasil Core Engine"
        />
        <WaveStat
          label="Proyek Aktif"
          value={String(activeCount)}
          badge={`${projects.length} total`}
          values={healthSeries}
          color="var(--chart-1)"
          sub="status tersimpan proyek"
        />
        <WaveStat
          label="Progres Rata-rata"
          value={projects.length ? `${avgProgress}%` : '—'}
          badge={totalWarnings > 0 ? `${totalWarnings} warning` : undefined}
          values={progressSeries}
          dark
          sub="metadata progres proyek"
        />

        {/* Kolom kanan: kartu profil (referensi) */}
        <div
          className="pax-card-hover"
          style={{
            gridRow: 'span 2',
            borderRadius: 18,
            background: 'var(--surface)',
            border: '1px solid var(--border-soft)',
            padding: '26px 18px 18px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <span
            style={{
              width: 62,
              height: 62,
              borderRadius: 18,
              background: 'var(--elev)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-card)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              fontWeight: 800,
              color: 'var(--text)',
            }}
          >
            {currentUser.initials}
          </span>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginTop: 10 }}>{currentUser.name}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>Civil Engineer · PAAX {currentUser.role}</div>

          {/* Progres proyek — bar vertikal ala "Daily Sale" */}
          <div style={{ width: '100%', marginTop: 18, background: 'var(--elev)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 14px 10px' }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>Progres Proyek</div>
            {projects.length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--text3)', padding: '8px 0 12px' }}>Belum ada proyek.</div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 92 }}>
                {projects.slice(0, 7).map((p, i) => (
                  <div key={p.id} title={`${p.name}: ${p.progress}%`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, height: '100%', justifyContent: 'flex-end' }}>
                    <div style={{ width: 9, height: '100%', borderRadius: 6, background: 'var(--surface2)', display: 'flex', alignItems: 'flex-end', overflow: 'hidden' }}>
                      <div
                        className="pax-bar-grow"
                        style={{ width: '100%', height: `${Math.max(4, p.progress)}%`, borderRadius: 6, background: i % 2 === 0 ? 'var(--chart-1)' : 'var(--chart-4)', animationDelay: `${i * 60}ms` }}
                      />
                    </div>
                    <span style={{ fontSize: 8.5, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase' }}>
                      {p.name.slice(0, 2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Health ringkas */}
          <div style={{ width: '100%', marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {projects.slice(0, 3).map((p) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <RingGauge pct={p.health} size={38} thickness={4} color={p.health >= 80 ? 'var(--chart-1)' : 'var(--warn-fg)'} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                  <div style={{ fontSize: 9.5, color: 'var(--text3)' }}>{p.lastActivity}</div>
                </div>
                <HeartPulse size={13} color={p.health >= 80 ? 'var(--ok-dot)' : 'var(--warn-fg)'} aria-hidden="true" />
              </div>
            ))}
          </div>
        </div>

        {/* Baris 2: tabel aktivitas (2 kolom) + donut */}
        <Card padding={20} radius={18} style={{ gridColumn: 'span 2' }}>
          <SectionTitle
            action={
              <span onClick={() => router.push('/proyek')} style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                Semua proyek <ArrowRight size={13} />
              </span>
            }
          >
            Aktivitas Proyek
          </SectionTitle>
          {loading ? (
            <EmptyState title="Memuat proyek..." />
          ) : projects.length === 0 ? (
            <EmptyState title="Belum ada proyek" message="Buat proyek pertama untuk melihat aktivitas di sini." />
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Proyek', 'Aktivitas', 'Nilai RAB', 'Status'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text3)', padding: '4px 8px 9px' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {projects.slice(0, 5).map((p) => (
                  <tr
                    key={p.id}
                    className="pax-row-hover"
                    onClick={() => router.push(`/proyek/${p.id}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td style={{ padding: '9px 8px', fontSize: 12.5, fontWeight: 600, color: 'var(--text)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</td>
                    <td style={{ padding: '9px 8px', fontSize: 11.5, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{p.lastActivity}</td>
                    <td className="pax-mono" style={{ padding: '9px 8px', fontSize: 12, color: p.rabValue === null ? 'var(--text3)' : 'var(--text)', whiteSpace: 'nowrap' }}>
                      {p.rabValue === null ? 'belum' : formatRupiahCompact(p.rabValue)}
                    </td>
                    <td style={{ padding: '9px 8px', minWidth: 90 }}>
                      <div
                        role="img"
                        aria-label={`Progres ${p.progress}%`}
                        style={{ height: 5, borderRadius: 4, background: 'var(--surface2)', overflow: 'hidden' }}
                      >
                        <div style={{ height: '100%', width: `${p.progress}%`, borderRadius: 4, background: STATUS_CHART_COLOR[p.status], transition: 'width .6s var(--ease)' }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card padding={20} radius={18}>
          <SectionTitle>Status Proyek</SectionTitle>
          {projects.length === 0 ? (
            <EmptyState title="Belum ada data" message="Status muncul setelah proyek dibuat." />
          ) : (
            <DonutChart slices={statusSlices} size={130} thickness={18} centerValue={projects.length} centerLabel="Proyek" />
          )}
        </Card>
      </div>

      {/* Progres per proyek + warning */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 14 }} className="pax-grid-2">
        <Card padding={20} radius={18} className="pax-rise">
          <SectionTitle>Progres per Proyek</SectionTitle>
          {projects.length === 0 ? (
            <EmptyState title="Belum ada proyek" />
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

        <Card padding={20} radius={18} className="pax-rise" style={{ animationDelay: '60ms' }}>
          <SectionTitle>Warning Proyek</SectionTitle>
          {warningProjects.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {warningProjects.map((project) => (
                <div
                  key={project.id}
                  className="pax-row-hover"
                  onClick={() => router.push(`/proyek/${project.id}`)}
                  style={{ display: 'flex', gap: 11, padding: '9px 8px', borderRadius: 10, cursor: 'pointer' }}
                >
                  <AlertTriangle size={13} color="var(--warn-fg)" style={{ marginTop: 2, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.4 }}>{project.warnings} warning terbuka</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 2 }}>{project.name}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Belum ada warning" message="Warning muncul setelah validasi proyek berjalan." />
          )}
        </Card>
      </div>

      {/* Quick actions */}
      <Card padding="16px 18px" radius={18} className="pax-rise" style={{ animationDelay: '90ms' }}>
        <div className="pax-display" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>Quick Actions</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }} className="pax-grid-4">
          {quickActions.map((q) => (
            <div
              key={q.key}
              onClick={() => router.push(q.href)}
              className="pax-card-hover pax-press"
              style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px', borderRadius: 13, background: 'var(--surface)', border: '1px solid var(--border-soft)', cursor: 'pointer' }}
            >
              <span style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--rail-grad)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {quickIcons[q.key]}
              </span>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text)', lineHeight: 1.25 }}>{q.label}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Proyek aktif */}
      <Card padding={18} radius={18} className="pax-rise" style={{ animationDelay: '120ms' }}>
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
                className="pax-card-hover pax-press"
                style={{ padding: 14, borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border-soft)', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 9 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>{p.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3, fontSize: 10.5, color: 'var(--text2)' }}>
                      <MapPin size={11} /> {p.location || 'Lokasi belum diisi'}
                    </div>
                  </div>
                  <StatusPill tone={PROJECT_STATUS_TONE[p.status]}>{PROJECT_STATUS_LABEL[p.status]}</StatusPill>
                </div>
                <div className="pax-mono" style={{ fontSize: 13.5, fontWeight: 600, color: p.rabValue === null ? 'var(--text3)' : 'var(--text)', marginBottom: 10 }}>{rabDisplay(p)}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 4 }}>
                      <span style={{ color: 'var(--text2)' }}>Progress</span>
                      <span className="pax-mono" style={{ fontWeight: 600, color: 'var(--text)' }}>{p.progress}%</span>
                    </div>
                    <ProgressBar value={p.progress} />
                  </div>
                  <div className="pax-mono" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: p.warnings ? 'var(--warn-fg)' : 'var(--text3)' }}>
                    <AlertTriangle size={12} /> {p.warnings}
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
