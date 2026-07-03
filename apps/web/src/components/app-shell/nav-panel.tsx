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
  ChevronRight,
} from 'lucide-react';
import { LocalStorage } from '@/lib/local-storage';
import { PaaxLogoBox, PaaxWordmark } from '@/components/brand/paax-logo';
import { useShell } from './shell-context';
import { currentUser, aiCredits } from '@/lib/mock/workspace';

/**
 * Panel navigasi kaca (glassmorphism) — hanya nav KONTEKS KERJA:
 * Workspace (Dashboard, Proyek) + Modul Proyek. Tool global (File, AHSP,
 * Laporan, Kolaborasi) dan Pengaturan hidup HANYA di rail hitam — tidak ada
 * menu ganda (konsolidasi 2026-07-03).
 */
interface NavLeaf {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number }>;
  count?: number;
}

const workspaceItems: NavLeaf[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Proyek', href: '/proyek', icon: FolderKanban },
];

const projectModules = [
  { label: 'Gambar Kerja AI', seg: '/gambar-kerja', icon: FileImage, gateway: '/gambar-kerja-ai', badge: 'AI' },
  { label: 'RAB & BOQ', seg: '/rab', icon: Calculator, gateway: '/proyek' },
  { label: 'Schedule & Skenario', seg: '/schedule', icon: CalendarClock, gateway: '/proyek' },
  { label: 'Engineering Chat', seg: '/chat', icon: MessageSquare, gateway: '/proyek' },
  { label: 'Site Agent', seg: '/site-agent', icon: HardHat, gateway: '/proyek' },
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
  const { openSettings } = useShell();
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
        boxShadow: active ? 'var(--shadow-card)' : 'none',
      }}
    >
      {icon}
      {!collapsed && <span style={{ flex: 1 }}>{label}</span>}
      {!collapsed && right}
    </div>
  );

  return (
    <aside
      className="pax-glass pax-glass-edge"
      style={{
        flexShrink: 0,
        position: 'sticky',
        top: 16,
        height: 'calc(100vh - 32px)',
        width: collapsed ? 74 : 252,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 18,
        boxShadow: 'var(--shadow-card)',
        overflow: 'hidden',
        transition: 'width .3s cubic-bezier(.22,1,.36,1)',
      }}
    >
      {/* Brand */}
      <Link
        href="/dashboard"
        aria-label="PAAX Workspace — Dashboard"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 11,
          padding: collapsed ? '16px 0 12px' : '16px 16px 12px',
          justifyContent: collapsed ? 'center' : 'flex-start',
          textDecoration: 'none',
        }}
      >
        <PaaxLogoBox size={38} radius={12} />
        {!collapsed && (
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3, color: 'var(--text)' }}>
            <PaaxWordmark height={13} />
            <span
              style={{
                fontSize: 8.5,
                fontWeight: 700,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'var(--side-muted)',
              }}
            >
              Civil Engineering
            </span>
          </span>
        )}
      </Link>

      {/* User */}
      <button
        onClick={() => openSettings('akun')}
        aria-label="Akun Saya"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 11,
          padding: collapsed ? '8px 0 14px' : '8px 16px 14px',
          justifyContent: collapsed ? 'center' : 'flex-start',
          background: 'transparent',
          border: 'none',
          borderBottom: '1px solid var(--side-border)',
          cursor: 'pointer',
          textAlign: 'left',
          width: '100%',
        }}
      >
        <span
          style={{
            width: 34,
            height: 34,
            borderRadius: 11,
            background: 'var(--surface2)',
            color: 'var(--text)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: 12.5,
            flexShrink: 0,
          }}
        >
          {currentUser.initials}
        </span>
        {!collapsed && (
          <span style={{ minWidth: 0, flex: 1, lineHeight: 1.3 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                {currentUser.name}
              </span>
              <ChevronRight size={12} color="var(--text3)" />
            </span>
            <span
              className="pax-mono"
              style={{
                display: 'block',
                fontSize: 10.5,
                color: 'var(--side-muted)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {currentUser.email}
            </span>
          </span>
        )}
      </button>

      <nav style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {!collapsed && groupLabel('Workspace')}
        {workspaceItems.map((it) => {
          const Icon = it.icon;
          const active = pathname === it.href || (it.href !== '/dashboard' && pathname.startsWith(it.href + '/'));
          return (
            <Link key={it.href} href={it.href} aria-label={it.label} style={{ textDecoration: 'none' }}>
              {itemRow(active, <Icon size={17} />, it.label)}
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
                      color: 'var(--gold)',
                      border: '1px solid var(--gold-bd)',
                      background: 'var(--gold-soft)',
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
              <div style={{ height: '100%', width: `${aiCredits.pct}%`, borderRadius: 4, background: 'var(--gold)' }} />
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
