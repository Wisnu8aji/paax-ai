'use client';

import { useRouter } from 'next/navigation';
import { Bell, LayoutGrid, CreditCard, AlignLeft, Sparkles } from 'lucide-react';
import { useShell } from './shell-context';
import { currentUser } from '@/lib/mock/workspace';

const railBtn: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 12,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  transition: 'all .15s',
  color: 'rgba(255,255,255,0.85)',
  background: 'transparent',
  border: 'none',
};

export function IconRail() {
  const router = useRouter();
  const { openOverlay } = useShell();

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
          gap: 10,
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
          aria-label="Dashboard"
          style={{
            ...railBtn,
            width: 38,
            height: 38,
            background: 'rgba(255,255,255,0.08)',
            marginBottom: 6,
          }}
        >
          <Sparkles size={19} color="#fff" />
        </button>
        <button className="pax-rail-item" style={railBtn} title="Umum" aria-label="Umum" onClick={() => router.push('/dashboard')}>
          <AlignLeft size={19} />
        </button>
        <button className="pax-rail-item" style={{ ...railBtn, position: 'relative' }} title="Notifikasi" aria-label="Notifikasi" onClick={() => openOverlay('notif')}>
          <Bell size={19} />
          <span
            style={{
              position: 'absolute',
              top: 7,
              right: 9,
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: '#fff',
              border: '1.5px solid var(--rail-bg)',
            }}
          />
        </button>
        <button className="pax-rail-item" style={railBtn} title="Aplikasi Terhubung" aria-label="Aplikasi Terhubung" onClick={() => openOverlay('apps')}>
          <LayoutGrid size={19} />
        </button>
        <button className="pax-rail-item" style={railBtn} title="Langganan & Tagihan" aria-label="Langganan & Tagihan" onClick={() => openOverlay('billing')}>
          <CreditCard size={19} />
        </button>
        <div style={{ flex: 1 }} />
        <div
          style={{
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
            fontFamily: 'var(--font-mono)',
            fontSize: 8.5,
            letterSpacing: '0.22em',
            color: 'rgba(255,255,255,0.32)',
            textTransform: 'uppercase',
            padding: '6px 0',
          }}
        >
          PAAX · WORKSPACE
        </div>
      </div>
      <button
        onClick={() => openOverlay('account')}
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
