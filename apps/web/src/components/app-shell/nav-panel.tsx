'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  FolderKanban,
  FileImage,
  Calculator,
  CalendarClock,
  MessageSquare,
  HardHat,
  Files as FilesIcon,
  Database,
  FileSpreadsheet,
  Users,
  Settings,
  FlaskConical,
  ChevronDown,
} from 'lucide-react';
import { LocalStorage } from '@/lib/local-storage';
import { currentUser, aiCredits } from '@/lib/mock/workspace';

interface NavLeaf {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number }>;
  count?: number;
  badge?: string;
}

const workspaceItems: NavLeaf[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Proyek', href: '/proyek', icon: FolderKanban, count: 3 },
];

const projectModules = [
  { label: 'Gambar Kerja AI', seg: '/gambar-kerja', icon: FileImage, gateway: '/gambar-kerja-ai', badge: 'AI' },
  { label: 'RAB & BOQ', seg: '/rab', icon: Calculator, gateway: '/proyek' },
  { label: 'Schedule & Skenario', seg: '/schedule', icon: CalendarClock, gateway: '/proyek' },
  { label: 'Engineering Chat', seg: '/chat', icon: MessageSquare, gateway: '/proyek' },
  { label: 'Site Agent', seg: '/site-agent', icon: HardHat, gateway: '/proyek' },
];

const otherItems: NavLeaf[] = [
  { label: 'File & Dokumen', href: '/files', icon: FilesIcon },
  { label: 'Database AHSP', href: '/database-ahsp', icon: Database },
  { label: 'Laporan & Export', href: '/laporan', icon: FileSpreadsheet },
  { label: 'Kolaborasi', href: '/kolaborasi', icon: Users, count: 4 },
  { label: 'Uji RAB (v0.6)', href: '/rab-tester', icon: FlaskConical },
  { label: 'Pengaturan', href: '/pengaturan', icon: Settings },
];

function groupLabel(text: string) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: 'var(--side-muted)',
        padding: '13px 10px 7px',
      }}
    >
      {text}
    </div>
  );
}

export function NavPanel({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  useEffect(() => {
    const match = pathname.match(/^\/proyek\/([^/]+)/);
    if (match && match[1] !== 'page') {
      setActiveProjectId(match[1]);
      LocalStorage.setActiveProjectId(match[1]);
    } else {
      setActiveProjectId(LocalStorage.getActiveProjectId());
    }
  }, [pathname]);

  const itemRow = (active: boolean, icon: React.ReactNode, label: string, right?: React.ReactNode) => (
    <div
      className="pax-nav-item"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        padding: '9px 10px',
        borderRadius: 10,
        cursor: 'pointer',
        fontSize: 13,
        transition: 'all .15s',
        background: active ? 'var(--side-active-bg)' : 'transparent',
        color: active ? 'var(--side-active-ink)' : 'var(--side-text)',
        fontWeight: active ? 600 : 500,
      }}
    >
      {icon}
      {!collapsed && <span style={{ flex: 1 }}>{label}</span>}
      {!collapsed && right}
    </div>
  );

  const countPill = (n: number) => (
    <span className="pax-mono" style={{ fontSize: 10.5, color: 'var(--side-muted)' }}>
      {n}
    </span>
  );

  return (
    <aside
      style={{
        flexShrink: 0,
        position: 'sticky',
        top: 16,
        height: 'calc(100vh - 32px)',
        width: collapsed ? 74 : 252,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--side-bg)',
        border: '1px solid var(--side-border)',
        borderRadius: 18,
        boxShadow: 'var(--shadow-card)',
        overflow: 'hidden',
        transition: 'width .3s cubic-bezier(.22,1,.36,1)',
      }}
    >
      {/* traffic dots */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '14px 16px 10px' }}>
        {['#CFC9BE', '#BDB7AC', '#A9A39A'].map((c) => (
          <span key={c} style={{ width: 11, height: 11, borderRadius: '50%', background: c }} />
        ))}
      </div>

      {/* user header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 11,
          padding: '6px 16px 14px',
          borderBottom: '1px solid var(--side-border)',
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 13,
            background: 'var(--brand-box)',
            color: 'var(--brand-ink)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: 14,
            boxShadow: 'var(--emboss-sm)',
            flexShrink: 0,
          }}
        >
          {currentUser.initials}
        </div>
        {!collapsed && (
          <div style={{ minWidth: 0, flex: 1, lineHeight: 1.3 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                {currentUser.name}
              </span>
              <ChevronDown size={13} color="var(--text3)" />
            </div>
            <div
              className="pax-mono"
              style={{ fontSize: 11, color: 'var(--side-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {currentUser.email}
            </div>
          </div>
        )}
      </div>

      <nav style={{ flex: 1, overflowY: 'auto', padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {!collapsed && groupLabel('Workspace')}
        {workspaceItems.map((it) => {
          const Icon = it.icon;
          const active = pathname === it.href || (it.href !== '/dashboard' && pathname.startsWith(it.href + '/'));
          return (
            <Link key={it.href} href={it.href} aria-label={it.label} style={{ textDecoration: 'none' }}>
              {itemRow(active, <Icon size={17} />, it.label, it.count != null ? countPill(it.count) : undefined)}
            </Link>
          );
        })}

        {!collapsed && groupLabel('Modul Proyek')}
        {projectModules.map((m) => {
          const Icon = m.icon;
          const href = activeProjectId ? `/proyek/${activeProjectId}${m.seg}` : m.gateway;
          const active = activeProjectId ? pathname === `/proyek/${activeProjectId}${m.seg}` : false;
          return (
            <Link key={m.label} href={href} aria-label={m.label} style={{ textDecoration: 'none' }}>
              {itemRow(
                active,
                <Icon size={17} />,
                m.label,
                m.badge && !collapsed ? (
                  <span
                    className="pax-mono"
                    style={{
                      fontSize: 8.5,
                      fontWeight: 600,
                      color: 'var(--side-muted)',
                      border: '1px solid var(--side-border)',
                      borderRadius: 5,
                      padding: '1px 5px',
                    }}
                  >
                    {m.badge}
                  </span>
                ) : undefined,
              )}
            </Link>
          );
        })}

        {!collapsed && groupLabel('Lainnya')}
        {otherItems.map((it) => {
          const Icon = it.icon;
          const active = pathname === it.href || pathname.startsWith(it.href + '/');
          return (
            <Link key={it.href} href={it.href} aria-label={it.label} style={{ textDecoration: 'none' }}>
              {itemRow(active, <Icon size={17} />, it.label, it.count != null ? countPill(it.count) : undefined)}
            </Link>
          );
        })}
      </nav>

      {/* AI credits */}
      {!collapsed && (
        <div style={{ padding: 12, borderTop: '1px solid var(--side-border)' }}>
          <div
            style={{
              background: 'var(--side-card)',
              border: '1px solid var(--side-border)',
              borderRadius: 12,
              padding: '11px 13px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
              <span
                style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--side-muted)' }}
              >
                AI Credits
              </span>
              <span className="pax-mono" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
                {aiCredits.pct}%
              </span>
            </div>
            <div style={{ height: 6, borderRadius: 4, background: 'color-mix(in srgb,var(--text) 8%,transparent)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${aiCredits.pct}%`, borderRadius: 4, background: 'var(--accent)' }} />
            </div>
            <div className="pax-mono" style={{ fontSize: 10, color: 'var(--side-muted)', marginTop: 6 }}>
              {aiCredits.used} / {aiCredits.total.toLocaleString('id-ID')} credits
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
