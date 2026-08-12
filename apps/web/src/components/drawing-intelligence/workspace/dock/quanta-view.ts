// paax/web — QUANTA live view selector (MP3-P2 quantities workspace view).
//
// Konsumsi data QUANTA HANYA dari event v2 nyata (`quanta.row_created`,
// `formula.completed`, `approval.requested/resolved`) yang sudah melewati
// gateway. Anti-fake (G2.3): selektor menjalankan scanRealEvents JALUR
// PRODUKSI (tanpa allowSynthetic) — bila ada satu pun event gagal scan
// (marker simulasi/synthetic/invalid), SELURUH hasil ditolak (`ok: false`),
// TIDAK PERNAH menampilkan data sintetis sebagai quantity.
//
// Modul murni/deterministik — di-unit-test.

import type { PaaxEventEnvelope } from '../agentic/agent-execution-console/event-contract'
import { scanRealEvents } from '../agentic/agent-execution-console/scan'

export type QuantaRowStatus = 'draft' | 'needs-review' | 'verified' | 'conflict' | 'excluded' | 'pending-approval'

export interface QuantaApprovalState {
  approvalId: string
  status: 'pending' | 'approved' | 'rejected' | 'excluded'
  decision?: string
  rationale?: string
  resolvedBy?: string
  resolvedAt?: string
}

export interface QuantaRow {
  rowId: string
  taskId: string | null
  workItem: string
  location: string
  unit: string
  /** nilai numerik bila payload membawanya; UI tidak menghitung. */
  qty: number | null
  qtyDisplay: string | null
  formulaRef: string | null
  status: QuantaRowStatus
  evidenceRefs: string[]
  /** halaman sumber hasil parse evidence refs (untuk navigasi viewer). */
  sourcePages: number[]
  approval: QuantaApprovalState | null
  sequence: number
  timestamp: string
}

export interface QuantaFormulaReceipt {
  formulaId: string
  expression: string | null
  result: number | null
  resultDisplay: string | null
  status: string
  sequence: number
  timestamp: string
}

export interface QuantaSelection {
  /** false = gate anti-fake menolak — jangan render data apa pun. */
  ok: boolean
  scannedEvents: number
  rows: QuantaRow[]
  receipts: QuantaFormulaReceipt[]
  /** true when the selected runtime already emitted run.completed. */
  runCompleted: boolean
}

export const EMPTY_QUANTA_SELECTION: QuantaSelection = { ok: false, scannedEvents: 0, rows: [], receipts: [], runCompleted: false }

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.map(String).filter(s => s.length > 0)
  }
  const s = str(v)
  return s ? s.split(',').map(x => x.trim()).filter(Boolean) : []
}

/**
 * Parse referensi bukti → nomor halaman (1-based) untuk navigasi viewer.
 * Pola: `page-3`, `page_index_3`, `EV-3`, `adex:p07:label:K1` (p07 → 7),
 * `crop:3:x,y,w,h`, `page3`.
 */
export function parseEvidencePage(ref: string): number | null {
  const trimmed = ref.trim()
  if (!trimmed) return null

  const pageIndex = trimmed.match(/page[-_ ]?index[-_ ]?(\d+)/i)
  if (pageIndex) return parseInt(pageIndex[1]!, 10) + 1

  const ev = trimmed.match(/EV[-_ ]?(\d+)/i)
  if (ev) return parseInt(ev[1]!, 10) + 1

  const page = trimmed.match(/page[-_ ]?(\d+)/i)
  if (page) return parseInt(page[1]!, 10)

  const crop = trimmed.match(/crop[:/](\d+)/i)
  if (crop) return parseInt(crop[1]!, 10)

  // adex:p07:label:K1 → p diikuti 2 digit, dibatasi delimiter.
  const pRef = trimmed.match(/(?:^|:)p(\d{1,2})(?::|$)/i)
  if (pRef) return parseInt(pRef[1]!, 10)

  return null
}

function rowStatusOf(raw: string | null | undefined, hasPendingApproval: boolean): QuantaRowStatus {
  const value = raw?.toLowerCase()
  if (value === 'verified' || value === 'approved') return 'verified'
  if (value === 'excluded') return 'excluded'
  if (value === 'conflict' || value === 'needs-review' || value === 'needs_review') return 'conflict'
  if (hasPendingApproval) return 'pending-approval'
  if (value === 'draft' || !value) return 'draft'
  return 'draft'
}

/**
 * Selektor QUANTA dari daftar event v2. Gate anti-fake: scanRealEvents
 * produksi — gagal → `ok:false`, rows kosong.
 */
