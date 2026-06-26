'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, use } from 'react';
import {
  LayoutDashboard,
  FileImage,
  Calculator,
  CalendarClock,
  MessageSquare,
  HardHat,
  ChevronRight,
  ArrowLeft,
  MapPin,
} from 'lucide-react';
import { LocalStorage } from '@/lib/local-storage';
import { ProjectSwitcher } from '@/components/app-shell/project-switcher';
import { Card, StatusPill, EmptyState } from '@/components/ui';
import { useProjects } from '@/lib/projects/projects-context';
import { PROJECT_STATUS_LABEL, PROJECT_STATUS_TONE } from '@/lib/projects/types';

const projectTabs = [
  { label: 'Overview', icon: LayoutDashboard, href: '' },
  { label: 'Gambar Kerja', icon: FileImage, href: '/gambar-kerja' },
  { label: 'RAB & BOQ', icon: Calculator, href: '/rab' },
  { label: 'Schedule', icon: CalendarClock, href: '/schedule' },
  { label: 'Chat AI', icon: MessageSquare, href: '/chat' },
  { label: 'Site Agent', icon: HardHat, href: '/site-agent' },
];

export default function ProjectDetailLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const pathname = usePathname();
  const { projectId } = use(params);
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
          <ArrowLeft size={13} /> Proyek
        </Link>
        <ChevronRight size={13} color="var(--text3)" />
        <span style={{ color: 'var(--text)', fontWeight: 600 }}>{project.name}</span>
      </div>

      <Card padding={18}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: 'var(--text)' }}>{project.name}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: 12, color: 'var(--text2)' }}>
              <MapPin size={13} /> {project.location || 'Lokasi belum diisi'} - Klien: {project.client} - {project.type}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <StatusPill tone={PROJECT_STATUS_TONE[project.status]}>{PROJECT_STATUS_LABEL[project.status]}</StatusPill>
            <ProjectSwitcher currentProjectId={projectId} />
          </div>
        </div>
      </Card>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4, borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
        {projectTabs.map((tab) => {
          const fullHref = `/proyek/${projectId}${tab.href}`;
          const isActive = pathname === fullHref || (tab.href !== '' && pathname.startsWith(fullHref));
          const Icon = tab.icon;
          return (
            <Link
              key={tab.label}
              href={fullHref}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                padding: '11px 14px',
                fontSize: 13,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                textDecoration: 'none',
                color: isActive ? 'var(--text)' : 'var(--text3)',
                borderBottom: `2px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
              }}
            >
              <Icon size={15} />
              {tab.label}
            </Link>
          );
        })}
      </div>

      <div className="pax-fade">{children}</div>
    </div>
  );
}
