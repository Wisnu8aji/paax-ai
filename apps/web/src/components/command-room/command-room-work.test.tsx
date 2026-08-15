// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const consoleSpy = vi.fn();

vi.mock('@/components/drawing-intelligence/workspace/agentic/agent-execution-console', () => ({
  AgentExecutionConsole: (props: { runId?: string | null }) => {
    consoleSpy(props);
    return createElement('div', { 'data-testid': 'agent-execution-console' }, `runtime:${props.runId}`);
  },
}));

import { CommandRoomWorkSurface } from './command-room-work';

describe('Command Room Work surface', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    consoleSpy.mockClear();
  });

  it('opens with a neutral technical standby state and no provider labels', () => {
    render(
      <CommandRoomWorkSurface
        projectId={null}
        projectName="Project test"
        initialRunId={null}
        onOpenDrawing={() => undefined}
      />,
    );

    expect(screen.getByTestId('command-room-work-surface')).toBeTruthy();
    expect(screen.getByText('Work surface siap')).toBeTruthy();
    expect(screen.getByText('Task focus')).toBeTruthy();
    expect(screen.getByText('Terminal trace')).toBeTruthy();
    expect(screen.queryByText(/deepseek|mimo|model|provider/i)).toBeNull();
  });

  it('mounts the shared execution console for the selected run', () => {
    render(
      <CommandRoomWorkSurface
        projectId="project-1"
        projectName="Project test"
        initialRunId="run-123"
        onOpenDrawing={() => undefined}
      />,
    );

    expect(screen.getByTestId('agent-execution-console').textContent).toContain('runtime:run-123');
    expect(consoleSpy).toHaveBeenCalledWith(expect.objectContaining({ runId: 'run-123' }));
  });

  it('lets an operator attach a run without changing the chat surface', () => {
    render(
      <CommandRoomWorkSurface
        projectId={null}
        projectName="Project test"
        initialRunId={null}
        onOpenDrawing={() => undefined}
      />,
    );

    fireEvent.change(screen.getAllByLabelText('Run ID')[0], { target: { value: 'run-manual' } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect run' }));

    expect(screen.getByTestId('agent-execution-console').textContent).toContain('runtime:run-manual');
  });
});
