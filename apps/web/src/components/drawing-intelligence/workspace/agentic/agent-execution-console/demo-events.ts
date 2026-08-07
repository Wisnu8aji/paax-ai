// paax/web — Demo fixture berlabel TEST (anti-fake, G2.3).
//
// FIKSI DEMO — BUKAN produksi. Semua event di fixture ini diberi label
// `synthetic:true, notProduction:true` di payload_summary sehingga scan.ts
// MENOLAK bila dimasukkan ke jalur produksi dan hanya lolos lewat
// assertDemoEvents (allowSynthetic=true). HANYA dipakai story/test eksplisit.
//
// Deret event mensimulasikan TaskEngine 12-task + trace runtime:
// run.started → task.started → reasoning.delta → tool.started/completed →
// subagent.started/completed → task.progress → approval.requested → dst.

import { makeEventEnvelope, type PaaxEventEnvelope } from './event-contract'

const RUN_ID = 'paax:run:demo-20260807'
const SYNTHETIC = { synthetic: true, notProduction: true } as const

function ev(seq: number, type: string, patch: Partial<Parameters<typeof makeEventEnvelope>[0]> = {}): PaaxEventEnvelope {
  return makeEventEnvelope({
    event_id: `paax:evt:demo-20260807:${seq}:${seq.toString(16).padStart(8, '0')}`,
    run_id: RUN_ID,
    sequence: seq,
    timestamp: new Date(Date.UTC(2026, 7, 7, 18, 0, 0, seq * 1000)).toISOString(),
    type,
    provider: 'opencode-go',
    model: 'deepseek-v4-flash',
    ...patch,
    payload_summary: { ...SYNTHETIC, ...(patch.payload_summary ?? {}) },
  })
}

export function buildDemoEvents(): PaaxEventEnvelope[] {
  const events: PaaxEventEnvelope[] = [
    ev(1, 'run.started', { stage: 'T01', payload_summary: { run_id: RUN_ID } }),
    // T01 — deterministik
    ev(2, 'task.started', { task_id: 'T01', stage: 'T01' }),
    ev(3, 'tool.started', { task_id: 'T01', stage: 'T01', payload_summary: { tool: 'paax_source_register' } }),
    ev(4, 'tool.completed', { task_id: 'T01', stage: 'T01', payload_summary: { tool: 'paax_source_register', status: 'ok', duration_s: 0.4 } }),
    ev(5, 'task.progress', { task_id: 'T01', stage: 'T01', payload_summary: { progress: 0.5 } }),
    ev(6, 'task.progress', { task_id: 'T01', stage: 'T01', payload_summary: { progress: 1.0 } }),
    ev(7, 'task.completed', { task_id: 'T01', stage: 'T01', payload_summary: { progress: 1 } }),
    // T02 — render
    ev(8, 'task.started', { task_id: 'T02', stage: 'T02' }),
    ev(9, 'tool.started', { task_id: 'T02', stage: 'T02', payload_summary: { tool: 'paax_render_pages' } }),
    ev(10, 'artifact.created', { task_id: 'T02', stage: 'T02', payload_summary: { artifact_id: 'art-render-0001', kind: 'render', progress: 0.3 }, payload_ref: 'runs/demo/pages/page-0001.png' }),
    ev(11, 'tool.completed', { task_id: 'T02', stage: 'T02', payload_summary: { tool: 'paax_render_pages', status: 'ok', duration_s: 2.1 } }),
    ev(12, 'task.progress', { task_id: 'T02', stage: 'T02', payload_summary: { progress: 1.0 } }),
    ev(13, 'task.completed', { task_id: 'T02', stage: 'T02', payload_summary: { progress: 1 } }),
    // T03 — SPECTRA (AI) + reasoning + subagent
    ev(14, 'task.started', { task_id: 'T03', stage: 'T03' }),
    ev(15, 'reasoning.delta', { task_id: 'T03', stage: 'T03', payload_summary: { delta: 'Menganalisis judul sheet dan grid visual untuk klasifikasi halaman…' } }),
    ev(16, 'subagent.started', { task_id: 'T03', stage: 'T03', agent_id: 'sheet_classifier', session_id: 'sess-demo-1', worker_id: 'W01', payload_summary: { label: 'sheet_classifier', parent_agent_id: 'paax-agent' } }),
    ev(17, 'tool.started', { task_id: 'T03', stage: 'T03', agent_id: 'sheet_classifier', payload_summary: { tool: 'paax_sheet_classify_batch' } }),
    ev(18, 'reasoning.available', { task_id: 'T03', stage: 'T03', payload_summary: { content: 'Kandidat: RENCANA KOLOM LANTAI 1 → primary_class=plan, discipline=structure (confidence 0.97).' } }),
    ev(19, 'task.progress', { task_id: 'T03', stage: 'T03', payload_summary: { progress: 0.5 } }),
    ev(20, 'tool.completed', { task_id: 'T03', stage: 'T03', agent_id: 'sheet_classifier', payload_summary: { tool: 'paax_sheet_classify_batch', status: 'ok', duration_s: 3.4 } }),
    ev(21, 'spectra.classified', { task_id: 'T03', stage: 'T03', payload_summary: { sheet_id: 'SHEET-0001', primary_class: 'plan', confidence: 0.97 } }),
    ev(22, 'subagent.completed', { task_id: 'T03', stage: 'T03', agent_id: 'sheet_classifier', session_id: 'sess-demo-1', worker_id: 'W01', payload_summary: { duration_s: 4.2, confidence: 0.97 } }),
    ev(23, 'task.progress', { task_id: 'T03', stage: 'T03', payload_summary: { progress: 1.0 } }),
    ev(24, 'task.completed', { task_id: 'T03', stage: 'T03', payload_summary: { progress: 1 } }),
    // T04 — approval request (T11-style approval di tengah alur demo)
    ev(25, 'task.started', { task_id: 'T11', stage: 'T13' }),
    ev(26, 'approval.requested', { task_id: 'T11', stage: 'T13', payload_summary: { approval_id: 'appr-demo-0001', reason: 'Konflik interpretasi elemen K1 (kolom vs slab) lintas sheet', impact: 'high', refs: ['cortex:entity:K1', 'adex:p07:label:K1'] } }),
    ev(27, 'task.waiting_approval', { task_id: 'T11', stage: 'T13' }),
    ev(28, 'usage.recorded', { task_id: 'T03', stage: 'T03', payload_summary: { estimated_usd: 0.0042, cost_status: 'under_ceiling' } }),
    ev(29, 'receipt.created', { task_id: 'T03', stage: 'T03', payload_summary: { receipt_id: 'receipt-demo-1', model: 'deepseek-v4-flash' } }),
    ev(30, 'run.completed', { stage: 'T14', payload_summary: { status: 'completed' } }),
  ]
  return events
}
