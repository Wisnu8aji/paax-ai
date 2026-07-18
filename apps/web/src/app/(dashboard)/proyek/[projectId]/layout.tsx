'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useEffect, use } from 'react';
import { usePathname } from 'next/navigation';
import {
  ChevronRight,
  ArrowLeft,
  MapPin,
} from 'lucide-react';
import { LocalStorage } from '@/lib/local-storage';
import { ProjectSwitcher } from '@/components/app-shell/project-switcher';
import { Card, StatusPill, EmptyState } from '@/components/ui';
import { useProjects } from '@/lib/projects/projects-context';
import { PROJECT_STATUS_LABEL, PROJECT_STATUS_TONE } from '@/lib/projects/types';

/** Tab modul Project Studio (nama baru per utama.txt; route lama tetap).
 * Drawing Intelligence kini membuka workspace baru full-height di
 * /drawing-intelligence (href absolut, mengikuti proyek aktif). Route lama
 * /gambar-kerja tetap ada untuk utilitas TKG lama. */
const MODULE_TABS: { seg: string; label: string; href?: string }[] = [
  { seg: '', label: 'Overview' },
  { seg: '/gambar-kerja', label: 'Drawing Intelligence', href: '/drawing-intelligence' },
  { seg: '/rab', label: 'Cost & Quantity' },
  { seg: '/schedule', label: 'Schedule Planning' },
  { seg: '/site-agent', label: 'Site Agent' },
];

export default function ProjectDetailLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const pathname = usePathname();
  const { getProject, loading } = useProjects();
  const project = getProject(projectId);

  useEffect(() => {
    LocalStorage.setActiveProjectId(projectId);
  }, [projectId]);

  if (loading) {
    return <div style={{ padding: 24, color: 'var(--text3)' }}>Memuat proyek...</div>;
  }

  if (!project) {
    return (
      <Card padding={18}>
        <EmptyState
          title="Proyek tidak ditemukan"
          message="ID proyek ini belum tersimpan di workspace. Kembali ke daftar proyek untuk memilih proyek yang tersedia."
        />
        <Link href="/proyek" style={{ color: 'var(--text)', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
          Kembali ke daftar proyek
        </Link>
      </Card>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
        <Link href="/proyek" style={{ color: 'var(--text2)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
          <ArrowLeft size={13} /> Project Studio
        </Link>
        <ChevronRight size={13} color="var(--text3)" />
        <Link href={`/proyek/${projectId}`} style={{ color: 'var(--text)', fontWeight: 600, textDecoration: 'none' }}>
          {project.name}
        </Link>
      </div>

      <Card padding={18}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <Link href={`/proyek/${projectId}`} style={{ color: 'var(--text)', textDecoration: 'none' }}>
              <h1 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>{project.name}</h1>
            </Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: 12, color: 'var(--text2)' }}>
              <MapPin size={13} /> {project.location || 'Lokasi belum diisi'} - Klien: {project.client} - {project.type}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <StatusPill tone={PROJECT_STATUS_TONE[project.status]}>{PROJECT_STATUS_LABEL[project.status]}</StatusPill>
            <ProjectSwitcher currentProjectId={projectId} />
          </div>
        </div>

        {/* Tab modul studio */}
        <nav
          aria-label="Modul proyek"
          style={{ display: 'flex', gap: 4, marginTop: 14, borderTop: '1px solid var(--border-soft)', paddingTop: 12, flexWrap: 'wrap' }}
        >
          {MODULE_TABS.map((t) => {
            const href = t.href ?? `/proyek/${projectId}${t.seg}`;
            const active = t.seg === '' ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={t.label}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={active ? '' : 'pax-btn-ghost'}
                style={{
                  padding: '7px 13px',
                  borderRadius: 999,
                  fontSize: 11.5,
                  fontWeight: 700,
                  textDecoration: 'none',
                  background: active ? 'var(--rail-grad)' : 'transparent',
                  color: active ? '#fff' : 'var(--text2)',
                  boxShadow: active ? '0 6px 16px rgba(30,40,50,0.18)' : 'none',
                  transition: 'background .22s var(--ease), color .22s var(--ease), box-shadow .22s var(--ease)',
                }}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </Card>

      <div className="pax-fade" key={pathname}>{children}</div>
    </div>
  );
}
