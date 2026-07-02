'use client';

/**
 * Pengaturan workspace — dialog terpusat 2 kolom (menu kiri, panel kanan).
 * Menggantikan drawer notif/apps/billing/account yang lama.
 *
 * Semua kontrol di sini adalah PREFERENSI TAMPILAN (disimpan lokal) atau data
 * contoh — tidak ada angka RAB/HSP yang dihitung di sini (Aturan Emas).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Bell,
  CreditCard,
  HardDrive,
  LayoutGrid,
  LogOut,
  Palette,
  Plug,
  SlidersHorizontal,
  UserRound,
  X,
} from 'lucide-react';
import { StatusPill } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useShell, type SettingsTab } from './shell-context';
import { useTheme, type PaaxTheme } from '@/components/theme/theme-provider';
import { notifications, connectedApps, currentUser, aiCredits } from '@/lib/mock/workspace';

const themeLabels: Record<PaaxTheme, string> = { light: 'Terang', dark: 'Gelap', grey: 'Abu' };

const TABS: { key: SettingsTab; label: string; icon: typeof Bell }[] = [
  { key: 'umum', label: 'Umum', icon: SlidersHorizontal },
  { key: 'notifikasi', label: 'Notifikasi', icon: Bell },
  { key: 'personalisasi', label: 'Personalisasi', icon: Palette },
  { key: 'aplikasi', label: 'Aplikasi', icon: LayoutGrid },
  { key: 'tagihan', label: 'Tagihan', icon: CreditCard },
  { key: 'penyimpanan', label: 'Penyimpanan', icon: HardDrive },
  { key: 'akun', label: 'Akun', icon: UserRound },
];

interface Prefs {
  emailNotif: boolean;
  approvalKuantitas: boolean;
  mention: boolean;
  alertBiaya: boolean;
  alertJadwal: boolean;
  ringkasanMingguan: boolean;
  autosave: boolean;
  bahasa: string;
  zonaWaktu: string;
  kepadatan: 'nyaman' | 'kompak';
}

const DEFAULT_PREFS: Prefs = {
  emailNotif: true,
  approvalKuantitas: true,
  mention: true,
  alertBiaya: true,
  alertJadwal: false,
  ringkasanMingguan: true,
  autosave: true,
  bahasa: 'id',
  zonaWaktu: 'WIB',
  kepadatan: 'nyaman',
};

const PREFS_KEY = 'paax-prefs-v1';

function loadPrefs(): Prefs {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (raw) return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    /* ignore */
  }
  return DEFAULT_PREFS;
}

