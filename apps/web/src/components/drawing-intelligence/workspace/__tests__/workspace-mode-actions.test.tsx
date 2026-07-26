// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { TakeoffInspector } from '../takeoff/takeoff-inspector';
import { WorkspaceProvider } from '../workspace-store';
import * as api from '../../drawing-intelligence-api';

// Mock API layer
vi.mock('../../drawing-intelligence-api', () => ({
  calculateDrawingIntelligenceWorkItem: vi.fn(),
  fetchCivilWorkItems: vi.fn(),
  fetchQuantityReadiness: vi.fn(),
  fetchSummaryViews: vi.fn().mockResolvedValue([]),
  fetchReviewQueue: vi.fn().mockResolvedValue({ items: [], summary: { total: 0 } }),
  fetchProjectDemSheets: vi.fn().mockResolvedValue([]),
  fetchProjectDemRuns: vi.fn().mockResolvedValue([]),
  fetchPackageIntelligence: vi.fn().mockResolvedValue(null),
}));

const mockCalculate = vi.mocked(api.calculateDrawingIntelligenceWorkItem);
const mockFetchCivil = vi.mocked(api.fetchCivilWorkItems);
const mockFetchReadiness = vi.mocked(api.fetchQuantityReadiness);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('TakeoffInspector — Backend Failure Recovery (Phase 5A)', () => {
  beforeEach(() => {
    mockFetchReadiness.mockResolvedValue({
      project_id: 'proj-123',
      snapshot_id: 'snap-1',
      items: [],
      summary: { total: 0, ready: 0, needs_review: 0, blocked: 0 },
    });
    mockFetchCivil.mockResolvedValue({
      schema_version: '1.0',
      project_id: 'proj-123',
      source_document_sha256: 'sha-abc',
      generated_from: 'dem',
      items: [],
      summary: { total: 0, ready: 0, needs_review: 0, by_location: {} },
    });
    mockCalculate.mockResolvedValue({
      calculation_id: 'calc-1',
      work_item_id: 'q-1',
      calculation_type: 'volume',
      status: 'complete',
      formula: '3*4*5',
      substituted_formula: '3*4*5',
      result: 60,
      unit: 'm3',
      measurement_fact_ids: [],
      warnings: [],
      engine_version: '1.0.0',
    });
  });

  it('renders initial Takeoff Workbench controls', () => {
    render(
      <WorkspaceProvider>
        <TakeoffInspector />
      </WorkspaceProvider>
    );

    expect(screen.getByText('Takeoff Workbench')).toBeTruthy();
    expect(screen.getByRole('button', { name: /run takeoff calculation/i })).toBeTruthy();
  });

  it('shows error panel and retry button on rejected backend request, then recovers to ready on retry', async () => {
    mockFetchReadiness.mockRejectedValue(new Error('Backend database error 500'));
    mockFetchCivil.mockRejectedValue(new Error('Backend database error 500'));
    mockCalculate.mockRejectedValue(new Error('Backend database error 500'));

    render(
      <WorkspaceProvider>
        <TakeoffInspector />
      </WorkspaceProvider>
    );

    const runBtn = screen.getByRole('button', { name: /run takeoff calculation/i });
    fireEvent.click(runBtn);

    const errorPanel = await screen.findByTestId('takeoff-error-panel');
    expect(errorPanel).toBeTruthy();
    expect(screen.getByText(/backend database error 500/i)).toBeTruthy();

    const retryBtn = screen.getByRole('button', { name: /retry takeoff calculation/i });
    expect(retryBtn).toBeTruthy();

    // 2. Retry success path
    mockFetchReadiness.mockResolvedValue({
      project_id: 'proj-123',
      snapshot_id: 'snap-1',
      items: [],
      summary: { total: 5, ready: 5, needs_review: 0, blocked: 0 },
    });
    mockFetchCivil.mockResolvedValue({
      schema_version: '1.0',
      project_id: 'proj-123',
      source_document_sha256: 'sha-abc',
      generated_from: 'dem',
      items: [],
      summary: { total: 5, ready: 5, needs_review: 0, by_location: {} },
    });
    mockCalculate.mockResolvedValue({
      calculation_id: 'calc-1',
      work_item_id: 'q-1',
      calculation_type: 'volume',
      status: 'complete',
      formula: '3*4*5',
      substituted_formula: '3*4*5',
      result: 60,
      unit: 'm3',
      measurement_fact_ids: [],
      warnings: [],
      engine_version: '1.0.0',
    });

    fireEvent.click(retryBtn);

    const readyPanel = await screen.findByTestId('takeoff-ready-panel');
    expect(readyPanel).toBeTruthy();
    expect(screen.queryByTestId('takeoff-error-panel')).toBeNull();
  });

  it('handles non-string / undefined error payloads without crashing', async () => {
    mockFetchReadiness.mockRejectedValue(undefined as unknown as Error);
    mockFetchCivil.mockRejectedValue(undefined as unknown as Error);
    mockCalculate.mockRejectedValue(undefined as unknown as Error);

    render(
      <WorkspaceProvider>
        <TakeoffInspector />
      </WorkspaceProvider>
    );

    const runBtn = screen.getByRole('button', { name: /run takeoff calculation/i });
    fireEvent.click(runBtn);

    const errorPanel = await screen.findByTestId('takeoff-error-panel');
    expect(errorPanel).toBeTruthy();
    expect(screen.getByTestId('takeoff-error-message').textContent).toContain('Backend request failed');
  });

  it('prevents duplicated clicks while loading', async () => {
    let resolveFn: any;
    const slowPromise = new Promise((resolve) => {
      resolveFn = resolve;
    });
    mockFetchReadiness.mockImplementation(() => slowPromise as any);
    mockFetchCivil.mockImplementation(() => slowPromise as any);
    mockCalculate.mockImplementation(() => slowPromise as any);

    render(
      <WorkspaceProvider>
        <TakeoffInspector />
      </WorkspaceProvider>
    );

    const runBtn = screen.getByRole('button', { name: /run takeoff calculation/i }) as HTMLButtonElement;
    fireEvent.click(runBtn);
    fireEvent.click(runBtn);

    expect(runBtn.disabled).toBe(true);

    await act(async () => {
      resolveFn({
        calculation_id: 'calc-1',
        work_item_id: 'q-1',
        calculation_type: 'volume',
        status: 'complete',
        formula: '3*4*5',
        substituted_formula: '3*4*5',
        result: 60,
        unit: 'm3',
        measurement_fact_ids: [],
        warnings: [],
        engine_version: '1.0.0',
      });
    });

    const readyPanel = await screen.findByTestId('takeoff-ready-panel');
    expect(readyPanel).toBeTruthy();
  });

  it('provides a manual recovery path when backend is unavailable', async () => {
    mockFetchReadiness.mockRejectedValue(new Error('Network offline'));
    mockFetchCivil.mockRejectedValue(new Error('Network offline'));
    mockCalculate.mockRejectedValue(new Error('Network offline'));

    render(
      <WorkspaceProvider>
        <TakeoffInspector />
      </WorkspaceProvider>
    );

    const runBtn = screen.getByRole('button', { name: /run takeoff calculation/i });
    fireEvent.click(runBtn);

    const errorPanel = await screen.findByTestId('takeoff-error-panel');
    expect(errorPanel).toBeTruthy();

    const manualBtn = screen.getByRole('button', { name: /manual takeoff input/i });
    expect(manualBtn).toBeTruthy();

    fireEvent.click(manualBtn);

    const manualPanel = await screen.findByTestId('takeoff-manual-panel');
    expect(manualPanel).toBeTruthy();
  });
});
