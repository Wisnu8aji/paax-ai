'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Database, FileSpreadsheet, Files, Settings, Users } from 'lucide-react';
import { useShell } from './shell-context';
import { PaaxMark, PaaxWordmark } from '@/components/brand/paax-logo';
import { currentUser } from '@/lib/mock/workspace';

/**
 * Rail hitam — SATU-SATUNYA rumah untuk tool global workspace + gerbang
 * Pengaturan (gear) + Akun (avatar). Item nav berlabel hidup di NavPanel;
 * tidak ada menu yang muncul dua kali (konsolidasi 2026-07-03).
 */
const GLOBAL_TOOLS = [
  { href: '/files', label: 'File & Dokumen', icon: Files },
  { href: '/database-ahsp', label: 'Database AHSP', icon: Database },
  { href: '/laporan', label: 'Laporan & Export', icon: FileSpreadsheet },
  { href: '/kolaborasi', label: 'Kolaborasi', icon: Users },
];

const railBtn: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 12,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  transition: 'all .15s',
  color: 'rgba(255,255,255,0.82)',
  background: 'transparent',
  border: 'none',
};

export function IconRail() {
  const router = useRouter();
  const pathname = usePathname();
  const { openSettings } = useShell();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 14,
        width: 62,
        flexShrink: 0,
        position: 'sticky',
        top: 16,
        height: 'calc(100vh - 32px)',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          padding: '12px 8px',
          background: 'var(--rail-bg)',
          borderRadius: 22,
          boxShadow: 'var(--emboss)',
          flex: 1,
          width: '100%',
        }}
      >
        <button
          onClick={() => router.push('/dashboard')}
          title="PAAX — Dashboard"
          aria-label="PAAX — ke Dashboard"
          style={{
            ...railBtn,
            width: 38,
            height: 38,
            background: 'rgba(255,255,255,0.10)',
            color: '#fff',
            marginBottom: 4,
          }}
        >
          <PaaxMark size={17} />
        </button>

        <span
          aria-hidden="true"
          style={{ width: 26, height: 1, background: 'rgba(255,255,255,0.14)', margin: '2px 0 4px' }}
        />

        {GLOBAL_TOOLS.map((tool) => {
          const Icon = tool.icon;
          const active = pathname === tool.href || pathname.startsWith(tool.href + '/');
          return (
            <button
              key={tool.href}
              className="pax-rail-item"
              onClick={() => router.push(tool.href)}
              title={tool.label}
              aria-label={tool.label}
              aria-current={active ? 'page' : undefined}
              style={{
                ...railBtn,
                background: active ? 'rgba(255,255,255,0.14)' : 'transparent',
                color: active ? '#fff' : 'rgba(255,255,255,0.72)',
              }}
            >
              <Icon size={19} strokeWidth={1.5} />
            </button>
          );
        })}

        <div style={{ flex: 1 }} />

        <span
          aria-hidden="true"
          style={{
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
            color: 'rgba(255,255,255,0.30)',
            padding: '4px 0 6px',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <PaaxWordmark height={11} />
        </span>

        <button
          className="pax-rail-item"
          style={railBtn}
          title="Pengaturan"
          aria-label="Pengaturan"
          onClick={() => openSettings('umum')}
        >
          <Settings size={19} strokeWidth={1.5} />
        </button>
      </div>

      <button
        onClick={() => openSettings('akun')}
        title="Akun Saya"
        aria-label="Akun Saya"
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '11px 0',
          background: 'var(--rail-bg)',
          borderRadius: 18,
          boxShadow: 'var(--emboss)',
          cursor: 'pointer',
          border: 'none',
        }}
      >
        <span
          style={{
            width: 34,
            height: 34,
            borderRadius: 11,
            background: 'rgba(255,255,255,0.12)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: 12.5,
          }}
        >
          {currentUser.initials}
        </span>
      </button>
    </div>
  );
}
