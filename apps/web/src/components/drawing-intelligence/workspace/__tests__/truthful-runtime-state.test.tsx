// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import React from 'react';

import { WorkspaceProvider, useWorkspace } from '../workspace-store';
import { canDisplayFinalQuantity } from '../quantity-authority';
import { useBackendSync } from '../use-backend-sync';

// Mock API layer to model real HTTP backend states
vi.mock('../../drawing-intelligence-api', () => ({
  fetchReviewQueue: vi.fn(),
  fetchQuantityReadiness: vi.fn(),
  fetchCivilWorkItems: vi.fn(),
  fetchProjectDemSheets: vi.fn(),
  fetchProjectDemRuns: vi.fn(),
  fetchSummaryViews: vi.fn(),
  fetchPackageIntelligence: vi.fn(),
  fetchActiveSheetContext: vi.fn(),
  fetchDrawingPackageIndex: vi.fn(),
  retrieveProjectGraph: vi.fn(),
}));

import * as api from '../../drawing-intelligence-api';

function TestSyncConsumer({ projectId }: { projectId: string | null }) {
  useBackendSync(projectId);
  const { state } = useWorkspace();

  return (
    <div>
      <div data-testid="backend-status">
        {state.backendConnected ? 'connected' : state.backendSyncError || 'loading'}
      </div>
      <div data-testid="sheet-count">{state.sheets.length}</div>
      <div data-testid="mapped-sheet-count">{state.mappedSheets.length}</div>
      <div data-testid="file-count">{state.files.length}</div>
      <div data-testid="quantity-count">{state.quantities.length}</div>
    </div>
  );
}

describe('Phase 09D Truthful Runtime State Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.fetchCivilWorkItems as any).mockResolvedValue(null);
    (api.fetchPackageIntelligence as any).mockResolvedValue(null);
    (api.fetchActiveSheetContext as any).mockResolvedValue(null);
    (api.fetchDrawingPackageIndex as any).mockResolvedValue(null);
    (api.retrieveProjectGraph as any).mockResolvedValue({ query: '', answer: '', nodes: [] });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('1. Initial load displays loading / uninitialized state before backend responds', () => {
    (api.fetchReviewQueue as any).mockReturnValue(new Promise(() => {})); // Never resolves
    (api.fetchQuantityReadiness as any).mockReturnValue(new Promise(() => {}));
    (api.fetchProjectDemSheets as any).mockReturnValue(new Promise(() => {}));
    (api.fetchProjectDemRuns as any).mockReturnValue(new Promise(() => {}));
    (api.fetchSummaryViews as any).mockReturnValue(new Promise(() => {}));

    const { getByTestId } = render(
      <WorkspaceProvider projectId="proj-123">
        <TestSyncConsumer projectId="proj-123" />
      </WorkspaceProvider>
    );

    expect(getByTestId('backend-status').textContent).toBe('loading');
    expect(getByTestId('sheet-count').textContent).toBe('0');
    expect(getByTestId('mapped-sheet-count').textContent).toBe('0');
    expect(getByTestId('file-count').textContent).toBe('0');
  });

  it('2. Missing project/run produces truthful not-ready state without fallback to mock sheets/quantities', async () => {
    (api.fetchReviewQueue as any).mockResolvedValue({ items: [], snapshot_id: null });
    (api.fetchQuantityReadiness as any).mockResolvedValue({ items: [], snapshot_id: null, summary: { total: 0, ready: 0, needs_review: 0 } });
    (api.fetchProjectDemSheets as any).mockResolvedValue([]);
    (api.fetchProjectDemRuns as any).mockResolvedValue([]);
    (api.fetchSummaryViews as any).mockResolvedValue([]);

    const { getByTestId } = render(
      <WorkspaceProvider projectId="proj-empty">
        <TestSyncConsumer projectId="proj-empty" />
      </WorkspaceProvider>
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(getByTestId('backend-status').textContent).toBe('not-ready');
    expect(getByTestId('sheet-count').textContent).toBe('0');
    expect(getByTestId('mapped-sheet-count').textContent).toBe('0');
    expect(getByTestId('file-count').textContent).toBe('0');
    expect(getByTestId('quantity-count').textContent).toBe('0');
  });

  it('3. Backend API rejection produces typed error state without fallback to mock data', async () => {
    (api.fetchReviewQueue as any).mockRejectedValue(new Error('Backend 500 Internal Error'));
    (api.fetchQuantityReadiness as any).mockRejectedValue(new Error('Backend 500 Internal Error'));
    (api.fetchProjectDemSheets as any).mockRejectedValue(new Error('Backend 500 Internal Error'));
    (api.fetchProjectDemRuns as any).mockRejectedValue(new Error('Backend 500 Internal Error'));
    (api.fetchSummaryViews as any).mockRejectedValue(new Error('Backend 500 Internal Error'));

    const { getByTestId } = render(
      <WorkspaceProvider projectId="proj-error">
        <TestSyncConsumer projectId="proj-error" />
      </WorkspaceProvider>
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(getByTestId('backend-status').textContent).toBe('not-ready');
    expect(getByTestId('sheet-count').textContent).toBe('0');
    expect(getByTestId('file-count').textContent).toBe('0');
  });

  it('4. Processing progress state preserves real run status without forcing 100% completion', async () => {
    (api.fetchReviewQueue as any).mockResolvedValue({ items: [], snapshot_id: 'snap-1' });
    (api.fetchQuantityReadiness as any).mockResolvedValue({ items: [], snapshot_id: 'snap-1', summary: { total: 0, ready: 0, needs_review: 0 } });
    (api.fetchProjectDemSheets as any).mockResolvedValue([]);
    (api.fetchProjectDemRuns as any).mockResolvedValue([
      {
        id: 'run-1',
        file_name: 'Struktur_Gedung.pdf',
        status: 'pages_extracting',
        total_pages: 4,
        created_at: '2026-07-30T00:00:00Z',
      },
    ]);
    (api.fetchSummaryViews as any).mockResolvedValue([]);

    const { getByTestId } = render(
      <WorkspaceProvider projectId="proj-processing">
        <TestSyncConsumer projectId="proj-processing" />
      </WorkspaceProvider>
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(getByTestId('backend-status').textContent).toBe('connected');
    expect(getByTestId('file-count').textContent).toBe('1');
    expect(getByTestId('mapped-sheet-count').textContent).toBe('4');
  });

  it('5. Quantity authority strictly gates display: canDisplayFinalQuantity requires sourceAuthority === "core_engine"', () => {
    expect(canDisplayFinalQuantity({ sourceAuthority: 'core_engine' })).toBe(true);
    expect(canDisplayFinalQuantity({ sourceAuthority: 'none' })).toBe(false);
    expect(canDisplayFinalQuantity({ sourceAuthority: 'proposal' })).toBe(false);
    expect(canDisplayFinalQuantity({ sourceAuthority: 'review' })).toBe(false);
    expect(canDisplayFinalQuantity({ sourceAuthority: 'measurement_fact' })).toBe(false);
  });
});
