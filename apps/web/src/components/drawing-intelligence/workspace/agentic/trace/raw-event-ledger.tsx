// Raw runtime transcript. The event envelope remains the source
// of truth, while its display projection removes provider/model credentials.

import type { PaaxEventEnvelope } from '../agent-execution-console/event-contract'
import { redactUiText, safeUiJson } from './ui-redaction'

export interface RawEventLedgerProps {
  events: PaaxEventEnvelope[]
  limit?: number
}

function shortTime(timestamp: string): string {
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime()) ? timestamp : date.toISOString().slice(11, 19)
}

export function RawEventLedger({ events, limit = 160 }: RawEventLedgerProps): React.ReactElement {
  const visible = [...events]
    .sort((a, b) => a.params.sequence - b.params.sequence)
    .slice(-limit)

  return (
    <div data-testid="raw-event-ledger" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {visible.length === 0 && (
        <div style={{ color: 'var(--di-text3)', fontSize: 10.5 }}>Belum ada event runtime.</div>
      )}
      {visible.map(event => {
        const p = event.params
        return (
          <details key={p.event_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', padding: '3px 0' }}>
            <summary style={{ cursor: 'pointer', display: 'flex', gap: 7, alignItems: 'baseline', fontFamily: 'var(--di-mono, monospace)', fontSize: 10 }}>
              <span style={{ color: 'var(--di-text3)', minWidth: 34 }}>#{p.sequence}</span>
              <span style={{ color: 'var(--di-text3)', minWidth: 58 }}>{shortTime(p.timestamp)}</span>
              <span style={{ color: 'var(--di-action, #3b82f6)', minWidth: 138 }}>{redactUiText(p.type)}</span>
              <span style={{ color: 'var(--di-text3)' }}>{p.task_id ?? 'run'}</span>
              <span style={{ color: 'var(--di-text3)', marginLeft: 'auto' }}>{p.redaction_state}</span>
            </summary>
            <div style={{ margin: '5px 0 3px 98px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--di-text2)', fontSize: 10 }}>
                {safeUiJson(p.payload_summary ?? {})}
              </pre>
              {p.payload_ref && (
                <div style={{ color: 'var(--di-text3)', fontSize: 9.5 }}>
                  payload_ref: {redactUiText(p.payload_ref)}
                </div>
              )}
              <div style={{ color: 'var(--di-text3)', fontSize: 9 }}>
                event_id: {p.event_id}
              </div>
            </div>
          </details>
        )
      })}
    </div>
  )
}
