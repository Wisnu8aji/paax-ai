// paax/web — Real-events scan (anti-fake gate, G2.3).
//
// Adaptasi events/scan.ts konsol R1 ke Event Protocol v2 (KONTRAK 7).
// Scanner deterministik yang memverifikasi kumpulan event (fixture demo
// berlabel synthetic:true/notProduction:true, log gateway produksi, atau
// replay) terhadap kontrak real-events:
//   1. Setiap event lolos validasi envelope v2.
//   2. event_id valid dan UNIK.
//   3. Sequence non-decreasing per task.
//   4. Tidak ada marker simulasi truthy di jalur PRODUKSI:
//      simulated/fake/placeholder/hardcoded/mock/demo — kecuali label
//      eksplisit synthetic:true + notProduction:true (fixture/demo TEST).
//   5. Timestamp ISO parseable.
//   6. Redaction state terisi.
//
// Aturan anti-fake (Owner §0.15, MP §11 G2.3): jalur produksi TIDAK boleh
// memuat event synthetic; fixture demo WAJIB berlabel
// `synthetic:true, notProduction:true` dan hanya boleh lewat jalur demo
// (bukan produksi).

import type { PaaxEventEnvelope } from './event-contract'
import { validatePaaxEvent } from './event-contract'

export interface ScanFinding {
  eventId: string
  code:
    | 'INVALID_ENVELOPE'
    | 'DUPLICATE_EVENT_ID'
    | 'SEQUENCE_NOT_MONOTONIC'
    | 'SIMULATION_MARKER'
    | 'BAD_TIMESTAMP'
    | 'MISSING_REDACTION'
    | 'SYNTHETIC_IN_PRODUCTION'
  detail?: string
}

export interface ScanResult {
  ok: boolean
  total: number
  findings: ScanFinding[]
}

/** Marker simulasi yang TIDAK boleh ada di jalur produksi. */
const SIMULATION_MARKER_KEYS = [
  'simulated',
  'fake',
  'placeholder',
  'hardcoded',
  'mock',
  'is_demo',
  'demo',
] as const

/** Label eksplisit fixture/demo TEST yang mengizinkan synthetic DI LUAR produksi. */
export const SYNTHETIC_LABEL = 'synthetic'
export const NOT_PRODUCTION_LABEL = 'notProduction'

export function isSimulationMarker(value: unknown): boolean {
  if (value === true || value === 'true') {
    return true
  }
  if (typeof value === 'string' && /^(simulated|fake|placeholder|hardcoded|mock|demo)$/i.test(value)) {
    return true
  }
  return false
}

function hasMarkerInPayload(summary: Record<string, unknown> | null | undefined, key: string): boolean {
  if (!summary) return false
  return Object.prototype.hasOwnProperty.call(summary, key)
}

/**
 * Scan satu kumpulan event. `options.allowSynthetic` = true untuk jalur DEMO
 * (fixture berlabel synthetic:true + notProduction:true). Jalur produksi
 * (default) menolak synthetic apa pun — G2.3.
 */
export function scanRealEvents(
  events: readonly unknown[],
  options: { allowSynthetic?: boolean } = {},
): ScanResult {
  const findings: ScanFinding[] = []
  const seen = new Set<string>()
  const lastSeqByTask = new Map<string, number>()
  let total = 0

  for (const raw of events) {
    const validation = validatePaaxEvent(raw)
    if (!validation.valid) {
      const id =
        raw && typeof raw === 'object'
          ? ((raw as { params?: { event_id?: unknown } }).params?.event_id as string | undefined) ?? '<unknown>'
          : '<unknown>'
      findings.push({
        eventId: id,
        code: 'INVALID_ENVELOPE',
        detail: validation.issues.map(i => `${i.code}@${i.path}`).join(', '),
      })
      continue
    }

    const envelope = raw as PaaxEventEnvelope
    const p = envelope.params
    total++

    if (seen.has(p.event_id)) {
      findings.push({ eventId: p.event_id, code: 'DUPLICATE_EVENT_ID' })
    }
    seen.add(p.event_id)

    const last = lastSeqByTask.get(p.task_id ?? '__root__')
    if (last !== undefined && p.sequence < last) {
      findings.push({
        eventId: p.event_id,
        code: 'SEQUENCE_NOT_MONOTONIC',
        detail: `task=${p.task_id} seq=${p.sequence} < previous=${last}`,
      })
    }
    lastSeqByTask.set(p.task_id ?? '__root__', Math.max(last ?? -1, p.sequence))

    if (Number.isNaN(new Date(p.timestamp).getTime())) {
      findings.push({ eventId: p.event_id, code: 'BAD_TIMESTAMP' })
    }

    if (!p.redaction_state) {
      findings.push({ eventId: p.event_id, code: 'MISSING_REDACTION' })
    }

    // Marker simulasi di payload_summary.
    const summary = p.payload_summary ?? {}
    for (const key of SIMULATION_MARKER_KEYS) {
      if (hasMarkerInPayload(summary, key)) {
        const value = summary[key]
        if (isSimulationMarker(value)) {
          findings.push({
            eventId: p.event_id,
            code: 'SIMULATION_MARKER',
            detail: `payload_summary.${key}=${String(value)}`,
          })
        }
      }
    }

    // Synthetic di jalur produksi: label eksplisit synthetic:true +
    // notProduction:true hanya sah bila options.allowSynthetic (jalur demo).
    const isSynthetic = summary[SYNTHETIC_LABEL] === true || summary[SYNTHETIC_LABEL] === 'true'
    const isNotProduction = summary[NOT_PRODUCTION_LABEL] === true || summary[NOT_PRODUCTION_LABEL] === 'true'
    if (isSynthetic && !options.allowSynthetic) {
      findings.push({
        eventId: p.event_id,
        code: 'SYNTHETIC_IN_PRODUCTION',
        detail: isNotProduction
          ? 'fixture berlabel synthetic+notProduction masuk jalur non-demo'
          : `synthetic:true tanpa label ${NOT_PRODUCTION_LABEL}`,
      })
    }
    if (isSynthetic && !isNotProduction) {
      findings.push({
        eventId: p.event_id,
        code: 'SIMULATION_MARKER',
        detail: `synthetic:true WAJIB disertai ${NOT_PRODUCTION_LABEL}:true`,
      })
    }
  }

  return { ok: findings.length === 0, total, findings }
}

/**
 * Helper untuk fixture demo: semua event harus lolos scan JALUR DEMO
 * (allowSynthetic=true) — sekaligus memaksa label synthetic+notProduction.
 */
export function assertDemoEvents(events: readonly unknown[], label = 'demo fixture'): void {
  const result = scanRealEvents(events, { allowSynthetic: true })
  if (!result.ok) {
    const sample = result.findings.slice(0, 5).map(f => `${f.code}:${f.eventId}${f.detail ? ` (${f.detail})` : ''}`)
    throw new Error(`demo-events scan FAILED for ${label}: ${sample.join('; ')}`)
  }
}

/**
 * Helper untuk jalur produksi: event produksi WAJIB lolos scan tanpa
 * allowSynthetic — G2.3 no fake event.
 */
export function assertProductionEvents(events: readonly unknown[], label = 'production log'): void {
  const result = scanRealEvents(events)
  if (!result.ok) {
    const sample = result.findings.slice(0, 5).map(f => `${f.code}:${f.eventId}${f.detail ? ` (${f.detail})` : ''}`)
    throw new Error(`real-events scan FAILED for ${label}: ${sample.join('; ')}`)
  }
}
