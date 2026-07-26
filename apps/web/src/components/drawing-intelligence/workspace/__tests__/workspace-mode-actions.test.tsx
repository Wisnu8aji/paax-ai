// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { TakeoffInspector } from '../takeoff/takeoff-inspector';
import { MissionControl } from '../agentic/mission-control';
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

describe('MissionControl — Backend Failure Recovery (Phase 5B)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    cleanup();
    vi.clearAllMocks();
  });

  it('renders initial MissionControl and loads runs successfully', async () => {
    const mockRuns = [
      {
        runId: 'run-1',
        status: 'running',
        version: 1,
        updatedAt: '2026-07-26T22:00:00Z',
        goalSpec: { request: 'Audit Lantai 2', riskTier: 'high', binding: { projectId: 'proj-123' } },
        plan: { tasks: [{ id: 't-1', title: 'Task 1', capability: 'audit' }] },
        completedTaskIds: [],
        pendingApprovalIds: [],
      },
    ];

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockRuns,
    });

    render(
      <WorkspaceProvider projectId="proj-123">
        <MissionControl />
      </WorkspaceProvider>
    );

    expect(screen.getByText('Mission Control')).toBeTruthy();
    expect(await screen.findByText('Audit Lantai 2')).toBeTruthy();
  });

  it('shows error panel and retry button on rejected backend request, then recovers to ready on retry', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ error: 'Agent runtime backend 503 unavailable' }),
    });

    render(
      <WorkspaceProvider projectId="proj-123">
        <MissionControl />
      </WorkspaceProvider>
    );

    const errorPanel = await screen.findByTestId('mission-error-panel');
    expect(errorPanel).toBeTruthy();
    expect(screen.getByTestId('mission-error-message').textContent).toContain('Agent runtime backend 503 unavailable');

    const retryBtn = screen.getByRole('button', { name: /retry mission/i });
    expect(retryBtn).toBeTruthy();

    const mockRuns = [
      {
        runId: 'run-retry',
        status: 'completed',
        version: 2,
        updatedAt: '2026-07-26T22:05:00Z',
        goalSpec: { request: 'Audit Lantai 2 Selesai', riskTier: 'low', binding: { projectId: 'proj-123' } },
        plan: { tasks: [{ id: 't-1', title: 'Task 1', capability: 'audit' }] },
        completedTaskIds: ['t-1'],
        pendingApprovalIds: [],
      },
    ];

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockRuns,
    });

    fireEvent.click(retryBtn);

    expect(await screen.findByText('Audit Lantai 2 Selesai')).toBeTruthy();
    expect(screen.queryByTestId('mission-error-panel')).toBeNull();
  });

  it('handles non-string / undefined / malformed error payloads and run objects without crashing', async () => {
    (global.fetch as any).mockRejectedValueOnce(undefined);

    render(
      <WorkspaceProvider projectId="proj-123">
        <MissionControl />
      </WorkspaceProvider>
    );

    const errorPanel = await screen.findByTestId('mission-error-panel');
    expect(errorPanel).toBeTruthy();
    expect(screen.getByTestId('mission-error-message').textContent).toContain('Mission operation failed');

    const malformedRuns = [
      {
        runId: 123,
        status: null,
        version: 'invalid',
        goalSpec: { request: null },
        plan: { tasks: [{ id: 999, title: undefined }] },
        completedTaskIds: null,
      },
    ];

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => malformedRuns,
    });

    const retryBtn = screen.getByRole('button', { name: /retry mission/i });
    fireEvent.click(retryBtn);

    expect(await screen.findByText('No goal specified')).toBeTruthy();
  });

  it('prevents duplicated transport calls on rapid double activation', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    render(
      <WorkspaceProvider projectId="proj-123">
        <MissionControl />
      </WorkspaceProvider>
    );

    await screen.findByText('Belum ada agent run untuk project ini.');
    expect(global.fetch).toHaveBeenCalledTimes(1);

    let resolveCreate: any;
    const slowCreatePromise = new Promise((resolve) => {
      resolveCreate = resolve;
    });
    (global.fetch as any).mockImplementation(() => slowCreatePromise);

    const submitBtn = screen.getByRole('button', { name: /buat plan terikat plhut/i });
    fireEvent.click(submitBtn);
    fireEvent.click(submitBtn);

    expect(global.fetch).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveCreate({
        ok: true,
        json: async () => ({ runId: 'r-1' }),
      });
    });
  });

  it('retries failed create POST with exact payload on Retry click', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    render(
      <WorkspaceProvider projectId="proj-123">
        <MissionControl />
      </WorkspaceProvider>
    );

    await screen.findByText('Belum ada agent run untuk project ini.');

    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Create run failed 500' }),
    });

    const createBtn = screen.getByRole('button', { name: /buat plan terikat plhut/i });
    fireEvent.click(createBtn);

    const errorPanel = await screen.findByTestId('mission-error-panel');
    expect(errorPanel).toBeTruthy();
    expect(screen.getByTestId('mission-error-message').textContent).toContain('Create run failed 500');

    expect(global.fetch).toHaveBeenCalledTimes(2);
    const [createUrl, createOpts] = (global.fetch as any).mock.calls[1];
    expect(createUrl).toBe('/api/agent-runs');
    expect(createOpts.method).toBe('POST');
    const createBody = JSON.parse(createOpts.body);
    expect(createBody).toEqual({
      projectId: 'proj-123',
      goal: 'Audit data kolom Lantai 2, hitung quantity terverifikasi, dan laporkan konflik.',
      riskTier: 'high',
      deliverables: ['engineering audit', 'evidence register'],
    });

    const newRun = {
      runId: 'run-created',
      status: 'queued',
      version: 1,
      updatedAt: '2026-07-26T22:10:00Z',
      goalSpec: { request: 'Audit data kolom Lantai 2', riskTier: 'high', binding: { projectId: 'proj-123' } },
      plan: { tasks: [] },
      completedTaskIds: [],
      pendingApprovalIds: [],
    };

    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => newRun,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [newRun],
      });

    const retryBtn = screen.getByRole('button', { name: /retry mission/i });
    fireEvent.click(retryBtn);

    expect(await screen.findByText('Audit data kolom Lantai 2')).toBeTruthy();
    expect(screen.queryByTestId('mission-error-panel')).toBeNull();

    expect(global.fetch).toHaveBeenCalledTimes(4);
    const [retryUrl, retryOpts] = (global.fetch as any).mock.calls[2];
    expect(retryUrl).toBe('/api/agent-runs');
    expect(retryOpts.method).toBe('POST');
    expect(JSON.parse(retryOpts.body)).toEqual(createBody);
  });

  it('retries failed transition POST with exact payload on Retry click', async () => {
    const initialRun = {
      runId: 'run-100',
      status: 'queued',
      version: 1,
      updatedAt: '2026-07-26T22:00:00Z',
      goalSpec: { request: 'Transition Test Run', riskTier: 'high', binding: { projectId: 'proj-123' } },
      plan: { tasks: [] },
      completedTaskIds: [],
      pendingApprovalIds: [],
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [initialRun],
    });

    render(
      <WorkspaceProvider projectId="proj-123">
        <MissionControl />
      </WorkspaceProvider>
    );

    await screen.findByText('Transition Test Run');

    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ error: 'Version conflict on transition' }),
    });

    const transitionBtn = screen.getByRole('button', { name: /mulai planning/i });
    fireEvent.click(transitionBtn);

    const errorPanel = await screen.findByTestId('mission-error-panel');
    expect(errorPanel).toBeTruthy();
    expect(screen.getByTestId('mission-error-message').textContent).toContain('Version conflict on transition');

    expect(global.fetch).toHaveBeenCalledTimes(2);
    const [transUrl, transOpts] = (global.fetch as any).mock.calls[1];
    expect(transUrl).toBe('/api/agent-runs/run-100');
    expect(transOpts.method).toBe('POST');
    const transBody = JSON.parse(transOpts.body);
    expect(transBody).toEqual({
      action: 'transition',
      projectId: 'proj-123',
      status: 'planning',
      expectedVersion: 1,
    });

    const updatedRun = { ...initialRun, status: 'planning', version: 2 };
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => updatedRun,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [updatedRun],
      });

    const retryBtn = screen.getByRole('button', { name: /retry mission/i });
    fireEvent.click(retryBtn);

    expect(await screen.findByText('planning')).toBeTruthy();
    expect(screen.queryByTestId('mission-error-panel')).toBeNull();

    expect(global.fetch).toHaveBeenCalledTimes(4);
    const [retryTransUrl, retryTransOpts] = (global.fetch as any).mock.calls[2];
    expect(retryTransUrl).toBe('/api/agent-runs/run-100');
    expect(retryTransOpts.method).toBe('POST');
    expect(JSON.parse(retryTransOpts.body)).toEqual(transBody);
  });

  it('provides a manual recovery path when backend is unavailable', async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error('Network connection failed'));

    render(
      <WorkspaceProvider projectId="proj-123">
        <MissionControl />
      </WorkspaceProvider>
    );

    const errorPanel = await screen.findByTestId('mission-error-panel');
    expect(errorPanel).toBeTruthy();

    const manualBtn = screen.getByRole('button', { name: /manual mission input/i });
    expect(manualBtn).toBeTruthy();

    fireEvent.click(manualBtn);

    const manualPanel = await screen.findByTestId('mission-manual-panel');
    expect(manualPanel).toBeTruthy();
  });
});


