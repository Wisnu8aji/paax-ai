'use client';

import { Button, Card, PageHeader } from '@/components/ui';
import { useShell } from '@/components/app-shell/shell-context';
import { useTheme, type PaaxTheme } from '@/components/theme/theme-provider';
import { currentUser } from '@/lib/mock/workspace';

const themeLabels: Record<PaaxTheme, string> = { light: 'Terang', dark: 'Gelap', grey: 'Abu' };
const themeSwatch: Record<PaaxTheme, string> = { light: '#ECEBE6', dark: '#1D1D22', grey: '#5C5C5E' };

export default function PengaturanPage() {
  const { theme, setTheme, themes } = useTheme();
  const { openSettings } = useShell();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title="Pengaturan"
        subtitle="Profil, tampilan, dan preferensi workspace"
        actions={<Button variant="secondary" onClick={() => openSettings('umum')}>Buka Pengaturan Lengkap</Button>}
      />

      <Card padding={20}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Tampilan</div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14 }}>Pilih tema workspace. Preferensi disimpan di peramban Anda.</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {themes.map((t) => {
            const active = theme === t;
            return (
              <button
                key={t}
                onClick={() => setTheme(t)}
                aria-pressed={active}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 16px',
                  borderRadius: 12,
                  cursor: 'pointer',
                  background: 'var(--surface)',
                  border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                  color: 'var(--text)',
                  minWidth: 140,
                }}
              >
                <span style={{ width: 26, height: 26, borderRadius: 8, background: themeSwatch[t], border: '1px solid var(--border)' }} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>{themeLabels[t]}</span>
              </button>
            );
          })}
        </div>
      </Card>

      <Card padding={20}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 14 }}>Profil</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }} className="pax-grid-2">
          <Row label="Nama" value={currentUser.name} />
          <Row label="Email" value={currentUser.email} mono />
          <Row label="Peran" value={currentUser.role} />
          <Row label="Workspace" value="PAAX · Civil Engineering" />
        </div>
      </Card>
      <p style={{ fontSize: 11, color: 'var(--text3)' }}>Data contoh — profil belum tersambung ke autentikasi.</p>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text3)' }}>{label}</span>
      <span className={mono ? 'pax-mono' : undefined} style={{ fontSize: 13.5, color: 'var(--text)' }}>{value}</span>
    </div>
  );
}
