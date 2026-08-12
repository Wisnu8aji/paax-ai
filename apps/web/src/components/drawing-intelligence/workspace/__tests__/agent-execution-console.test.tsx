// @vitest-environment jsdom
//
// paax/web — AgentExecutionConsole render test (G2.1-G2.4).
//
// Render konsol dengan fixture demo berlabel synthetic+notProduction dan
// verifikasi: task rail Tasks X/12, mode tabs, transport badge demo,
// reasoning dari event nyata, approval card, timeline. Juga verifikasi
// ProcessingOverlay NONAKTIF (disabled → tidak render polling overlay lama).

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { AgentExecutionConsole } from '../agentic/agent-execution-console';
import { buildDemoEvents } from '../agentic/agent-execution-console/demo-events';
import { TaskRail } from '../agentic/task-rail/task-rail';
import { buildStateFromEvents } from '../agentic/agent-execution-console/event-store';
import { ProcessingOverlay } from '../inspector/processing-overlay';
import { WorkspaceProvider } from '../workspace-store';

afterEach(() => {
  cleanup();
});

describe('AgentExecutionConsole (demo events berlabel synthetic)', () => {
  it('merender task rail Tasks X/12 + state dari event', async () => {
    render(<AgentExecutionConsole runId="paax:run:demo-20260807" demoEvents={buildDemoEvents()} />);
    await waitFor(() => {
      expect(screen.getByTestId('agent-execution-console')).toBeTruthy();
    });
    // Heading rail Tasks X/12 — demo: T01,T02,T03 completed = 3/12.
    expect(screen.getByTestId('task-rail-heading').textContent).toContain('Tasks 3/12');
    // Task state dari event: T01 completed, T11 waiting approval.
    expect(screen.getByTestId('task-T01').getAttribute('data-state')).toBe('completed');
    expect(screen.getByTestId('task-T11').getAttribute('data-state')).toBe('waiting_approval');
    // T12 tetap pending (bukan fake progress).
    expect(screen.getByTestId('task-T12').getAttribute('data-state')).toBe('pending');
  });

  it('menampilkan label demo synthetic + transport badge jujur', async () => {
    render(<AgentExecutionConsole runId="paax:run:demo-20260807" demoEvents={buildDemoEvents()} />);
    await waitFor(() => {
      expect(screen.getByTestId('transport-badge').textContent).toContain('demo');
    });
    expect(screen.getByTestId('demo-label').textContent).toContain('synthetic:true');
    expect(screen.getByTestId('demo-label').textContent).toContain('notProduction:true');
  });

  it('menampilkan reasoning block hanya dari event reasoning nyata', async () => {
    render(<AgentExecutionConsole runId="paax:run:demo-20260807" demoEvents={buildDemoEvents()} initialActiveTaskId="T03" />);
    await waitFor(() => {
      const reasoning = screen.queryByTestId('reasoning-block');
      // T03 punya reasoning → block tampil
      expect(reasoning).toBeTruthy();
    });
    expect(screen.getByTestId('reasoning-block').textContent).toContain('RENCANA KOLOM LANTAI 1');
  });

  it('menampilkan approval card pending dari event approval.requested', async () => {
    render(<AgentExecutionConsole runId="paax:run:demo-20260807" demoEvents={buildDemoEvents()} />);
    await waitFor(() => {
      expect(screen.getByTestId('approval-card')).toBeTruthy();
    });
    expect(screen.getByTestId('approval-status').textContent).toBe('pending');
    expect(screen.getByTestId('approval-card').getAttribute('data-impact')).toBe('high');
  });

  it('mode technical ditolak untuk estimator → fallback product', async () => {
    render(<AgentExecutionConsole runId="paax:run:demo-20260807" demoEvents={buildDemoEvents()} userRole="estimator" />);
    await waitFor(() => {
      expect(screen.getByTestId('mode-product')).toBeTruthy();
    });
    const techBtn = screen.getByTestId('mode-technical');
    techBtn.click();
    await waitFor(() => {
      expect(screen.getByTestId('mode-denied')).toBeTruthy();
    });
  });

  it('subagent summary dari event subagent.started/completed', async () => {
    render(<AgentExecutionConsole runId="paax:run:demo-20260807" demoEvents={buildDemoEvents()} />);
    await waitFor(() => {
      expect(screen.getByTestId('subagent-summary').textContent).toContain('subagents:');
    });
    expect(screen.getByTestId('subagent-summary').textContent).toContain('completed 1');
  });

  it('status stack menampilkan task aktif dari event task.started/task.progress (tanpa agent event)', async () => {
    render(<AgentExecutionConsole runId="paax:run:demo-20260807" demoEvents={buildDemoEvents()} />);
    await waitFor(() => {
      // T01 hanya punya task.started + task.progress (tanpa agent/subagent) —
      // tetap harus tampil sebagai status item kind 'task'.
      expect(screen.getAllByTestId('status-stack-item').some(el => el.getAttribute('data-kind') === 'task')).toBe(true);
    });
  });
});

describe('TaskRail pure component', () => {
  it('progress hanya dari state event (bukan hardcoded)', () => {
    const state = buildStateFromEvents(buildDemoEvents());
    render(<TaskRail tasks={state.tasks} />);
    const t03 = screen.getByTestId('task-T03-progress');
    // progress 1.0 dari event → width 100%
    expect(t03.style.width).toBe('100%');
    const t12 = screen.getByTestId('task-T12-progress');
    expect(t12.style.width).toBe('0%');
  });
});

describe('ProcessingOverlay NONAKTIF (RETIRE-AFTER-PARITY)', () => {
  it('disabled default → tidak render polling overlay lama', () => {
    const { container } = render(
      <WorkspaceProvider withMockData={false} projectId={null}>
        <ProcessingOverlay />
      </WorkspaceProvider>,
    );
    expect(container.textContent).not.toContain('AI Analysis in Progress');
    expect(screen.queryByText(/AI Analysis in Progress/)).toBeNull();
  });
});
