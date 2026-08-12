// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, cleanup } from '@testing-library/react';
import { scopeRunRecords, selectBackendActiveRunId, useBackendSync } from './use-backend-sync';
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

  it('preserves the canonical selected run over an older backend active run', () => {
    expect(selectBackendActiveRunId('run-selected', [
      { id: 'run-old-active', status: 'processing' },
      { id: 'run-selected', status: 'synthesis_complete' },
    ])).toBe('run-selected');
    expect(selectBackendActiveRunId(null, [
      { id: 'run-old-active', status: 'processing' },
    ])).toBe('run-old-active');
  });

  it('scopes document records to the canonical run instead of mixing old runs', () => {
    const records = [
      { id: 'sheet-old', run_id: 'run-old' },
      { id: 'sheet-selected', run_id: 'run-selected' },
    ];
    expect(scopeRunRecords(records, 'run-selected')).toEqual([records[1]]);
    expect(scopeRunRecords(records, null)).toEqual(records);
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