export function SettingsDialog() {
  const { current, settingsTab, openSettings, closeOverlay } = useShell();
  const { theme, setTheme, themes } = useTheme();
  const open = current === 'settings';
  const panelRef = useRef<HTMLDivElement>(null);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);

  useEffect(() => {
    setPrefs(loadPrefs());
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeOverlay();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, closeOverlay]);

  function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]) {
    setPrefs((p) => {
      const next = { ...p, [key]: value };
      try {
        window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  if (!open) return null;

  const activeLabel = TABS.find((t) => t.key === settingsTab)?.label ?? 'Pengaturan';

  return (
    <div
      role="presentation"
      onClick={closeOverlay}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 70,
        background: 'rgba(10,10,12,0.5)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Pengaturan — ${activeLabel}`}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="pax-settings-panel"
        style={{
          width: 820,
          maxWidth: '94vw',
          height: 'min(600px, 88vh)',
          background: 'var(--elev)',
          border: '1px solid var(--border)',
          borderRadius: 20,
          boxShadow: 'var(--shadow-modal)',
          overflow: 'hidden',
          animation: 'paxfade .2s ease',
          outline: 'none',
        }}
      >
        {/* Kolom kiri: menu kategori */}
        <nav className="pax-settings-nav" role="tablist" aria-label="Kategori pengaturan" style={{ background: 'var(--surface)' }}>
          <div
            className="pax-display pax-settings-nav-title"
            style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', padding: '18px 18px 12px' }}
          >
            Pengaturan
          </div>
          <div className="pax-settings-nav-items">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = settingsTab === t.key;
              return (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={active}
                  onClick={() => openSettings(t.key)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '9px 12px',
                    borderRadius: 10,
                    border: 'none',
                    background: active ? 'var(--side-active-bg)' : 'transparent',
                    color: active ? 'var(--side-active-ink)' : 'var(--text2)',
                    fontSize: 13,
                    fontWeight: active ? 600 : 500,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'background .15s, color .15s',
                    textAlign: 'left',
                  }}
                >
                  <Icon size={16} strokeWidth={1.5} />
                  {t.label}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Kolom kanan: panel kontrol */}
        <section
          role="tabpanel"
          aria-label={activeLabel}
          style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-soft)',
            }}
          >
            <span className="pax-display" style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
              {activeLabel}
            </span>
            <button
              onClick={closeOverlay}
              aria-label="Tutup pengaturan"
              style={{
                width: 32,
                height: 32,
                borderRadius: 9,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <X size={15} strokeWidth={1.5} />
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
            {settingsTab === 'umum' && (
              <Stack>
                <SelectRow
                  label="Bahasa"
                  desc="Bahasa antarmuka workspace."
                  value={prefs.bahasa}
                  onChange={(v) => setPref('bahasa', v)}
                  options={[
                    { value: 'id', label: 'Bahasa Indonesia' },
                    { value: 'en', label: 'English' },
                  ]}
                />
                <SelectRow
                  label="Zona Waktu"
                  desc="Dipakai untuk stempel waktu laporan & notifikasi."
                  value={prefs.zonaWaktu}
                  onChange={(v) => setPref('zonaWaktu', v)}
                  options={[
                    { value: 'WIB', label: 'WIB — Jakarta (UTC+7)' },
                    { value: 'WITA', label: 'WITA — Makassar (UTC+8)' },
                    { value: 'WIT', label: 'WIT — Jayapura (UTC+9)' },
                  ]}
                />
                <ToggleRow
                  label="Simpan otomatis"
                  desc="Draft RAB & transkrip disimpan otomatis saat diedit."
                  checked={prefs.autosave}
                  onChange={(v) => setPref('autosave', v)}
                />
                <Note>Preferensi disimpan lokal di perangkat ini.</Note>
              </Stack>
            )}

            {settingsTab === 'notifikasi' && (
              <Stack>
                <ToggleRow
                  label="Notifikasi email"
                  desc="Kirim ringkasan aktivitas penting ke email."
                  checked={prefs.emailNotif}
                  onChange={(v) => setPref('emailNotif', v)}
                />
                <ToggleRow
                  label="Persetujuan kuantitas"
                  desc="Beri tahu saat kandidat kuantitas menunggu verifikasi."
                  checked={prefs.approvalKuantitas}
                  onChange={(v) => setPref('approvalKuantitas', v)}
                />
                <ToggleRow
                  label="Sebutan (@mention)"
                  desc="Saat rekan menyebut Anda di komentar atau chat."
                  checked={prefs.mention}
                  onChange={(v) => setPref('mention', v)}
                />
                <ToggleRow
                  label="Alert biaya"
                  desc="Harga satuan menyimpang dari SHSD wilayah."
                  checked={prefs.alertBiaya}
                  onChange={(v) => setPref('alertBiaya', v)}
                />
                <ToggleRow
                  label="Alert jadwal"
                  desc="Aktivitas jalur kritis terlambat dari rencana."
                  checked={prefs.alertJadwal}
                  onChange={(v) => setPref('alertJadwal', v)}
                />
                <ToggleRow
                  label="Ringkasan mingguan"
                  desc="Rekap progres semua proyek setiap Senin pagi."
                  checked={prefs.ringkasanMingguan}
                  onChange={(v) => setPref('ringkasanMingguan', v)}
                />

                <SectionLabel>Terbaru</SectionLabel>
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    style={{
                      display: 'flex',
                      gap: 10,
                      padding: 12,
                      borderRadius: 12,
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        marginTop: 5,
                        flexShrink: 0,
                        background: n.tone === 'dng' ? 'var(--dng-dot)' : n.tone === 'warn' ? 'var(--warn-fg)' : 'var(--ok-dot)',
                      }}
                    />
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>{n.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2, lineHeight: 1.4 }}>{n.body}</div>
                      <div className="pax-mono" style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 5 }}>{n.time}</div>
                    </div>
                  </div>
                ))}
              </Stack>
            )}

            {settingsTab === 'personalisasi' && (
              <Stack>
                <SectionLabel>Tema</SectionLabel>
                <div style={{ display: 'flex', gap: 8 }}>
                  {themes.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTheme(t)}
                      aria-pressed={theme === t}
                      style={{
                        flex: 1,
                        padding: '10px 0',
                        borderRadius: 10,
                        fontSize: 12.5,
                        fontWeight: 600,
                        cursor: 'pointer',
                        color: theme === t ? 'var(--accent-ink)' : 'var(--text2)',
                        background: theme === t ? 'var(--accent)' : 'var(--surface)',
                        border: '1px solid var(--border)',
                        transition: 'background .15s, color .15s',
                      }}
                    >
                      {themeLabels[t]}
                    </button>
                  ))}
                </div>

                <SectionLabel>Kepadatan tampilan</SectionLabel>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['nyaman', 'kompak'] as const).map((d) => (
                    <button
                      key={d}
                      onClick={() => setPref('kepadatan', d)}
                      aria-pressed={prefs.kepadatan === d}
                      style={{
                        flex: 1,
                        padding: '10px 0',
                        borderRadius: 10,
                        fontSize: 12.5,
                        fontWeight: 600,
                        cursor: 'pointer',
                        textTransform: 'capitalize',
                        color: prefs.kepadatan === d ? 'var(--accent-ink)' : 'var(--text2)',
                        background: prefs.kepadatan === d ? 'var(--accent)' : 'var(--surface)',
                        border: '1px solid var(--border)',
                        transition: 'background .15s, color .15s',
                      }}
                    >
                      {d}
                    </button>
                  ))}
                </div>
                <Note>Kepadatan memengaruhi jarak baris tabel pada rilis berikutnya.</Note>
              </Stack>
            )}

            {settingsTab === 'aplikasi' && (
              <Stack>
                {connectedApps.map((a) => (
                  <div
                    key={a.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: 12,
                      borderRadius: 12,
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <span
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 10,
                        background: 'var(--surface2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--text2)',
                        flexShrink: 0,
                      }}
                    >
                      <Plug size={16} strokeWidth={1.5} />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{a.name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>{a.desc}</div>
                    </div>
                    <StatusPill tone={a.connected ? 'ok' : 'neutral'}>{a.connected ? 'TERHUBUNG' : 'HUBUNGKAN'}</StatusPill>
                  </div>
                ))}
              </Stack>
            )}

            {settingsTab === 'tagihan' && (
              <Stack>
                <div style={{ padding: 14, borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <SectionLabel style={{ margin: 0 }}>Paket Saat Ini</SectionLabel>
                  <div className="pax-display" style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>
                    PRO — Bulanan
                  </div>
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
                  <div className="pax-mono" style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 6 }}>
                    {aiCredits.used} / {aiCredits.total.toLocaleString('id-ID')} credits
                  </div>
                </div>
              </Stack>
            )}

            {settingsTab === 'penyimpanan' && (
              <Stack>
                <div style={{ padding: 14, borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
                    <span style={{ fontSize: 12, color: 'var(--text2)' }}>Terpakai</span>
                    <span className="pax-mono" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>6,4 GB / 10 GB</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 4, background: 'color-mix(in srgb,var(--text) 8%,transparent)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: '64%', borderRadius: 4, background: 'var(--accent)' }} />
                  </div>
                </div>
                {[
                  { label: 'Gambar kerja & PDF', size: '4,1 GB' },
                  { label: 'Foto lapangan', size: '1,6 GB' },
                  { label: 'Dokumen & spreadsheet', size: '0,7 GB' },
                ].map((row) => (
                  <div
                    key={row.label}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '11px 14px',
                      borderRadius: 12,
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <span style={{ fontSize: 12.5, color: 'var(--text2)' }}>{row.label}</span>
                    <span className="pax-mono" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{row.size}</span>
                  </div>
                ))}
                <Note>Data contoh — kuota penyimpanan tersambung ke backend pada rilis berikutnya.</Note>
              </Stack>
            )}

            {settingsTab === 'akun' && (
              <Stack>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 14,
                      background: 'var(--brand-box)',
                      color: 'var(--brand-ink)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 800,
                      fontSize: 16,
                    }}
                  >
                    {currentUser.initials}
                  </span>
                  <div>
                    <div className="pax-display" style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{currentUser.name}</div>
                    <div className="pax-mono" style={{ fontSize: 11.5, color: 'var(--text3)' }}>{currentUser.email}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 2 }}>{currentUser.role}</div>
                  </div>
                </div>
                <button
                  className="pax-btn-secondary"
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    padding: '10px 0',
                    borderRadius: 10,
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--text2)',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  <LogOut size={15} strokeWidth={1.5} /> Keluar
                </button>
              </Stack>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Stack({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>;
}

function SectionLabel({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--text2)',
        marginTop: 8,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p style={{ margin: 0, fontSize: 11, color: 'var(--text3)' }}>{children}</p>;
}

function ToggleRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '4px 14px',
        borderRadius: 12,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
      }}
    >
      <div style={{ flex: 1, minWidth: 0, padding: '10px 0' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{label}</div>
        <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 1 }}>{desc}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} label={label} />
    </div>
  );
}

function SelectRow({
  label,
  desc,
  value,
  onChange,
  options,
}: {
  label: string;
  desc: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '10px 14px',
        borderRadius: 12,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{label}</div>
        <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 1 }}>{desc}</div>
      </div>
      <select
        className="pax-input"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: 200, flexShrink: 0 }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
