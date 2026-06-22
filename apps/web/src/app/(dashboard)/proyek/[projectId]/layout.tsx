'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, use } from 'react';
import { LocalStorage, STORAGE_KEYS } from '@/lib/local-storage';
import { ProjectSwitcher } from '@/components/app-shell/project-switcher';
import {
  LayoutDashboard,
  FileImage,
  Calculator,
  CalendarClock,
  MessageSquare,
  HardHat,
  ChevronRight,
  ArrowLeft,
} from 'lucide-react';

const projectTabs = [
  { label: 'Overview', icon: LayoutDashboard, href: '' },
  { label: 'Gambar Kerja', icon: FileImage, href: '/gambar-kerja' },
  { label: 'RAB & BOQ', icon: Calculator, href: '/rab' },
  { label: 'Schedule', icon: CalendarClock, href: '/schedule' },
  { label: 'Chat AI', icon: MessageSquare, href: '/chat' },
  { label: 'Site Agent', icon: HardHat, href: '/site-agent' },
];

const statusLabels: Record<string, string> = {
  active: 'Aktif',
  'rab-review': 'RAB Review',
  scheduling: 'Scheduling',
  draft: 'Draft',
  drawing: 'Drawing',
};

export default function ProjectDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const pathname = usePathname();
  const { projectId } = use(params);
  const [project, setProject] = useState<any>(null);
  const [hasLoadedProject, setHasLoadedProject] = useState(false);

  useEffect(() => {
    setProject(null);
    setHasLoadedProject(false);
    const savedProjects = LocalStorage.get<any[]>(STORAGE_KEYS.PROJECTS, []);
    const found = savedProjects.find(p => p.id === projectId);
    if (found) {
      setProject(found);
      LocalStorage.setActiveProjectId(projectId);
    }
    setHasLoadedProject(true);
  }, [projectId]);

  return (
    <div className="space-y-0">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-4 text-[12px]">
        <Link href="/proyek" className="text-paax-text-muted hover:text-white transition-colors flex items-center gap-1">
          <ArrowLeft className="w-3 h-3" />
          Proyek
        </Link>
        <ChevronRight className="w-3 h-3 text-paax-text-muted" />
        <span className="text-paax-text-secondary font-medium">{project ? project.name : 'Memuat...'}</span>
      </div>

      {/* Project Header */}
      {project ? (
      <div className="glass-card p-5 mb-4">
        <div className="flex items-start justify-between gap-4 mb-1">
          <div>
            <h1 className="text-xl font-bold text-white">{project.name}{project.location ? ` - ${project.location}` : ''}</h1>
            <p className="text-[12px] text-paax-text-muted mt-1">
              {project.location || '-'} · Klien: {project.client || '-'}
              {project.type ? ` · ${project.type}` : ''}
              {project.luas_bangunan ? ` · Luas ${project.luas_bangunan}m²` : ''}
              {project.jumlah_lantai ? ` · ${project.jumlah_lantai} Lantai` : ''}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="badge badge-green">{statusLabels[project.status] || project.status || '-'}</span>
            <ProjectSwitcher currentProjectId={projectId} />
          </div>
        </div>
      </div>
      ) : hasLoadedProject ? (
      <div className="glass-card p-5 mb-4">
        <h1 className="text-lg font-semibold text-white">Proyek tidak ditemukan</h1>
        <p className="text-[12px] text-paax-text-muted mt-1 mb-4">Proyek dengan ID {projectId} tidak tersedia di penyimpanan lokal.</p>
        <Link href="/proyek" className="btn-secondary inline-flex">Kembali ke Proyek</Link>
      </div>
      ) : (
      <div className="glass-card p-5 mb-4 flex justify-center text-paax-text-muted">Memuat proyek...</div>
      )}

      {/* Tabs */}
      {project && (
      <div className="flex items-center gap-1 border-b border-white/[0.06] mb-6 overflow-x-auto">
        {projectTabs.map((tab) => {
          const fullHref = `/proyek/${projectId}${tab.href}`;
          const isActive = pathname === fullHref || (tab.href !== '' && pathname.startsWith(fullHref));
          const Icon = tab.icon;
          return (
            <Link
              key={tab.label}
              href={fullHref}
              className={`flex items-center gap-2 px-4 py-3 text-[13px] font-medium whitespace-nowrap transition-all ${
                isActive ? 'tab-active' : 'tab-inactive'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </Link>
          );
        })}
      </div>
      )}

      {project ? children : null}
    </div>
  );
}
