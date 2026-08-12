// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { MissionControl, selectConsoleRunId } from './mission-control';
import { WorkspaceProvider } from '../workspace-store';

const sampleRuns = [
  {
    runId: 'run-001',
    status: 'waiting_approval',
    version: 2,
    updatedAt: new Date().toISOString(),
    goalSpec: {
      request: 'Calculate floor 2 concrete volume',
      riskTier: 'high',
      binding: { projectId: 'proj-101' },
    },
    plan: {
      tasks: [
        { id: 't1', title: 'Read sheet', capability: 'resolve_project_scope' },
        { id: 't2', title: 'Calculate volume', capability: 'run_core_formula' },
      ],
    },
    completedTaskIds: ['t1'],
    pendingApprovalIds: ['appr-001'],
    budget: { maxToolCalls: 10, maxTokens: 50000, maxCostUsd: 5, maxDurationMs: 60000 },
    budgetUsage: { toolCalls: 1, tokens: 1000, costUsd: 0.1, startedAtMs: Date.now() - 5000 },
    auditTimeline: [
      { eventId: 'ev-1', type: 'run_created', message: 'Run created', createdAt: new Date().toISOString() },
      { eventId: 'ev-2', type: 'tool_queued', message: 'Queued calculation', createdAt: new Date().toISOString() },
    ],
    invocations: [],
  },
  {
    runId: 'run-002',
    status: 'completed',
    version: 3,
    updatedAt: new Date().toISOString(),
    goalSpec: {
      request: 'Replayed calculation run',
      riskTier: 'high',
      binding: { projectId: 'proj-101' },
    },
    plan: {
      tasks: [{ id: 't1', title: 'Calculate volume', capability: 'run_core_formula' }],
    },
    completedTaskIds: ['t1'],
    pendingApprovalIds: [],
    auditTimeline: [],
    invocations: [
      {
        invocationId: 'inv-1',
        toolName: 'core_engine.calculate_measurement_facts',
        status: 'replayed',
        output: { sourceAuthority: 'core_engine', volume: 150.0 },
      },
    ],
    actionRecords: [
      {
        actionId: 'act-1',
        idempotencyKey: 'idemp-1',
        riskTier: 'high',
        status: 'replayed',
        createdAt: new Date().toISOString(),
      },
    ],
  },
];

describe('MissionControl UI Component', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/agent-runs')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(sampleRuns),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('keeps an explicitly selected completed run ahead of an older active run', () => {
    expect(selectConsoleRunId(sampleRuns as any, 'run-002')).toBe('run-002');
    expect(selectConsoleRunId(sampleRuns as any, null)).toBe('run-001');
  });

  it('renders mission control header and project binding notice when no project selected', () => {
    render(
      <WorkspaceProvider>
        <MissionControl />
      </WorkspaceProvider>
    );

    expect(screen.getByText('Mission Control')).not.toBeNull();
    expect(screen.getByText(/Pilih project terlebih dahulu/i)).not.toBeNull();
  });

  it('fetches and renders agent runs when project ID is selected', async () => {
    const initialWorkspace = {
      projectId: 'proj-101',
      activeSheetId: 'sheet-1',
    };

    render(
      <WorkspaceProvider projectId="proj-101">
        <MissionControl userRole="estimator" />
      </WorkspaceProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Calculate floor 2 concrete volume')).not.toBeNull();
      expect(screen.getByText('Replayed calculation run')).not.toBeNull();
    });

    expect(screen.getByTestId('approval-request-panel')).not.toBeNull();
    expect(screen.getByTestId('approve-mission-step-btn')).not.toBeNull();
    expect(screen.getByTestId('replayed-badge')).not.toBeNull();
    expect(screen.getByTestId('core-engine-authority-badge')).not.toBeNull();
    expect(screen.getByTestId('budget-usage-timeline')).not.toBeNull();
  });

  it('displays RBAC denial notice for unauthorized viewer role', async () => {
    const initialWorkspace = {
      projectId: 'proj-101',
      activeSheetId: 'sheet-1',
    };

    render(
      <WorkspaceProvider projectId="proj-101">
        <MissionControl userRole="viewer" />
      </WorkspaceProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Calculate floor 2 concrete volume')).not.toBeNull();
    });

    expect(screen.queryByTestId('approve-mission-step-btn')).toBeNull();
    expect(screen.getByTestId('rbac-denial-notice').textContent).toContain(
      "Role 'viewer' does not have permission to approve calculation tools"
    );
  });

  it('handles backend error gracefully with retry and manual fallback buttons', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: () => Promise.resolve({ error: 'Agent runtime unavailable' }),
      })
    );

    const initialWorkspace = {
      projectId: 'proj-101',
      activeSheetId: 'sheet-1',
    };

    render(
      <WorkspaceProvider projectId="proj-101">
        <MissionControl />
      </WorkspaceProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('mission-error-panel')).not.toBeNull();
    });

    expect(screen.getByTestId('mission-error-message').textContent).toContain('Agent runtime unavailable');
    expect(screen.getByTestId('retry-mission-btn')).not.toBeNull();
  });
});
