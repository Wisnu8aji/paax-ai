'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutGrid,
  FolderKanban,
  MessagesSquare,
  HardHat,
  Files,
  BookOpen,
  Package,
  Users,
  Settings,
} from 'lucide-react';
import { useShell } from './shell-context';
import { PaaxMark } from '@/components/brand/paax-logo';
import { LocalStorage } from '@/lib/local-storage';
import { currentUser } from '@/lib/mock/workspace';

/**
 * Sidebar gelap tunggal — rombak 2026-07-07 sesuai G:\Dashboard.
 * Icon-only + tooltip; indikator aktif kotak putih → berputar 45° jadi
 * belah ketupat (spec animasi sidebar.txt); rail "menarik diri" ke kiri
 * saat cursor masuk (width transition di .pax-siderail).
 * Menu sesuai utama.txt: Overview, Project Studio, Command Room, Site Agent,
 * Files & Documents, Ledger, Artifacts, Team + Settings & Profile di bawah.
 */
interface RailItem {
  key: string;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  /** href statis, atau fungsi dari activeProjectId */
  href: string | ((projectId: string | null) => string);
  /** penanda aktif berdasarkan pathname */
  isActive: (pathname: string, projectId: string | null) => boolean;
}

const NAV_ITEMS: RailItem[] = [
  {
    key: 'overview',
    label: 'Overview',
    icon: LayoutGrid,
    href: '/dashboard',
    isActive: (p) => p === '/dashboard' || p === '/',
  },
  {
    key: 'studio',
    label: 'Project Studio',
    icon: FolderKanban,
    href: '/proyek',
    isActive: (p) =>
      p === '/proyek' ||
      (p.startsWith('/proyek/') && !p.includes('/site-agent') && !p.includes('/chat')),
  },
  {
    key: 'command',
    label: 'Command Room',
    icon: MessagesSquare,
    href: '/command-room',
    isActive: (p) => p.startsWith('/command-room') || /^\/proyek\/[^/]+\/chat/.test(p),
  },
  {
    key: 'site-agent',
    label: 'Site Agent',
    icon: HardHat,
    href: (id) => (id ? `/proyek/${id}/site-agent` : '/proyek'),
    isActive: (p) => p.includes('/site-agent'),
  },
  {
    key: 'files',
    label: 'Files & Documents',
    icon: Files,
    href: '/files',
    isActive: (p) => p.startsWith('/files'),
  },
  {
    key: 'ledger',
    label: 'Ledger',
    icon: BookOpen,
    href: '/database-ahsp',
    isActive: (p) => p.startsWith('/database-ahsp'),
  },
  {
    key: 'artifacts',
    label: 'Artifacts',
    icon: Package,
    href: '/laporan',
    isActive: (p) => p.startsWith('/laporan'),
  },
  {
    key: 'team',
    label: 'Team',
    icon: Users,
    href: '/kolaborasi',
    isActive: (p) => p.startsWith('/kolaborasi'),
  },
];

function RailButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className="pax-side-item"
      data-active={active ? 'true' : undefined}
      onClick={onClick}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
    >
      <span className="pax-side-ind" aria-hidden="true" />
      <span className="pax-side-ico">{children}</span>
      <span className="pax-side-tip" role="tooltip">
        {label}
      </span>
    </button>
  );
}

export function SideRail() {
  const router = useRouter();
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

  return (
    <aside
      className="pax-siderail"
      aria-label="Navigasi utama"
      style={{
        flexShrink: 0,
        position: 'sticky',
        top: 18,
        height: 'calc(100vh - 36px)',
        background: 'var(--rail-grad)',
        borderRadius: '28px 0 0 28px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '22px 0 18px',
        overflow: 'visible',
        zIndex: 30,
      }}
    >
      {/* Brand */}
      <button
        onClick={() => router.push('/dashboard')}
        aria-label="PAAX — ke Overview"
        className="pax-press"
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          background: 'rgba(255,255,255,0.10)',
          border: '1px solid rgba(255,255,255,0.10)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        <PaaxMark size={19} />
      </button>

      {/* Nav — grup ikon di tengah vertikal (referensi dashboard utama) */}
      <nav
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const href = typeof item.href === 'function' ? item.href(activeProjectId) : item.href;
          return (
            <RailButton
              key={item.key}
              label={item.label}
              active={item.isActive(pathname, activeProjectId)}
              onClick={() => router.push(href)}
            >
              <Icon size={21} strokeWidth={1.6} />
            </RailButton>
          );
        })}
      </nav>

      {/* Bawah: Settings + Profile */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <RailButton label="Settings" onClick={() => openSettings('umum')}>
          <Settings size={21} strokeWidth={1.6} />
        </RailButton>
        <button
          className="pax-side-item"
          onClick={() => openSettings('akun')}
          aria-label="Profile"
        >
          <span className="pax-side-ind" aria-hidden="true" />
          <span className="pax-side-ico">
            <span
              className="pax-side-avatar"
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.14)',
                border: '1px solid rgba(255,255,255,0.18)',
                fontSize: 11.5,
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {currentUser.initials}
            </span>
          </span>
          <span className="pax-side-tip" role="tooltip">
            Profile
          </span>
        </button>
      </div>
    </aside>
  );
}
