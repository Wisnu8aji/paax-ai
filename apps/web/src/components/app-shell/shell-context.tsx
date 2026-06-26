'use client';

import { createContext, useContext } from 'react';

export type OverlayName =
  | 'notif'
  | 'apps'
  | 'billing'
  | 'account'
  | 'newProject'
  | 'upload';

interface ShellContextValue {
  openOverlay: (name: OverlayName) => void;
  closeOverlay: () => void;
  current: OverlayName | null;
  navCollapsed: boolean;
  toggleNav: () => void;
}

export const ShellContext = createContext<ShellContextValue | null>(null);

export function useShell(): ShellContextValue {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error('useShell must be used within the dashboard shell');
  return ctx;
}
