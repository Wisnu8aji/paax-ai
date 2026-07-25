'use client';

import { useState } from 'react';
import { Search, Bell, Settings } from 'lucide-react';
import { useShell } from './shell-context';

/**
 * Header area konten (rombak 2026-07-07, referensi dashboard utama):
 * search pill kiri (inset shadow), status AI kecil + gear + bell kanan.
 * Tidak lagi berupa kartu kaca terpisah — menyatu dengan main container.
 */
export default function Topbar() {
  const { openSettings } = useShell();
  const [query, setQuery] = useState('');

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '4px 2px',
      }}
    >
      <div className="pax-search-pill" style={{ flex: 1, maxWidth: 420 }}>
        <Search size={15} color="var(--text3)" />
        <input
          placeholder="Search"
          aria-label="Cari"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            border: 'none',
            background: 'transparent',
            outline: 'none',
            flex: 1,
            fontSize: 12.5,
            color: 'var(--text)',
            minWidth: 0,
          }}
        />
        <span
          className="pax-mono"
          style={{
            fontSize: 9.5,
            color: 'var(--text3)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '1px 6px',
          }}
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
          padding: '5px 11px',
          borderRadius: 999,
          background: 'var(--surface)',
          border: '1px solid var(--border-soft)',
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'var(--ok-dot)',
            animation: 'paxpulse 2.4s infinite',
          }}
        />
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)' }}>AI Ready</span>
      </div>

      <button
        onClick={() => openSettings('umum')}
        aria-label="Settings"
        className="pax-btn-ghost pax-press"
        style={{
          width: 36,
          height: 36,
          borderRadius: 11,
          background: 'transparent',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: 'var(--text2)',
        }}
      >
        <Settings size={17} strokeWidth={1.7} />
      </button>

      <button
        onClick={() => openSettings('notifikasi')}
        aria-label="Notifikasi"
        className="pax-btn-ghost pax-press"
        style={{
          position: 'relative',
          width: 36,
          height: 36,
          borderRadius: 11,
          background: 'transparent',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: 'var(--text2)',
        }}
      >
        <Bell size={17} strokeWidth={1.7} />
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 7,
            right: 8,
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: 'var(--gold)',
            border: '2px solid var(--panel)',
          }}
        />
      </button>
    </header>
  );
}
