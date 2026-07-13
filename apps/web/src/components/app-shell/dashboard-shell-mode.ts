export interface DashboardShellMode {
  isCommandRoom: boolean;
  showOuterRail: boolean;
  mainMargin: string;
  mainHeight: string;
  mainRadius: string;
  mainBackground: string;
}

export function getDashboardShellMode(pathname: string): DashboardShellMode {
  const isCommandRoom = pathname.startsWith('/command-room');

  return isCommandRoom
    ? {
        isCommandRoom: true,
        showOuterRail: true,
        mainMargin: '0',
        mainHeight: '100dvh',
        mainRadius: '0',
        mainBackground: '#181818',
      }
    : {
        isCommandRoom: false,
        showOuterRail: true,
        mainMargin: '18px 28px 0 0',
        mainHeight: 'calc(100vh - 18px)',
        mainRadius: '34px 34px 0 0',
        mainBackground: 'var(--panel)',
      };
}