export function selectQuantaFromEvents(events: readonly PaaxEventEnvelope[]): QuantaSelection {
  if (!events || events.length === 0) {
    return { ...EMPTY_QUANTA_SELECTION, scannedEvents: 0 }
  }

  // G2.3 anti-fake: data quantity HANYA dari event nyata. Satu frame
  // synthetic/invalid → seluruh seleksi ditolak.
  const scan = scanRealEvents(events)
  if (!scan.ok) {
    const sample = scan.findings.slice(0, 3).map(f => `${f.code}:${f.eventId}`).join('; ')
    console.warn(`[quanta-view] anti-fake gate REJECTED ${scan.findings.length} finding(s): ${sample}`)
    return { ...EMPTY_QUANTA_SELECTION, scannedEvents: events.length }
  }

  const rows: QuantaRow[] = []
  const receipts: QuantaFormulaReceipt[] = []
  const approvals: Array<{ approvalId: string; rowIds: string[]; state: QuantaApprovalState }> = []
  const runCompleted = events.some((event) => event.params.type === 'run.completed')

  for (const event of events) {
    const p = event.params
    const summary = p.payload_summary ?? {}
    switch (p.type) {
      case 'quanta.row_created': {
        const rowId = str(summary.row_id) ?? str(summary.id) ?? p.event_id
        const evidenceRefs = asStringArray(summary.evidence_refs ?? summary.refs)
        const sourcePages = Array.from(new Set(evidenceRefs.map(parseEvidencePage).filter((n): n is number => n !== null))).sort((a, b) => a - b)
        const qty = num(summary.qty) ?? num(summary.quantity) ?? num(summary.value)
        const unit = str(summary.unit) ?? '-'
        rows.push({
          rowId,
          taskId: p.task_id,
          workItem: str(summary.work_item) ?? str(summary.workItem) ?? str(summary.item) ?? str(summary.description) ?? rowId,
          location: str(summary.location) ?? str(summary.floor) ?? str(summary.level) ?? '-',
          unit,
          qty,
          qtyDisplay: str(summary.qty_display) ?? str(summary.qtyDisplay) ?? (qty !== null ? String(qty) : null),
          formulaRef: str(summary.formula_ref) ?? str(summary.formula_id) ?? null,
          status: rowStatusOf(str(summary.status), false),
          evidenceRefs,
          sourcePages,
          approval: null,
          sequence: p.sequence,
          timestamp: p.timestamp,
        })
        break
      }
      case 'formula.completed': {
        const formulaId = str(summary.formula_id) ?? str(summary.receipt_id) ?? p.event_id
        const result = num(summary.result) ?? num(summary.value)
        receipts.push({
          formulaId,
          expression: str(summary.expression) ?? str(summary.formula) ?? null,
          result,
          resultDisplay: str(summary.result_display) ?? str(summary.resultDisplay) ?? (result !== null ? String(result) : null),
          status: str(summary.status) ?? 'completed',
          sequence: p.sequence,
          timestamp: p.timestamp,
        })
        break
      }
      case 'approval.requested': {
        const approvalId = str(summary.approval_id) ?? ''
        if (!approvalId) break
        // Join ke row: payload boleh membawa row_id, atau refs menyebut
        // quanta:row:<id> / row:<id>.
        const explicit = str(summary.row_id) ?? str(summary.quanta_row_id)
        const refs = asStringArray(summary.refs)
        const rowIds: string[] = []
        if (explicit) rowIds.push(explicit)
        for (const ref of refs) {
          const m = ref.match(/(?:quanta:)?row:([^:\s]+)/i)
          if (m) rowIds.push(m[1]!)
        }
        approvals.push({
          approvalId,
          rowIds,
          state: {
            approvalId,
            status: 'pending',
            requestedAt: p.timestamp,
          } as QuantaApprovalState,
        })
        break
      }
      case 'approval.resolved': {
        const approvalId = str(summary.approval_id) ?? ''
        const decision = str(summary.decision) ?? str(summary.decision_state)
        const status: QuantaApprovalState['status'] =
          decision === 'approved' ? 'approved' : decision === 'rejected' ? 'rejected' : decision === 'excluded' ? 'excluded' : 'pending'
        const target = approvals.find(a => a.approvalId === approvalId)
        if (target) {
          target.state = {
            ...target.state,
            status,
            decision: decision ?? undefined,
            rationale: str(summary.rationale) ?? undefined,
            resolvedBy: str(summary.resolved_by) ?? undefined,
            resolvedAt: str(summary.resolved_at) ?? p.timestamp,
          }
        }
        break
      }
      default:
        break
    }
  }

  // Join approval → rows (by row_id atau via formula_ref ke receipt — cukup
  // row_id eksplisit untuk MP3-P2; refs `quanta:row:` juga di-join).
  for (const row of rows) {
    const match = approvals.find(a =>
      a.rowIds.includes(row.rowId) || a.rowIds.includes(row.rowId.replace(/^quanta:row:/, '')) || row.evidenceRefs.includes(a.approvalId),
    )
    if (match) {
      row.approval = match.state
      if (match.state.status === 'pending') {
        row.status = 'pending-approval'
      } else if (match.state.status === 'rejected' || match.state.status === 'excluded') {
        row.status = 'excluded'
      }
    }
  }

  return { ok: true, scannedEvents: events.length, rows, receipts, runCompleted }
}

/** Alias ringkas: rows saja (tetap anti-fake — [] bila gate menolak). */
export function quantaRowsFromEvents(events: readonly PaaxEventEnvelope[]): QuantaRow[] {
  return selectQuantaFromEvents(events).rows
}
