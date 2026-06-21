'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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

export default function ProjectDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const pathname = usePathname();

  return (
    <div className="space-y-0">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-4 text-[12px]">
        <Link href="/proyek" className="text-paax-text-muted hover:text-white transition-colors flex items-center gap-1">
          <ArrowLeft className="w-3 h-3" />
          Proyek
        </Link>
        <ChevronRight className="w-3 h-3 text-paax-text-muted" />
        <span className="text-paax-text-secondary font-medium">Rumah Tinggal Pak Ahmad</span>
      </div>

      {/* Project Header */}
      <div className="glass-card p-5 mb-4">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-xl font-bold text-white">Rumah Tinggal Pak Ahmad - Depok</h1>
          <span className="badge badge-green">Aktif</span>
        </div>
        <p className="text-[12px] text-paax-text-muted">Depok, Jawa Barat · Klien: Pak Ahmad Suryadi · Luas 180m² · 2 Lantai</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-white/[0.06] mb-6 overflow-x-auto">
        {projectTabs.map((tab) => {
          const fullHref = `/proyek/proj-001${tab.href}`;
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

      {children}
    </div>
  );
}
