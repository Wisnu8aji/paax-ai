'use client';

import { useState } from 'react';
import { Plug, Check, LogOut, UploadCloud } from 'lucide-react';
import { Drawer } from '@/components/ui/drawer';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/badge';
import { useShell } from './shell-context';
import { useTheme, type PaaxTheme } from '@/components/theme/theme-provider';
import {
  notifications,
  connectedApps,
  currentUser,
  aiCredits,
} from '@/lib/mock/workspace';

const themeLabels: Record<PaaxTheme, string> = { light: 'Terang', dark: 'Gelap', grey: 'Abu' };

export function WorkspaceOverlays() {
  const { current, closeOverlay } = useShell();
  const { theme, setTheme, themes } = useTheme();
  const [form, setForm] = useState({ name: '', location: '', type: 'Gedung' });

  return (
    <>
      {/* Notifications */}
      <Drawer open={current === 'notif'} onClose={closeOverlay} title="Notifikasi">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {notifications.map((n) => (
            <div
              key={n.id}
              style={{ display: 'flex', gap: 10, padding: 12, borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 5, flexShrink: 0, background: n.tone === 'dng' ? 'var(--dng-dot)' : n.tone === 'warn' ? 'var(--warn-fg)' : 'var(--ok-dot)' }} />
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>{n.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2, lineHeight: 1.4 }}>{n.body}</div>
                <div className="pax-mono" style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 5 }}>{n.time}</div>
              </div>
            </div>
          ))}
        </div>
      </Drawer>

      {/* Connected apps */}
      <Drawer open={current === 'apps'} onClose={closeOverlay} title="Aplikasi Terhubung">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {connectedApps.map((a) => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <span style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)' }}>
                <Plug size={17} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{a.name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>{a.desc}</div>
              </div>
              <StatusPill tone={a.connected ? 'ok' : 'neutral'}>{a.connected ? 'TERHUBUNG' : 'HUBUNGKAN'}</StatusPill>
            </div>
          ))}
        </div>
      </Drawer>

      {/* Billing */}
      <Drawer open={current === 'billing'} onClose={closeOverlay} title="Langganan & Tagihan">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ padding: 14, borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text2)' }}>Paket Saat Ini</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>PRO · Bulanan</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>Perpanjang otomatis 01 Jul 2026</div>
          </div>
          <div style={{ padding: 14, borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
              <span style={{ fontSize: 12, color: 'var(--text2)' }}>AI Credits</span>
              <span className="pax-mono" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{aiCredits.pct}%</span>
            </div>
            <div style={{ height: 6, borderRadius: 4, background: 'color-mix(in srgb,var(--text) 8%,transparent)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${aiCredits.pct}%`, borderRadius: 4, background: 'var(--accent)' }} />
            </div>
            <div className="pax-mono" style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 6 }}>{aiCredits.used} / {aiCredits.total.toLocaleString('id-ID')} credits</div>
          </div>
        </div>
      </Drawer>

      {/* Account */}
      <Drawer open={current === 'account'} onClose={closeOverlay} title="Akun Saya" width={340}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <span style={{ width: 44, height: 44, borderRadius: 13, background: 'var(--brand-box)', color: 'var(--brand-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15 }}>{currentUser.initials}</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{currentUser.name}</div>
            <div className="pax-mono" style={{ fontSize: 11.5, color: 'var(--text3)' }}>{currentUser.email}</div>
          </div>
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text2)', marginBottom: 8 }}>Tema</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          {themes.map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              aria-pressed={theme === t}
              style={{
                flex: 1,
                padding: '9px 0',
                borderRadius: 10,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                color: theme === t ? 'var(--accent-ink)' : 'var(--text2)',
                background: theme === t ? 'var(--accent)' : 'var(--surface)',
                border: '1px solid var(--border)',
              }}
            >
              {themeLabels[t]}
            </button>
          ))}
        </div>

        <button
          className="pax-btn-secondary"
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 0', borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
        >
          <LogOut size={16} /> Keluar
        </button>
      </Drawer>

      {/* Upload */}
      <Drawer open={current === 'upload'} onClose={closeOverlay} title="Unggah File">
        <div
          style={{
            border: '1.5px dashed var(--border)',
            borderRadius: 14,
            padding: '36px 16px',
            textAlign: 'center',
            color: 'var(--text3)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <UploadCloud size={28} />
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)' }}>Tarik file ke sini</div>
          <div style={{ fontSize: 12 }}>PDF, DWG, gambar, atau spreadsheet · maks 50 MB</div>
          <Button variant="secondary" style={{ marginTop: 8 }}>Pilih File</Button>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 10 }}>Tampilan contoh — unggahan belum tersambung ke backend.</p>
      </Drawer>

      {/* New project */}
      <Modal
        open={current === 'newProject'}
        onClose={closeOverlay}
        title="Buat Proyek Baru"
        footer={
          <>
            <Button variant="secondary" onClick={closeOverlay}>Batal</Button>
            <Button onClick={closeOverlay}>Simpan</Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Nama Proyek">
            <input className="pax-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="mis. Gedung Kuliah Terpadu" />
          </Field>
          <Field label="Lokasi">
            <input className="pax-input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Kota, Provinsi" />
          </Field>
          <Field label="Tipe Proyek">
            <select className="pax-input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option>Gedung</option>
              <option>Infrastruktur</option>
              <option>Renovasi</option>
            </select>
          </Field>
          <p style={{ fontSize: 11, color: 'var(--text3)' }}>Tampilan contoh — proyek belum disimpan ke penyimpanan.</p>
        </div>
      </Modal>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text2)' }}>{label}</span>
      {children}
    </label>
  );
}
