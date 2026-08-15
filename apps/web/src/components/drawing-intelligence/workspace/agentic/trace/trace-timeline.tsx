// paax/web — TraceTimeline (F2 #3, timeline).
//
// Timeline kronologis event nyata (runtime + domain) — dari store.trace.
// Tidak ada item buatan; setiap baris = persisted event (event_id).

import type { TraceItem } from '../agent-execution-console/event-store'
import { redactUiText, safeUiJson } from './ui-redaction'

export interface TraceTimelineProps {
  items: TraceItem[]
  limit?: number
}

function eventColor(type: string): string {
  if (type.endsWith('.failed')) return 'var(--di-danger, #ef4444)'
  if (type.endsWith('.completed') || type.includes('.created')) return 'var(--di-ok, #22c55e)'
  if (type.startsWith('reasoning')) return '#eab308'
  if (type.startsWith('tool') || type.startsWith('command')) return 'var(--di-action, #3b82f6)'
  return 'var(--di-text3)'
}

function shortTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toISOString().slice(11, 19)
}

export function TraceTimeline({ items, limit = 200 }: TraceTimelineProps): React.ReactElement {
  const visible = items.slice(-limit)
  return (
    <div data-testid="trace-timeline" style={{ display: 'flex', flexDirection: 'column', gap: 2, fontFamily: 'var(--di-mono, monospace)', fontSize: 10 }}>
      {visible.length === 0 && (
        <div style={{ color: 'var(--di-text3)', padding: '8px 0' }}>Belum ada event runtime.</div>
      )}
      {visible.map(item => (
        <div key={item.eventId} style={{ display: 'flex', gap: 6, alignItems: 'baseline', padding: '2px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
          <span style={{ color: 'var(--di-text3)', flexShrink: 0 }}>{shortTime(item.timestamp)}</span>
          <span style={{ color: eventColor(item.type), flexShrink: 0, minWidth: 90 }}>{redactUiText(item.type)}</span>
          <span style={{ color: 'var(--di-text3)', flexShrink: 0 }}>{item.taskId ?? ''}</span>
          <span style={{ color: 'var(--di-text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {item.summary ? safeUiJson(item.summary).replace(/\s+/g, ' ') : ''}
          </span>
        </div>
      ))}
    </div>
  )
}
