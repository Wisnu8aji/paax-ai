// @vitest-environment jsdom
// TEMP probe: dump fetch mock calls at error-panel point.
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MissionControl } from '../agentic/mission-control';
import { WorkspaceProvider } from '../workspace-store';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('probe', () => {
  it('dumps fetch calls at error panel', async () => {
    const originalFetch = global.fetch;
    (global as any).fetch = vi.fn();
    (global as any).fetch.mockResolvedValueOnce({ ok: true, json: async () => [] });

    render(
      <WorkspaceProvider projectId="proj-123">
        <MissionControl />
      </WorkspaceProvider>,
    );

    await screen.findByText('Belum ada agent run untuk project ini.');
    let calls = (global as any).fetch.mock.calls.map((c: any[]) => `${c[0]} ${c[1]?.method ?? ''}`);
    console.log('AFTER_INITIAL_LOAD:', JSON.stringify(calls));

    (global as any).fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Create run failed 500' }),
    });

    const createBtn = screen.getByRole('button', { name: /buat plan terikat proyek/i });
    fireEvent.click(createBtn);
    await screen.findByTestId('mission-error-panel');

    calls = (global as any).fetch.mock.calls.map((c: any[]) => `${c[0]} ${c[1]?.method ?? ''}`);
    console.log('AFTER_ERROR_PANEL:', JSON.stringify(calls));
    (global as any).fetch = originalFetch;
    expect(true).toBe(true);
  });
});
