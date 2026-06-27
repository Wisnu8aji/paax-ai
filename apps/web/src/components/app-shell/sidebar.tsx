'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FolderKanban,
  FileImage,
  Calculator,
  CalendarClock,
  MessageSquare,
  HardHat,
  Files,
  Database,
  FileSpreadsheet,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
  Zap,
  FlaskConical,
} from 'lucide-react';
import { useState } from 'react';

const topMenuItems = [
  { label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
  { label: 'Proyek', icon: FolderKanban, href: '/proyek' },
];

const projectModules = [
  { label: 'Gambar Kerja AI', icon: FileImage, href: '/gambar-kerja', gateway: '/gambar-kerja-ai' },
  { label: 'RAB & BOQ', icon: Calculator, href: '/rab', gateway: '/proyek?selectModule=rab' },
  { label: 'Schedule & Skenario', icon: CalendarClock, href: '/schedule', gateway: '/proyek?selectModule=schedule' },
  { label: 'Engineering Chat', icon: MessageSquare, href: '/chat', gateway: '/proyek?selectModule=chat' },
  { label: 'Site Agent', icon: HardHat, href: '/site-agent', gateway: '/proyek?selectModule=site-agent' },
];

const bottomMenuItems = [
  { label: 'Uji RAB (v0.6)', icon: FlaskConical, href: '/rab-tester' },
  { label: 'File & Dokumen', icon: Files, href: '/files' },
  { label: 'Database AHSP', icon: Database, href: '/database-ahsp' },
  { label: 'Laporan & Export', icon: FileSpreadsheet, href: '/laporan' },
  { label: 'Kolaborasi', icon: Users, href: '/kolaborasi' },
  { label: 'Pengaturan', icon: Settings, href: '/pengaturan' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const projectMatch = pathname.match(/^\/proyek\/([^/]+)/);
  const activeProjectId = projectMatch?.[1] ?? null;

  const renderMenuItem = (item: { label: string, icon: any, href: string }, indent = false, isSubtle = false) => {
    const isActive = pathname === item.href || (item.href !== '/dashboard' && item.href !== '/proyek' && pathname.startsWith(item.href));
    const Icon = item.icon;

    return (
      <Link
        key={item.href}
        href={item.href}
        className={`group flex items-center gap-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-200 relative ${
          indent ? (collapsed ? 'px-3' : 'pl-9 pr-3') : 'px-3'
        } ${
          isActive
            ? 'bg-gradient-to-r from-indigo-500/15 to-blue-500/10 text-white'
            : isSubtle
              ? 'text-paax-text-muted/60 hover:text-paax-text-muted hover:bg-white/[0.02]'
              : 'text-paax-text-muted hover:text-paax-text-secondary hover:bg-white/[0.03]'
        }`}
        title={collapsed ? item.label : undefined}
      >
        {isActive && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-gradient-to-b from-indigo-400 to-blue-400" />
        )}
        <Icon
          className={`w-[18px] h-[18px] flex-shrink-0 transition-colors ${
            isActive ? 'text-indigo-400' : isSubtle ? 'text-paax-text-muted/60 group-hover:text-paax-text-muted' : 'text-paax-text-muted group-hover:text-paax-text-secondary'
          }`}
        />
        {!collapsed && <span>{item.label}</span>}
      </Link>
    );
  };

  return (
    <aside
      className={`fixed left-0 top-0 h-screen z-40 flex flex-col transition-all duration-300 ease-in-out ${
        collapsed ? 'w-[68px]' : 'w-[260px]'
      }`}
      style={{
        background: 'linear-gradient(180deg, rgba(17, 24, 39, 0.98) 0%, rgba(10, 15, 30, 0.98) 100%)',
        borderRight: '1px solid rgba(255, 255, 255, 0.06)',
        backdropFilter: 'blur(20px)',
      }}
    >
      {/* Logo */}
      <div className="flex items-center justify-between px-4 h-16 border-b border-white/5">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-blue-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Zap className="w-5 h-5 text-white" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-[15px] font-bold tracking-tight text-white">PAAX AI</span>
              <span className="text-[10px] text-paax-text-muted font-medium tracking-wider uppercase">
                v0.5 • Civil Engineering
              </span>
            </div>
          )}
        </Link>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-7 h-7 rounded-md flex items-center justify-center text-paax-text-muted hover:text-white hover:bg-white/5 transition-all"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-0.5">
        {/* Top Level */}
        {topMenuItems.map(item => renderMenuItem(item))}

        {/* Project Modules */}
        <div className={`overflow-hidden transition-all duration-300 ease-in-out ${activeProjectId ? 'max-h-[500px] opacity-100' : 'max-h-[500px] opacity-100'}`}>
          {projectModules.map((module) => {
            const targetHref = activeProjectId ? `/proyek/${activeProjectId}${module.href}` : module.gateway;
            const isActive = activeProjectId
              ? pathname.startsWith(targetHref)
              : targetHref === '/gambar-kerja-ai' && pathname === targetHref;
            const isSubtle = !activeProjectId;
            const Icon = module.icon;

            return (
              <Link
                key={module.label}
                href={targetHref}
                className={`group flex items-center gap-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-200 relative ${
                  collapsed ? 'px-3' : 'pl-9 pr-3'
                } ${
                  isActive
                    ? 'bg-gradient-to-r from-indigo-500/15 to-blue-500/10 text-white'
                    : isSubtle
                      ? 'text-paax-text-muted/60 hover:text-paax-text-muted hover:bg-white/[0.02]'
                      : 'text-paax-text-muted hover:text-paax-text-secondary hover:bg-white/[0.03]'
                }`}
                title={collapsed ? module.label : undefined}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-gradient-to-b from-indigo-400 to-blue-400" />
                )}
                <Icon
                  className={`w-[18px] h-[18px] flex-shrink-0 transition-colors ${
                    isActive ? 'text-indigo-400' : isSubtle ? 'text-paax-text-muted/60 group-hover:text-paax-text-muted' : 'text-paax-text-muted group-hover:text-paax-text-secondary'
                  }`}
                />
                {!collapsed && <span>{module.label}</span>}
              </Link>
            );
          })}
        </div>

        {/* Bottom Level */}
        <div className="pt-2 mt-2 border-t border-white/5 space-y-0.5">
          {bottomMenuItems.map(item => renderMenuItem(item))}
        </div>
      </nav>

      {/* User Section */}
      <div className="border-t border-white/5 p-3">
        <div className={`flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/[0.03] transition-all cursor-pointer ${collapsed ? 'justify-center' : ''}`}>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
            BA
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="text-[13px] font-medium text-white truncate">Budi Andrean</span>
              <span className="text-[11px] text-paax-text-muted truncate">Project Manager</span>
            </div>
          )}
        </div>
        {!collapsed && (
          <div className="mt-2 mx-2 px-3 py-2 rounded-lg bg-gradient-to-r from-indigo-500/10 to-blue-500/5 border border-indigo-500/10">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-paax-text-muted">AI Credits</span>
              <span className="text-indigo-400 font-semibold">67%</span>
            </div>
            <div className="progress-bar mt-1.5">
              <div className="progress-bar-fill bg-gradient-to-r from-indigo-500 to-blue-500" style={{ width: '67%' }} />
            </div>
            <div className="text-[10px] text-paax-text-muted mt-1">670 / 1.000 credits tersisa</div>
          </div>
        )}
      </div>
    </aside>
  );
}
