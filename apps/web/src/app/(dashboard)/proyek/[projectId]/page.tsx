'use client';

import { useParams, useRouter } from 'next/navigation';
import {
  TrendingUp,
  AlertTriangle,
  Activity,
  ArrowRight,
  CheckCircle2,
  FileImage,
  Calculator,
  CalendarClock,
} from 'lucide-react';
import { Card, StatCard, ProgressBar, EmptyState } from '@/components/ui';
import { scheduleTasks } from '@/lib/mock/workspace';
import { useProjects } from '@/lib/projects/projects-context';
import { formatRupiah } from '@/lib/format';

/** Modul Project Studio (utama.txt): Drawing Intelligence / Cost & Quantity
 *  Analysis / Schedule Planning — nama baru, route & flow lama tetap. */
const STUDIO_MODULES: { seg: string; title: string; desc: string; icon: typeof FileImage; href?: string }[] = [
  {
    seg: 'gambar-kerja',
    title: 'Drawing Intelligence',
    desc: 'Workspace teknik: upload gambar, review deteksi AI, verifikasi quantity, handoff.',
    icon: FileImage,
    href: '/drawing-intelligence',
  },
  {
    seg: 'rab',
    title: 'Cost & Quantity Analysis',
    desc: 'Susun RAB & BoQ patuh AHSP — semua angka dihitung Core Engine.',
    icon: Calculator,
  },
  {
    seg: 'schedule',
    title: 'Schedule Planning',
    desc: 'Kurva S rencana & simulasi skenario waktu-biaya deterministik.',
    icon: CalendarClock,
  },
];

export default function ProjectOverviewPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const { getProject, loading } = useProjects();
  const project = getProject(projectId);

  if (loading) {
    return <EmptyState title="Memuat proyek..." />;
  }

  if (!project) {
    return <EmptyState title="Proyek tidak ditemukan" message="Buka daftar proyek untuk memilih proyek yang tersedia." />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Modul studio */}
      <div className="pax-stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
        {STUDIO_MODULES.map((m) => {
          const Icon = m.icon;
          const target = m.href ?? `/proyek/${projectId}/${m.seg}`;
          return (
            <div
              key={m.seg}
              onClick={() => router.push(target)}
              className="pax-card-hover pax-press"
              role="link"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && router.push(target)}
              style={{
                borderRadius: 18,
                background: 'var(--elev)',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-card)',
                padding: '18px 19px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <span
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 13,
                  background: 'var(--rail-grad)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon size={18} strokeWidth={1.7} />
              </span>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{m.title}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text2)', lineHeight: 1.55, flex: 1 }}>{m.desc}</div>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: 'var(--gold)' }}>
                Buka modul <ArrowRight size={13} />
              </span>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }} className="pax-grid-4">
        <StatCard label="Nilai RAB" value={project.rabValue === null ? 'Belum dihitung' : formatRupiah(project.rabValue)} sub={project.rabValue === null ? 'menunggu engine' : 'dari engine (RAB)'} />
        <StatCard label="Progress" value={`${project.progress}%`} sub="metadata proyek" dot="var(--ok-dot)" />
        <StatCard label="Warning" value={String(project.warnings)} sub="terbuka" dot="var(--warn-fg)" />
        <StatCard label="Health" value={`${project.health}%`} sub="indeks proyek" dot="var(--ok-dot)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 14 }} className="pax-grid-2">
        <Card padding={18}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 14 }}>Milestone Pekerjaan</div>
          <p style={{ marginTop: -6, marginBottom: 12, fontSize: 11, color: 'var(--text3)' }}>
            Tampilan contoh - schedule proyek akan tersambung ke engine pada task v0.7 berikutnya.
          </p>
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
