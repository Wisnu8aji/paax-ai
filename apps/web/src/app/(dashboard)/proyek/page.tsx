'use client';

import type { MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Edit3, MapPin, Plus, Trash2 } from 'lucide-react';
import { Card, StatCard, StatusPill, Button, ProgressBar, PageHeader, EmptyState } from '@/components/ui';
import { useShell } from '@/components/app-shell/shell-context';
import { useProjects } from '@/lib/projects/projects-context';
import { PROJECT_STATUS_LABEL, PROJECT_STATUS_TONE, type Project } from '@/lib/projects/types';

function rabDisplay(project: Project): string {
  return project.rabValue === null ? 'Belum dihitung' : project.rabValue.toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
}

function buildStats(projects: Project[]) {
  const active = projects.filter((project) => project.status === 'active').length;
  const warnings = projects.reduce((sum, project) => sum + project.warnings, 0);
  const avgProgress = projects.length ? Math.round(projects.reduce((sum, project) => sum + project.progress, 0) / projects.length) : 0;
  return [
    { label: 'Total Proyek', value: String(projects.length), sub: `${active} aktif` },
    { label: 'Nilai Portfolio', value: 'Belum dihitung', sub: 'menunggu hasil engine' },
    { label: 'Rata-rata Progress', value: `${avgProgress}%`, sub: 'metadata proyek' },
    { label: 'Warning Terbuka', value: String(warnings), sub: 'metadata proyek' },
  ];
}

export default function ProyekPage() {
  const router = useRouter();
  const { openOverlay } = useShell();
  const { projects, loading, error, backend, updateProject, deleteProject } = useProjects();
  const stats = buildStats(projects);

  async function handleRename(project: Project, event: MouseEvent) {
    event.stopPropagation();
    const name = window.prompt('Nama proyek baru', project.name);
    if (!name || name.trim() === project.name) return;
    await updateProject(project.id, { name });
  }

  async function handleDelete(project: Project, event: MouseEvent) {
    event.stopPropagation();
    const confirmed = window.confirm(`Hapus proyek "${project.name}"?`);
    if (!confirmed) return;
    await deleteProject(project.id);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title="Proyek"
        subtitle={`Kelola semua proyek konstruksi Anda - ${backend === 'firestore' ? 'Firestore' : 'localStorage fallback'}`}
        actions={
          <Button onClick={() => openOverlay('newProject')}>
            <Plus size={15} /> Buat Proyek Baru
          </Button>
        }
      />

      {error && (
        <Card padding={14} style={{ borderColor: 'var(--dng-dot)' }}>
          <span style={{ fontSize: 12, color: 'var(--dng-dot)' }}>{error}</span>
        </Card>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }} className="pax-grid-4">
        {stats.map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} sub={s.sub} />
        ))}
      </div>

      {loading ? (
        <Card padding={18}>
          <EmptyState title="Memuat proyek..." message="PAAX sedang membaca workspace proyek." />
        </Card>
      ) : projects.length === 0 ? (
        <Card padding={18}>
          <EmptyState
            icon={<Plus size={28} />}
            title="Belum ada proyek"
            message="Buat proyek pertama untuk mulai menyimpan metadata workspace. RAB tetap dihitung lewat Core Engine."
          />
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }} className="pax-grid-3">
          {projects.map((p) => (
            <Card key={p.id} hover padding={18} onClick={() => router.push(`/proyek/${p.id}`)}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 9 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{p.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3, fontSize: 11, color: 'var(--text2)' }}>
                    <MapPin size={12} /> {p.location || 'Lokasi belum diisi'}
                  </div>
                </div>
                <StatusPill tone={PROJECT_STATUS_TONE[p.status]}>{PROJECT_STATUS_LABEL[p.status]}</StatusPill>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 11, minHeight: 34 }}>{p.description}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11 }}>
                <StatusPill tone="neutral">{p.type}</StatusPill>
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>- {p.client}</span>
              </div>
              <div className="pax-mono" style={{ fontSize: 17, fontWeight: 600, color: p.rabValue === null ? 'var(--text3)' : 'var(--text)', marginBottom: 11 }}>{rabDisplay(p)}</div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, marginBottom: 4 }}>
                  <span style={{ color: 'var(--text2)' }}>Progress</span>
                  <span className="pax-mono" style={{ fontWeight: 600, color: 'var(--text)' }}>{p.progress}%</span>
                </div>
                <ProgressBar value={p.progress} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid var(--border-soft)' }}>
                <div className="pax-mono" style={{ display: 'flex', gap: 12, fontSize: 10.5 }}>
                  <span style={{ color: p.warnings ? 'var(--warn-fg)' : 'var(--text3)' }}>{p.warnings} warning</span>
                  <span style={{ color: 'var(--text2)' }}>Health {p.health}%</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button aria-label="Edit proyek" onClick={(event) => handleRename(p, event)} style={{ border: 0, background: 'transparent', color: 'var(--text3)', cursor: 'pointer', padding: 4 }}>
                    <Edit3 size={14} />
                  </button>
                  <button aria-label="Hapus proyek" onClick={(event) => handleDelete(p, event)} style={{ border: 0, background: 'transparent', color: 'var(--text3)', cursor: 'pointer', padding: 4 }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
