// paax/web — ApprovalCard (F2 #3, approval / MP3-P2 F-04 presentation).
//
// Adaptasi approval.tsx konsol R1 ke v2. Card dari approval.requested /
// approval.resolved event. Keputusan user → callback (di-wire ke
// paax.command approve bila gateway WS terhubung). Sesuai
// APPROVAL_UI_CONTRACT §3.1/§6:
//   - Header: APPROVAL REQUIRED + impact badge (low=ok, medium=warn,
//     high=accent-alt, critical=danger).
//   - Refs list (entity CORTEX/ADEX) sebagai chip referensi.
//   - Action: Approve/Reject + input rationale (min 3 kata untuk approve).
//   - Resolved: decision, rationale, resolved_by, resolved_at, dan lineage
//     override/recalc (overrideLineage).
//   - Fallback §8: gateway tidak terhubung → tombol nonaktif + catatan jujur
//     "Menunggu koneksi gateway".

import { useState } from 'react'
import type { ApprovalItem } from '../agent-execution-console/event-store'

export interface ApprovalCardProps {
  card: ApprovalItem
  onRespond?: (decision: { approvalId: string; decision: 'approved' | 'rejected'; rationale: string }) => void
  canApprove?: boolean
  /** Gateway WS/SSE terhubung? false → tombol nonaktif (fallback jujur §8). */
  gatewayConnected?: boolean
}

const IMPACT_LABEL: Record<string, string> = {
  critical: 'Critical impact',
  high: 'High impact',
  medium: 'Medium impact',
  low: 'Low impact',
}

/** Warna impact per APPROVAL_UI_CONTRACT §6.3. */
const IMPACT_COLOR: Record<string, string> = {
  low: 'var(--di-ok, #22c55e)',
  medium: 'var(--di-warn, #eab308)',
  high: 'var(--di-accent-alt, #f97316)',
  critical: 'var(--di-danger, #ef4444)',
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'APPROVAL REQUIRED',
  approved: 'APPROVED',
  rejected: 'REJECTED',
  excluded: 'EXCLUDED',
}

/** Validasi deterministik: rationale min 3 kata untuk override. */
export function isRationaleValid(rationale: string): boolean {
  return rationale.trim().split(/\s+/).filter(Boolean).length >= 3
}

export function ApprovalCard({ card, onRespond, canApprove = true, gatewayConnected = true }: ApprovalCardProps): React.ReactElement {
  const [rationale, setRationale] = useState('')
  const rationaleValid = isRationaleValid(rationale)

  const submit = (decision: 'approved' | 'rejected') => {
    if (decision === 'approved' && !rationaleValid) return
    onRespond?.({ approvalId: card.approvalId, decision, rationale })
  }

  const resolved = card.status !== 'pending'
  const impactColor = IMPACT_COLOR[card.impact] ?? 'var(--di-warn, #eab308)'
  const actionsBlocked = !gatewayConnected

  return (
    <div
      data-testid="approval-card"
      data-status={card.status}
      data-impact={card.impact}
      data-gateway-connected={gatewayConnected ? 'true' : 'false'}
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
      {/* Header: status + impact badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10 }}>
        <span data-testid="approval-header" style={{ fontWeight: 700, color: resolved ? 'var(--di-text3)' : '#eab308' }}>
          {resolved ? `✓ ${STATUS_LABEL[card.status]}` : `⚠ ${STATUS_LABEL[card.status] ?? 'APPROVAL REQUIRED'}`}
        </span>
        <span
          data-testid="approval-impact-badge"
          style={{
            fontSize: 9,
            fontWeight: 700,
            padding: '1px 6px',
            borderRadius: 4,
            color: impactColor,
            border: `1px solid ${impactColor}`,
            background: 'transparent',
            textTransform: 'uppercase',
            letterSpacing: 0.3,
          }}
        >
          {card.impact}
        </span>
        <span style={{ color: 'var(--di-text3)' }}>approval</span>
        <span data-testid="approval-status" style={{ marginLeft: 'auto', color: resolved ? 'var(--di-ok, #22c55e)' : '#eab308', fontWeight: 600 }}>
          {card.status}
        </span>
      </div>

      {/* Reason + context */}
      <div style={{ fontSize: 11.5, color: 'var(--di-text)' }}>{card.reason}</div>
      {card.context && <div style={{ fontSize: 10, color: 'var(--di-text2)', lineHeight: 1.45 }}>{card.context}</div>}

      {/* Refs sebagai chip referensi */}
      {card.refs.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {card.refs.map((ref) => (
            <span
              key={ref}
              data-testid="approval-ref"
              className="di-mono"
              style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'var(--di-panel2)', border: '1px solid var(--di-border)', color: 'var(--di-text2)' }}
            >
              {ref}
            </span>
          ))}
        </div>
      )}

      {resolved && (
        <div data-testid="approval-resolved" style={{ fontSize: 10, color: 'var(--di-text2)', display: 'flex', flexDirection: 'column', gap: 3, borderTop: '1px dashed var(--di-border)', paddingTop: 5 }}>
          {card.rationale && <div style={{ lineHeight: 1.45 }}>Rationale: {card.rationale}</div>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {card.resolvedBy && <span>Resolved by: <strong>{card.resolvedBy}</strong></span>}
            {card.resolvedAt && <span className="di-mono">{new Date(card.resolvedAt).toISOString().replace('T', ' ').slice(0, 19)} UTC</span>}
          </div>
          {card.overrideLineage && card.overrideLineage.length > 0 && (
            <div data-testid="approval-lineage" style={{ lineHeight: 1.45 }}>
              <span style={{ fontWeight: 700 }}>Lineage override/recalc:</span> {card.overrideLineage.join(' · ')}
            </div>
          )}
        </div>
      )}

      {!resolved && canApprove && !actionsBlocked && (
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

      {!resolved && canApprove && actionsBlocked && (
        <div data-testid="approval-gateway-wait" style={{ fontSize: 10, color: '#eab308' }}>
          Menunggu koneksi gateway — respons belum bisa dikirim.
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
