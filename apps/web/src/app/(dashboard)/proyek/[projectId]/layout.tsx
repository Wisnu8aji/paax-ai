'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, use } from 'react';
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
import { LocalStorage, STORAGE_KEYS } from '@/lib/local-storage';
import { ProjectSwitcher } from '@/components/app-shell/project-switcher';
import { Card, StatusPill } from '@/components/ui';
import { projects as mockProjects, statusTone, type MockProject } from '@/lib/mock/workspace';

const projectTabs = [
  { label: 'Overview', icon: LayoutDashboard, href: '' },
  { label: 'Gambar Kerja', icon: FileImage, href: '/gambar-kerja' },
  { label: 'RAB & BOQ', icon: Calculator, href: '/rab' },
  { label: 'Schedule', icon: CalendarClock, href: '/schedule' },
  { label: 'Chat AI', icon: MessageSquare, href: '/chat' },
  { label: 'Site Agent', icon: HardHat, href: '/site-agent' },
];

function resolveProject(projectId: string): MockProject {
  const saved = LocalStorage.get<MockProject[]>(STORAGE_KEYS.PROJECTS, []);
  const found = saved.find((p) => p.id === projectId);
  if (found) return found;
  const mock = mockProjects.find((p) => p.id === projectId);
  return mock ?? { ...mockProjects[0], id: projectId };
}

export default function ProjectDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const pathname = usePathname();
  const { projectId } = use(params);
  const [project, setProject] = useState<MockProject | null>(null);

  useEffect(() => {
    const p = resolveProject(projectId);
    setProject(p);
    LocalStorage.setActiveProjectId(projectId);
  }, [projectId]);

  if (!project) {
    return <div style={{ padding: 24, color: 'var(--text3)' }}>Memuat proyek…</div>;
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
              <MapPin size={13} /> {project.location} · Klien: {project.client} · {project.type}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <StatusPill tone={statusTone[project.status]}>{project.statusLabel}</StatusPill>
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
