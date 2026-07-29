// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, cleanup } from '@testing-library/react';
import { useBackendSync } from './use-backend-sync';
import { WorkspaceProvider } from './workspace-store';

describe('useBackendSync & Active Sheet Context', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('/project-graph/sheets/0/context')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              project_id: 'proj-101',
              page_index: 0,
              snapshot_id: 'snap-1',
              nodes: [
                {
                  id: 'node-col-1',
                  name: 'K1',
                  type: 'column',
                  properties: { page_index: 0 },
                },
              ],
              edges: [],
              review_queue: [],
              evidence_refs: ['page-0-ref'],
              metadata: {
                node_count: 1,
                edge_count: 0,
                review_count: 0,
                evidence_count: 1,
                is_active_sheet_only: true,
              },
            }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ items: [], snapshot_id: null, summary: { total: 0 } }),
      });
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('makes zero full-graph requests on workspace open', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <WorkspaceProvider projectId="proj-101">{children}</WorkspaceProvider>
    );

    renderHook(() => useBackendSync('proj-101'), { wrapper });

    await waitFor(() => {
      const calls = (fetch as any).mock.calls.map((c: any) => c[0]);
      expect(calls.some((url: string) => url.includes('/project-graph/retrieve'))).toBe(false);
      expect(calls.some((url: string) => url.includes('/project-graph/snapshot'))).toBe(false);
    });
  });
});
