// paax/web — StatusStack (F2 #3, status stack).
//
// Adaptasi pola ComposerStatusStack Hermes → PAAX. Menampilkan status
// session-scoped: agent/subagent aktif, retry, error, approval waiting.
// Semua item berasal dari event nyata (store.statusStack).

import type { StatusStackItem } from '../agent-execution-console/event-store'
import { redactUiText, runtimeRoleLabel } from './ui-redaction'

export interface StatusStackProps {
  items: StatusStackItem[]
  limit?: number
}

function stateColor(state: StatusStackItem['state']): string {
  switch (state) {
    case 'running': return 'var(--di-action, #3b82f6)'
    case 'completed': return 'var(--di-ok, #22c55e)'
    case 'failed': return 'var(--di-danger, #ef4444)'
    case 'waiting': return '#eab308'
    default: return 'var(--di-text3)'
  }
}

export function StatusStack({ items, limit = 12 }: StatusStackProps): React.ReactElement {
  const visible = items.slice(-limit)
  return (
    <div data-testid="status-stack" style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {visible.length === 0 && (
        <div style={{ fontSize: 10.5, color: 'var(--di-text3)' }}>Tidak ada aktivitas agent aktif.</div>
      )}
      {visible.map(item => (
        <div
          key={item.id}
          data-testid="status-stack-item"
          data-kind={item.kind}
          data-state={item.state}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, padding: '3px 6px', borderRadius: 5, background: 'var(--di-panel)', border: '1px solid var(--di-border)' }}
        >
          <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: stateColor(item.state), flexShrink: 0 }} />
          <span style={{ color: 'var(--di-text3)', flexShrink: 0, minWidth: 82 }}>{runtimeRoleLabel(item.kind)}</span>
          <span style={{ color: 'var(--di-text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {redactUiText(item.kind === 'agent' ? 'orchestration runtime' : item.kind === 'subagent' ? 'perception worker' : item.label)}
          </span>
          {item.taskId && <span style={{ color: 'var(--di-text3)', fontSize: 9.5 }}>{item.taskId}</span>}
        </div>
      ))}
    </div>
  )
}
