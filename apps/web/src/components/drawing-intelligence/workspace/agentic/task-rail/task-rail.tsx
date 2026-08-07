// paax/web — Task Rail (F2 #2, G2.1).
//
// Menampilkan state TaskEngine nyata `Tasks X/12` dari event task.* v2.
// Progress HANYA dari task.progress event — TIDAK ada timer/hardcoded
// progress (anti-fake, Owner §0.15). Task state per task:
// pending/queued/running/waiting_tool/waiting_subagent/waiting_approval/
// paused/completed/failed/cancelled.

import type { TaskUiState } from '../agent-execution-console/event-store'

export interface TaskRailProps {
  tasks: TaskUiState[]
  activeTaskId?: string | null
  onSelectTask?: (taskId: string) => void
}

export const TASK_STATE_LABEL: Record<TaskUiState['state'], string> = {
  pending: 'pending',
  queued: 'queued',
  running: 'running',
  waiting_tool: 'waiting tool',
  waiting_subagent: 'waiting subagent',
  waiting_approval: 'waiting approval',
  paused: 'paused',
  completed: 'completed',
  failed: 'failed',
  cancelled: 'cancelled',
}

function stateColor(state: TaskUiState['state']): string {
  switch (state) {
    case 'completed': return 'var(--di-ok, #22c55e)'
    case 'running': return 'var(--di-action, #3b82f6)'
    case 'failed': return 'var(--di-danger, #ef4444)'
    case 'waiting_approval': return '#eab308'
    case 'waiting_tool':
    case 'waiting_subagent': return '#f59e0b'
    case 'paused': return '#94a3b8'
    case 'cancelled': return '#64748b'
    default: return 'var(--di-text3)'
  }
}

function progressPercent(t: TaskUiState): number {
  const raw = t.progress
  if (t.state === 'completed') return 100
  if (t.state === 'pending' || t.state === 'queued') return 0
  return Math.round(Math.min(1, Math.max(0, raw)) * 100)
}

export function completedTaskCount(tasks: TaskUiState[]): number {
  return tasks.filter(t => t.state === 'completed').length
}

export function TaskRail({ tasks, activeTaskId, onSelectTask }: TaskRailProps): React.ReactElement {
  const completed = completedTaskCount(tasks)
  const total = tasks.length
  const failed = tasks.filter(t => t.state === 'failed').length

  return (
    <div
      data-testid="task-rail"
      data-completed={completed}
      data-total={total}
      style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 220, maxWidth: 260 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <strong data-testid="task-rail-heading" style={{ fontSize: 12 }}>
          Tasks {completed}/{total}
        </strong>
        {failed > 0 && (
          <span data-testid="task-rail-failed" style={{ fontSize: 10, color: 'var(--di-danger, #ef4444)' }}>
            {failed} failed
          </span>
        )}
      </div>

      {tasks.map(t => {
        const active = activeTaskId === t.id
        const pct = progressPercent(t)
        return (
          <button
            key={t.id}
            type="button"
            data-testid={`task-${t.id}`}
            data-state={t.state}
            onClick={() => onSelectTask?.(t.id)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              textAlign: 'left',
              padding: '7px 9px',
              borderRadius: 8,
              border: `1px solid ${active ? 'var(--di-action, #3b82f6)' : 'var(--di-border)'}`,
              background: active ? 'rgba(59, 130, 246, 0.08)' : 'var(--di-panel)',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: stateColor(t.state),
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 11, fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.id}
              </span>
              <span style={{ fontSize: 9.5, color: 'var(--di-text3)' }}>{TASK_STATE_LABEL[t.state]}</span>
            </div>
            <span style={{ fontSize: 10.5, color: 'var(--di-text2)', lineHeight: 1.3 }}>{t.title}</span>
            <div style={{ height: 3, borderRadius: 2, background: 'var(--di-panel2)', overflow: 'hidden' }}>
              <div
                data-testid={`task-${t.id}-progress`}
                style={{
                  width: `${pct}%`,
                  height: '100%',
                  background: stateColor(t.state),
                  transition: 'width 300ms ease',
                }}
              />
            </div>
            <div style={{ fontSize: 9, color: 'var(--di-text3)' }}>
              {t.state === 'running' && t.progress > 0 ? `${pct}%` : ''}
              {t.error ? ` · ${t.error}` : ''}
            </div>
          </button>
        )
      })}
    </div>
  )
}
