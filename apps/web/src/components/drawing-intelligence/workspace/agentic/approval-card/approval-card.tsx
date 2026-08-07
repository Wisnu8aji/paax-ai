// paax/web — ApprovalCard (F2 #3, approval).
//
// Adaptasi approval.tsx konsol R1 ke v2. Card dari approval.requested /
// approval.resolved event. Keputusan user → callback (di-wire ke
// paax.command approve bila WS tersedia).

import { useState } from 'react'
import type { ApprovalItem } from '../agent-execution-console/event-store'

export interface ApprovalCardProps {
  card: ApprovalItem
  onRespond?: (decision: { approvalId: string; decision: 'approved' | 'rejected'; rationale: string }) => void
  canApprove?: boolean
}

const IMPACT_LABEL: Record<string, string> = {
  high: 'High impact',
  medium: 'Medium impact',
  low: 'Low impact',
}

/** Validasi deterministik: rationale min 3 kata untuk override. */
export function isRationaleValid(rationale: string): boolean {
  return rationale.trim().split(/\s+/).filter(Boolean).length >= 3
}

export function ApprovalCard({ card, onRespond, canApprove = true }: ApprovalCardProps): React.ReactElement {
  const [rationale, setRationale] = useState('')
  const rationaleValid = isRationaleValid(rationale)

  const submit = (decision: 'approved' | 'rejected') => {
    if (decision === 'approved' && !rationaleValid) return
    onRespond?.({ approvalId: card.approvalId, decision, rationale })
  }

  const resolved = card.status !== 'pending'

  return (
    <div
      data-testid="approval-card"
      data-status={card.status}
      data-impact={card.impact}
      style={{
        padding: '8px 10px',
        borderRadius: 8,
        border: `1px solid ${resolved ? 'var(--di-border)' : 'rgba(234, 179, 8, 0.35)'}`,
        background: resolved ? 'var(--di-panel)' : 'rgba(234, 179, 8, 0.06)',
        display: 'flex',
        flexDirection: 'column',
        gap: 5,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10 }}>
        <span style={{ fontWeight: 700, color: resolved ? 'var(--di-text3)' : '#eab308' }}>
          {IMPACT_LABEL[card.impact] ?? card.impact}
        </span>
        <span style={{ color: 'var(--di-text3)' }}>approval</span>
        <span data-testid="approval-status" style={{ marginLeft: 'auto', color: resolved ? 'var(--di-ok, #22c55e)' : '#eab308', fontWeight: 600 }}>
          {card.status}
        </span>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--di-text)' }}>{card.reason}</div>
      {card.refs.length > 0 && (
        <div style={{ fontSize: 9.5, color: 'var(--di-text3)' }}>refs: {card.refs.join(', ')}</div>
      )}
      {!resolved && canApprove && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
          <input
            type="text"
            placeholder="Rationale (min 3 kata untuk approve)..."
            value={rationale}
            onChange={e => setRationale(e.target.value)}
            style={{ flex: 1, height: 26, fontSize: 10.5, padding: '0 6px', background: 'var(--di-bg)', border: '1px solid var(--di-border)', borderRadius: 4, color: 'var(--di-text)' }}
          />
          <button
            type="button"
            data-testid="approval-approve-btn"
            disabled={!rationaleValid}
            onClick={() => submit('approved')}
            style={{ height: 26, padding: '0 10px', fontSize: 10.5, background: 'var(--di-ok, #22c55e)', color: '#fff', border: 'none', borderRadius: 4, cursor: rationaleValid ? 'pointer' : 'not-allowed', fontWeight: 600 }}
          >
            Approve
          </button>
          <button
            type="button"
            data-testid="approval-reject-btn"
            onClick={() => submit('rejected')}
            style={{ height: 26, padding: '0 10px', fontSize: 10.5, background: 'transparent', color: 'var(--di-danger, #ef4444)', border: '1px solid var(--di-danger, #ef4444)', borderRadius: 4, cursor: 'pointer' }}
          >
            Reject
          </button>
        </div>
      )}
      {!resolved && !canApprove && (
        <div data-testid="approval-denial" style={{ fontSize: 10, color: 'var(--di-danger, #ef4444)' }}>
          Role tidak memiliki izin approve.
        </div>
      )}
    </div>
  )
}
