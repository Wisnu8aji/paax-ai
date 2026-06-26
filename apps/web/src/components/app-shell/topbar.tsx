'use client';

import { useState } from 'react';
import { PanelLeft, Search, Bell } from 'lucide-react';
import { useShell } from './shell-context';
import { currentUser } from '@/lib/mock/workspace';

export default function Topbar() {
  const { toggleNav, openOverlay } = useShell();
  const [query, setQuery] = useState('');

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: 'var(--elev)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: '11px 16px',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <button
        onClick={toggleNav}
        title="Sembunyikan / tampilkan panel"
        aria-label="Toggle panel navigasi"
        className="pax-btn-secondary"
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          flexShrink: 0,
          color: 'var(--text2)',
        }}
      >
        <PanelLeft size={17} />
      </button>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          flex: 1,
          maxWidth: 380,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 11,
          padding: '8px 12px',
        }}
      >
        <Search size={16} color="var(--text3)" />
        <input
          placeholder="Cari proyek, AHSP, dokumen…"
          aria-label="Cari"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            border: 'none',
            background: 'transparent',
            outline: 'none',
            flex: 1,
            fontSize: 13,
            color: 'var(--text)',
            minWidth: 0,
          }}
        />
        <span
          className="pax-mono"
          style={{ fontSize: 10, color: 'var(--text3)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 6px' }}
        >
          ⌘K
        </span>
      </div>

      <div style={{ flex: 1 }} />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          padding: '6px 12px',
          borderRadius: 10,
          background: 'color-mix(in srgb,var(--text) 5%,transparent)',
          border: '1px solid color-mix(in srgb,var(--text) 10%,transparent)',
        }}
      >
        <span
          style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--ok-dot)', animation: 'paxpulse 2.4s infinite' }}
        />
        <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text2)' }}>AI Ready</span>
      </div>

      <button
        onClick={() => openOverlay('notif')}
        aria-label="Notifikasi"
        style={{
          position: 'relative',
          width: 38,
          height: 38,
          borderRadius: 11,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        <Bell size={17} color="var(--text2)" />
        <span
          className="pax-mono"
          style={{
            position: 'absolute',
            top: -4,
            right: -4,
            minWidth: 16,
            height: 16,
            borderRadius: 8,
            background: 'var(--dng-dot)',
            color: '#fff',
            fontSize: 9.5,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 4px',
          }}
        >
          5
        </span>
      </button>

      <button
        onClick={() => openOverlay('account')}
        aria-label="Akun Saya"
        style={{
          width: 38,
          height: 38,
          borderRadius: 11,
          background: 'var(--brand-box)',
          color: 'var(--brand-ink)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 800,
          fontSize: 13,
          boxShadow: 'var(--emboss-sm)',
          cursor: 'pointer',
          border: 'none',
        }}
      >
        {currentUser.initials}
      </button>
    </header>
  );
}
