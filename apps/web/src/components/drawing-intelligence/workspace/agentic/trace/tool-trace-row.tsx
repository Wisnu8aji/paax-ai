// paax/web — ToolTraceRow (F2 #3, trace).
//
// Tool call/payload/command/result dari event tool.* / command.* v2.
// Payload besar by-reference (payload_ref) — tidak inject penuh. Disclosure
// di mode technical: payload raw.

import type { TraceItem } from '../agent-execution-console/event-store'

export interface ToolTraceRowProps {
  item: TraceItem
  /** technical mode → tampilkan payload raw via disclosure. */
  technical?: boolean
}

function typeLabel(type: string): string {
  switch (type) {
    case 'tool.started': return 'tool.started'
    case 'tool.progress': return 'tool.progress'
    case 'tool.completed': return 'tool.completed'
    case 'tool.failed': return 'tool.failed'
    case 'command.started': return 'command.started'
    case 'command.output': return 'command.output'
    case 'command.completed': return 'command.completed'
    default: return type
  }
}

function statusColor(type: string): string {
  if (type.endsWith('.failed')) return 'var(--di-danger, #ef4444)'
  if (type.endsWith('.completed')) return 'var(--di-ok, #22c55e)'
  if (type.endsWith('.started')) return 'var(--di-action, #3b82f6)'
  return 'var(--di-text3)'
}

export function ToolTraceRow({ item, technical }: ToolTraceRowProps): React.ReactElement {
  const summary = item.summary ?? {}
  const tool = (summary['tool'] as string | undefined) ?? (summary['command'] as string | undefined) ?? ''
  const status = (summary['status'] as string | undefined) ?? ''
  const duration = summary['duration_s'] as number | undefined

  return (
    <div
      data-testid="tool-trace-row"
      data-type={item.type}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        padding: '6px 8px',
        borderRadius: 7,
        border: '1px solid var(--di-border)',
        background: 'var(--di-panel)',
        fontFamily: 'var(--di-mono, monospace)',
        fontSize: 10.5,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ color: statusColor(item.type), fontWeight: 700 }}>{typeLabel(item.type)}</span>
        {tool && <span style={{ color: 'var(--di-text)' }}>{tool}</span>}
        {status && <span style={{ color: 'var(--di-text3)' }}>{status}</span>}
        {duration !== undefined && <span style={{ color: 'var(--di-text3)', marginLeft: 'auto' }}>{duration.toFixed(2)}s</span>}
      </div>

      {Object.keys(summary).length > 0 && (
        <div style={{ color: 'var(--di-text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {JSON.stringify(summary)}
        </div>
      )}

      {technical && (
        <details data-testid="tool-payload-disclosure">
          <summary style={{ cursor: 'pointer', color: 'var(--di-text3)' }}>payload</summary>
          <pre style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 10, color: 'var(--di-text2)' }}>
            {JSON.stringify(summary, null, 2)}
          </pre>
          {item.payloadRef && (
            <div style={{ marginTop: 3, fontSize: 9.5, color: 'var(--di-text3)' }}>
              payload_ref: {item.payloadRef}
            </div>
          )}
        </details>
      )}
    </div>
  )
}
