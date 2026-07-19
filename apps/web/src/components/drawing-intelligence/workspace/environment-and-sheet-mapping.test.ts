import { describe, expect, it } from 'vitest';

import { canUseWorkspaceMocks, resolveWorkspaceEnvironmentMode } from './environment';
import { mapProjectDemSheet } from './sheet-mapping';

describe('Drawing Intelligence environment modes', () => {
  it('fails closed in production even when a caller requests mock data', () => {
    expect(canUseWorkspaceMocks(resolveWorkspaceEnvironmentMode('production'))).toBe(false);
    expect(canUseWorkspaceMocks(resolveWorkspaceEnvironmentMode(undefined))).toBe(false);
  });
});

describe('real DEM sheet mapping', () => {
  it('preserves unknown fields instead of inventing sheet metadata', () => {
    expect(mapProjectDemSheet({ run_id: 'run-1', page_index: 0, file_name: 'drawing.pdf', status: 'completed' })).toEqual({
      id: 'run-1-page-0', number: null, title: null, discipline: null, level: null,
      scale: null, revision: null, confidence: null, status: 'completed', imageUrl: null,
    });
  });

  it('maps only explicit backend fields', () => {
    expect(mapProjectDemSheet({
      run_id: 'run-1', page_index: 2, file_name: 'drawing.pdf', status: 'analyzed',
      sheet_number: 'S-201', sheet_title: 'Struktur Lantai 2', discipline: 'STR', level: 'L2',
      scale: '1:100', revision: 'R2', confidence: 0.92, thumbnail_url: '/sheet.png',
    })).toMatchObject({ number: 'S-201', title: 'Struktur Lantai 2', discipline: 'STR', level: 'L2', scale: '1:100', revision: 'R2', confidence: 0.92, imageUrl: '/sheet.png' });
  });
});
