'use client';

import { useCallback, useState } from 'react';
import { ThemeProvider, useTheme } from '@/components/theme/theme-provider';
import { ShellContext, type OverlayName, type SettingsTab } from '@/components/app-shell/shell-context';
import { IconRail } from '@/components/app-shell/icon-rail';
import { NavPanel } from '@/components/app-shell/nav-panel';
import Topbar from '@/components/app-shell/topbar';
import { WorkspaceOverlays } from '@/components/app-shell/overlays';
import { RoutePrefetcher } from '@/components/app-shell/route-prefetcher';
import { ProjectsProvider } from '@/lib/projects/projects-context';

function Shell({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const [current, setCurrent] = useState<OverlayName | null>(null);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('umum');
  const [navCollapsed, setNavCollapsed] = useState(false);

  const openOverlay = useCallback((name: OverlayName) => setCurrent(name), []);
  const closeOverlay = useCallback(() => setCurrent(null), []);
  const openSettings = useCallback((tab: SettingsTab) => {
    setSettingsTab(tab);
    setCurrent('settings');
  }, []);
  const toggleNav = useCallback(() => setNavCollapsed((c) => !c), []);

  return (
    <ShellContext.Provider
      value={{ current, openOverlay, closeOverlay, settingsTab, openSettings, navCollapsed, toggleNav }}
    >
      <div
        data-theme={theme}
        className="pax-scope"
        style={{
          display: 'flex',
          gap: 16,
          padding: 16,
          minHeight: '100vh',
          background: 'var(--bg)',
          color: 'var(--text)',
          fontFamily: 'var(--font-sans)',
        }}
      >
        <IconRail />
        <NavPanel collapsed={navCollapsed} />
        <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Topbar />
          <div style={{ flex: 1, minWidth: 0 }} className="pax-fade">
            {children}
          </div>
        </main>
        <WorkspaceOverlays />
      </div>
    </ShellContext.Provider>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ProjectsProvider>
        <RoutePrefetcher />
        <Shell>{children}</Shell>
      </ProjectsProvider>
    </ThemeProvider>
  );
}
