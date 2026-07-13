'use client';

import { useCallback, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ThemeProvider, useTheme } from '@/components/theme/theme-provider';
import { ShellContext, type OverlayName, type SettingsTab } from '@/components/app-shell/shell-context';
import { SideRail } from '@/components/app-shell/side-rail';
import Topbar from '@/components/app-shell/topbar';
import { WorkspaceOverlays } from '@/components/app-shell/overlays';
import { RoutePrefetcher } from '@/components/app-shell/route-prefetcher';
import { ProjectsProvider } from '@/lib/projects/projects-context';
import { getDashboardShellMode } from '@/components/app-shell/dashboard-shell-mode';

/**
 * Shell rombak 2026-07-07 (referensi G:\Dashboard\dashboard utama):
 * SATU container rounded besar mengambang di atas --bg, berisi sidebar
 * gelap (kiri, radius kiri besar) + area konten terang (--panel).
 * Command Room (/command-room) full-bleed gelap tanpa topbar.
 */
function Shell({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const pathname = usePathname();
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

  const shellMode = getDashboardShellMode(pathname);
  const { isCommandRoom } = shellMode;

  return (
    <ShellContext.Provider
      value={{ current, openOverlay, closeOverlay, settingsTab, openSettings, navCollapsed, toggleNav }}
    >
      <div
        data-theme={theme}
        className="pax-scope"
        style={{
          minHeight: '100vh',
          background: 'var(--shell-bg)',
          color: 'var(--text)',
          fontFamily: 'var(--font-sans)',
          padding: 0,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            minHeight: '100vh',
            alignItems: 'stretch',
            transition: 'background .3s var(--ease)',
          }}
        >
          {shellMode.showOuterRail && <SideRail />}
          <main
            className="pax-shell-main"
            data-command-room={isCommandRoom ? 'true' : undefined}
            style={{
              flex: 1,
              minWidth: 0,
              margin: shellMode.mainMargin,
              display: 'flex',
              flexDirection: 'column',
              gap: isCommandRoom ? 0 : 14,
              height: shellMode.mainHeight,
              padding: isCommandRoom ? 0 : '16px 22px 28px',
              background: shellMode.mainBackground,
              borderRadius: shellMode.mainRadius,
              boxShadow: isCommandRoom ? 'none' : 'var(--shadow-shell-panel)',
              overflow: 'hidden',
            }}
          >
            {!isCommandRoom && <Topbar />}
            <div
              style={{
                flex: 1,
                minWidth: 0,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                overflowY: isCommandRoom ? 'hidden' : 'auto',
                overflowX: 'hidden',
              }}
              className="pax-fade"
              key={pathname}
            >
              {children}
            </div>
          </main>
        </div>
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
