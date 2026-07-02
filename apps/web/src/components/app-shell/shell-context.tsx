'use client';

import { createContext, useContext } from 'react';

export type OverlayName = 'newProject' | 'upload' | 'settings';

export type SettingsTab =
  | 'umum'
  | 'notifikasi'
  | 'personalisasi'
  | 'aplikasi'
  | 'tagihan'
  | 'penyimpanan'
  | 'akun';

interface ShellContextValue {
  openOverlay: (name: OverlayName) => void;
  closeOverlay: () => void;
  current: OverlayName | null;
  settingsTab: SettingsTab;
  openSettings: (tab: SettingsTab) => void;
  navCollapsed: boolean;
  toggleNav: () => void;
}

export const ShellContext = createContext<ShellContextValue | null>(null);

export function useShell(): ShellContextValue {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error('useShell must be used within the dashboard shell');
  return ctx;
}
