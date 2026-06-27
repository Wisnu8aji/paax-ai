'use client';

import { UserPlus } from 'lucide-react';
import { Card, Button, StatusPill, PageHeader } from '@/components/ui';
import { members } from '@/lib/mock/workspace';

export default function KolaborasiPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title="Kolaborasi"
        subtitle="Anggota tim & hak akses workspace"
        actions={
          <Button>
            <UserPlus size={15} /> Undang Anggota
          </Button>
        }
      />

      <Card padding={0}>
        {members.map((m, i) => (
          <div
            key={m.id}
            className="pax-row-hover"
            style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px', borderBottom: i < members.length - 1 ? '1px solid var(--border-soft)' : 'none' }}
          >
            <div style={{ position: 'relative' }}>
              <span style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--brand-box)', color: 'var(--brand-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 }}>
                {m.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
              </span>
              <span style={{ position: 'absolute', bottom: -1, right: -1, width: 11, height: 11, borderRadius: '50%', background: m.online ? 'var(--ok-dot)' : 'var(--text3)', border: '2px solid var(--elev)' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{m.name}</div>
              <div className="pax-mono" style={{ fontSize: 11, color: 'var(--text3)' }}>{m.email}</div>
            </div>
            <StatusPill tone="neutral">{m.role}</StatusPill>
          </div>
        ))}
      </Card>
      <p style={{ fontSize: 11, color: 'var(--text3)' }}>Data contoh — manajemen anggota belum tersambung ke backend.</p>
    </div>
  );
}
