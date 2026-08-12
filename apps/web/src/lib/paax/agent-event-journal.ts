// paax/web — Durable-worker journal replay/hydration (PAAX_AGENT_EVENT_JOURNAL).
//
// The durable worker (services/document-intelligence/app/runtime_events.py)
// appends every valid v2 event to the agent-events.jsonl journal BEFORE the
// optional web relay, so a worker→web relay outage must never leave the
// browser stuck at sequence 0. This module reads that journal and hands back
// only valid, non-synthetic v2 envelopes — it reuses the same deterministic
// gates as the live routes (validatePaaxEvent + scanRealEvents, G2.3), so a
// journal replay can never resurrect fake or malformed events.

import { readFileSync } from 'node:fs'
import type { PaaxEventEnvelope } from '@/components/drawing-intelligence/workspace/agentic/agent-execution-console/event-contract'
import { scanRealEvents } from '@/components/drawing-intelligence/workspace/agentic/agent-execution-console/scan'

export const RUN_ID_PREFIX = 'paax:run:'

/** Poll cadence for the SSE journal refresh while a stream is connected. */
export const JOURNAL_REFRESH_MS = 3000

/** Strip the `paax:run:` prefix so raw and canonical run ids compare equal. */
export function rawRunId(runId: string): string {
  const clean = String(runId ?? '').trim()
  return clean.startsWith(RUN_ID_PREFIX) ? clean.slice(RUN_ID_PREFIX.length) : clean
}

/** Resolve the journal path from the environment (empty string = disabled). */
export function getAgentEventJournalPath(): string {
  return (process.env.PAAX_AGENT_EVENT_JOURNAL || '').trim()
}

/**
 * Parse one JSONL line into a v2 envelope.
 *
 * Returns null for malformed JSON, non-v2 shapes, envelopes that fail the
 * production scan gate (synthetic/mock/fake markers, G2.3), or — when
 * `runId` is given — events belonging to another run. Replayed envelopes are
 * marked `_replay: true` exactly like gateway replay.
 */
export function parseJournalLine(line: string, runId?: string): PaaxEventEnvelope | null {
  const trimmed = String(line ?? '').trim()
  if (!trimmed) return null

  let raw: unknown
  try {
    raw = JSON.parse(trimmed)
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object') return null

  const item = raw as Record<string, any>
  const params = item.params as Record<string, any> | undefined
  if (item.jsonrpc !== '2.0' || item.method !== 'paax.event' || !params || typeof params !== 'object') {
    return null
  }

  const envelope: PaaxEventEnvelope = {
    jsonrpc: '2.0',
    method: 'paax.event',
    params: {
      event_id: String(params.event_id ?? ''),
      run_id: String(params.run_id ?? ''),
      task_id: params.task_id ?? null,
      parent_task_id: params.parent_task_id ?? null,
      agent_id: params.agent_id ?? null,
      session_id: params.session_id ?? null,
      worker_id: params.worker_id ?? null,
      provider: params.provider ?? null,
      model: params.model ?? null,
      sequence: Number(params.sequence),
      timestamp: String(params.timestamp ?? ''),
      type: String(params.type ?? ''),
      stage: params.stage ?? null,
      payload_summary: params.payload_summary ?? params.payload ?? null,
      payload_ref: params.payload_ref ?? null,
      redaction_state: (params.redaction_state as any) || 'clean',
      persistence_status: (params.persistence_status as any) || 'durable',
    },
    _replay: true,
  }

  if (runId && rawRunId(envelope.params.run_id) !== rawRunId(runId)) return null

  const scan = scanRealEvents([envelope], { allowSynthetic: false })
  if (!scan.ok) return null

  return envelope
}

/**
 * Read all valid v2 envelopes for a run from the journal, sorted by
 * sequence. Never throws: a missing or unreadable journal is an empty
 * replay, not an error.
 */
export function readJournalEvents(journalPath: string, runId?: string): PaaxEventEnvelope[] {
  if (!journalPath) return []

  let content: string
  try {
    content = readFileSync(journalPath, 'utf-8')
  } catch {
    return []
  }

  const out: PaaxEventEnvelope[] = []
  for (const line of content.split(/\r?\n/)) {
    const env = parseJournalLine(line, runId)
    if (env) out.push(env)
  }
  return out.sort((a, b) => a.params.sequence - b.params.sequence)
}
