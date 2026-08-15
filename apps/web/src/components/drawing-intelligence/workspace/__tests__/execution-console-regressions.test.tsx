// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, cleanup, waitFor } from '@testing-library/react';
import { DrawingIntelligenceWorkspaceV2 } from '../index';
import { ReasoningBlock } from '../agentic/trace/reasoning-block';
import { TaskRail } from '../agentic/task-rail/task-rail';
import { buildDemoEvents } from '../agentic/agent-execution-console/demo-events';
import { buildStateFromEvents } from '../agentic/agent-execution-console/event-store';

afterEach(() => cleanup());

describe('execution console regressions', () => {
  it('mounts the execution console before a missing run id can be resolved', async () => {
    render(<DrawingIntelligenceWorkspaceV2 projectName="Test project" />);

    fireEvent.click(screen.getByRole('button', { name: /analyze selected/i }));

    await waitFor(() => {
      expect(screen.getByTestId('agent-execution-console')).toBeTruthy();
    });
    expect(screen.getByTestId('runtime-startup-state')).toBeTruthy();
  }, 15000);

  it('does not render model or provider identifiers in the thinking block', () => {
    render(
      <ReasoningBlock
        content="The runtime compared sheet evidence before continuing."
        model="deepseek-v4-flash"
        provider="opencode-go"
      />,
    );

    expect(screen.queryByText(/deepseek|opencode/i)).toBeNull();
  });

  it('locks pending task buttons when there is no live task', () => {
    const state = buildStateFromEvents(buildDemoEvents());
    render(<TaskRail tasks={state.tasks} />);

    expect((screen.getByTestId('task-T12') as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps reasoning events in the chronological trace projection', () => {
    const state = buildStateFromEvents(buildDemoEvents());

    expect(state.trace.some((item) => item.type === 'reasoning.delta')).toBe(true);
    expect(state.trace.find((item) => item.type === 'reasoning.delta')?.taskId).toBe('T03');
  });
});
