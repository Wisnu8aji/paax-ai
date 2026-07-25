import { describe, expect, it } from 'vitest';

import { getDashboardShellMode } from './dashboard-shell-mode';

describe('dashboard shell mode', () => {
  it('makes Command Room full bleed but keeps the outer rail visible', () => {
    expect(getDashboardShellMode('/command-room')).toMatchObject({
      isCommandRoom: true,
      showOuterRail: true,
      mainMargin: '0',
      mainHeight: '100dvh',
      mainRadius: '0',
      mainBackground: '#181818',
    });
  });

  it('keeps the existing dashboard shell on other routes', () => {
    expect(getDashboardShellMode('/dashboard')).toMatchObject({
      isCommandRoom: false,
      showOuterRail: true,
      mainMargin: '18px 28px 0 0',
      mainHeight: 'calc(100vh - 18px)',
      mainRadius: '34px 34px 0 0',
    });
  });
});
