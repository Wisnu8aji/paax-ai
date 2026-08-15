// paax/web — /api/paax/events route (F1-rev1 production route, Event Protocol v2 replay).
//
// HTTP endpoint yang di-reference oleh ws-client.ts dan runtime-bridge.ts:
//   GET  /api/paax/events?run_id=<id>&after_sequence=<seq>[&task_id=<id>]
//        → HTTP replay dari gateway EventRelay/EventStore v2.
//   POST /api/paax/events
//        → Ingest event JSON / array ke gateway event relay store.

import { type NextRequest, NextResponse } from 'next/server'
import type { PaaxEventEnvelope } from '@/components/drawing-intelligence/workspace/agentic/agent-execution-console/event-contract'
import { scanRealEvents } from '@/components/drawing-intelligence/workspace/agentic/agent-execution-console/scan'
import { getRelayStore } from '@/lib/paax/event-relay-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getGatewayUrl(): string {
  return process.env.PAAX_GATEWAY_URL || process.env.PAAX_RUNTIME_URL || ''
}

function gatewayHeaders(): HeadersInit {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  }
  const key = process.env.INTERNAL_SERVICE_KEY || ''
  if (key) h['X-Internal-Key'] = key
  const actor = process.env.PAAX_PORTABLE_ACTOR_ID?.trim() || 'paax-web'
  h['X-User-Id'] = actor
  const auth = process.env.PAAX_GATEWAY_AUTH_TOKEN || ''
  if (auth) h['Authorization'] = `Bearer ${auth}`
  return h
}

function normalizeToV2Envelope(item: unknown, runId: string): PaaxEventEnvelope | null {
  if (!item || typeof item !== 'object') return null
  const raw = item as Record<string, any>

  // Bila sudah berupa envelope v2 valid
  if (raw.jsonrpc === '2.0' && raw.method === 'paax.event' && raw.params && typeof raw.params === 'object') {
    const params = raw.params as Record<string, any>
    const envelope: PaaxEventEnvelope = {
      jsonrpc: '2.0',
      method: 'paax.event',
      params: {
        event_id: String(params.event_id || `paax:evt:${runId}:${params.sequence ?? 0}:00000000`),
        run_id: String(params.run_id || runId),
        task_id: params.task_id ?? null,
        parent_task_id: params.parent_task_id ?? null,
        agent_id: params.agent_id ?? null,
        session_id: params.session_id ?? null,
        worker_id: params.worker_id ?? null,
        provider: params.provider ?? null,
        model: params.model ?? null,
        sequence: Number(params.sequence ?? 0),
        timestamp: String(params.timestamp || new Date().toISOString()),
        type: String(params.type || 'run.started'),
        stage: params.stage ?? null,
        payload_summary: params.payload_summary ?? params.payload ?? null,
        payload_ref: params.payload_ref ?? null,
        redaction_state: (params.redaction_state as any) || 'clean',
        persistence_status: (params.persistence_status as any) || 'durable',
      },
      _replay: true,
    }
    return envelope
  }

  // Legacy flat event parameter mapping → v2 envelope
  const seq = Number(raw.sequence ?? raw.seq ?? 0)
  const envelope: PaaxEventEnvelope = {
    jsonrpc: '2.0',
    method: 'paax.event',
    params: {
      event_id: String(raw.event_id || `paax:evt:${runId}:${seq}:00000000`),
      run_id: String(raw.run_id || runId),
      task_id: raw.task_id ?? null,
      parent_task_id: raw.parent_task_id ?? null,
      agent_id: raw.agent_id ?? null,
      session_id: raw.session_id ?? null,
      worker_id: raw.worker_id ?? null,
      provider: raw.provider ?? null,
      model: raw.model ?? null,
      sequence: seq,
      timestamp: String(raw.timestamp || new Date().toISOString()),
      type: String(raw.type || 'run.started'),
      stage: raw.stage ?? null,
      payload_summary: raw.payload_summary ?? raw.payload ?? null,
      payload_ref: raw.payload_ref ?? null,
      redaction_state: raw.redaction_state || 'clean',
      persistence_status: raw.persistence_status || 'durable',
    },
    _replay: true,
  }

  return envelope
}

/** GET /api/paax/events — HTTP replay event log v2 dari gateway event store. */
export async function GET(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get('run_id') || ''
  const afterSeqNum = Number(request.nextUrl.searchParams.get('after_sequence') ?? '-1')
  const afterSeq = Number.isNaN(afterSeqNum) ? -1 : afterSeqNum
  const taskId = request.nextUrl.searchParams.get('task_id') || ''

  if (!runId) {
    return NextResponse.json({ error: 'run_id required' }, { status: 400 })
  }

  const gatewayUrl = getGatewayUrl()
  const relayStore = getRelayStore()

  // Hydrate before consulting an optional upstream gateway. A gateway can be
  // reachable yet still lag behind the worker journal (for example it may
  // have received only the lifecycle envelope while page-level events are
  // already durable). The durable journal is the source of truth for replay;
  // never let a successful-but-partial upstream response hide it.
  relayStore.hydrateFromJournal(runId)

  // 1. Bila PAAX_GATEWAY_URL / PAAX_RUNTIME_URL di-configure, proxy ke upstream
  if (gatewayUrl) {
    const params = new URLSearchParams({ run_id: runId, after_sequence: String(afterSeq) })
    if (taskId) params.set('task_id', taskId)
    const target = `${gatewayUrl.replace(/\/+$/, '')}/events?${params.toString()}`

    try {
      const upstream = await fetch(target, {
        headers: gatewayHeaders(),
        cache: 'no-store',
      })

      if (!upstream.ok) {
        return NextResponse.json(
          { error: 'gateway response error', status: upstream.status, run_id: runId, events: [] },
          { status: upstream.status },
        )
      }

      const rawData = (await upstream.json()) as unknown
      const rawList = Array.isArray(rawData) ? rawData : (rawData as { events?: unknown[] })?.events ?? []

      const normalizedEvents: PaaxEventEnvelope[] = rawList
        .map(item => normalizeToV2Envelope(item, runId))
        .filter((env): env is PaaxEventEnvelope => env !== null)
        .filter(env => env.params.sequence > afterSeq)
        .sort((a, b) => a.params.sequence - b.params.sequence)

      // Merge upstream replay into the same in-memory store as journal
      // events. This makes the response complete when the gateway is
      // reachable but behind the worker, and also gives the SSE route a
      // single deduplicated source on the next connection.
      relayStore.ingestBatch(runId, normalizedEvents)
      if (relayStore.hasRun(runId)) {
        return serveFromRelayStore(relayStore, runId, afterSeq, taskId)
      }

      return NextResponse.json(
        {
          run_id: runId,
          after_sequence: afterSeq,
          events: normalizedEvents,
          web_trace: true,
        },
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          },
        },
      )
    } catch (e) {
      // Worker→web relay gagal — jangan tinggalkan browser di seq 0: fallback
      // ke journal durable (PAAX_AGENT_EVENT_JOURNAL) bila punya data run ini.
      if (relayStore.hasRun(runId)) {
        return serveFromRelayStore(relayStore, runId, afterSeq, taskId)
      }
      return NextResponse.json(
        { error: 'gateway event relay tidak dapat dihubungi', detail: String(e), events: [] },
        { status: 503 },
      )
    }
  }

  // 2. Journal replay/hydration: recovery dari worker→web relay outage sebelum
  //    melayani dari relay store (tidak ada gateway ter-configure).
  // 3. Bila lokal relay store memiliki data run ini, respons 200 dengan events nyata
  if (relayStore.hasRun(runId)) {
    return serveFromRelayStore(relayStore, runId, afterSeq, taskId)
  }

  // 4. Relay store kosong — beri response dengan empty events (web_trace: false)
  return NextResponse.json(
    {
      run_id: runId,
      after_sequence: afterSeq,
      events: [],
      web_trace: false,
    },
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    },
  )
}

/** Serve a run from the local relay store (in-memory + journal-hydrated). */
function serveFromRelayStore(
  relayStore: ReturnType<typeof getRelayStore>,
  runId: string,
  afterSeq: number,
  taskId: string,
) {
  const allRunEvents = relayStore.getEvents(runId, -1)
  const scanResult = scanRealEvents(allRunEvents, { allowSynthetic: false })
  const isLiveValid = scanResult.ok && allRunEvents.length > 0
  const events = relayStore.getEvents(runId, afterSeq, taskId)
  return NextResponse.json(
    {
      run_id: runId,
      after_sequence: afterSeq,
      events,
      web_trace: isLiveValid,
    },
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    },
  )
}

/** POST /api/paax/events — Ingest events ke gateway event relay store. */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, any>
    const runId = body.run_id || request.nextUrl.searchParams.get('run_id') || ''

    if (!runId) {
      return NextResponse.json({ error: 'run_id required' }, { status: 400 })
    }

    const relayStore = getRelayStore()
    const rawEvents = Array.isArray(body.events) ? body.events : [body]
    if (rawEvents.length === 0) {
      return NextResponse.json({
        ok: true,
        run_id: runId,
        count: 0,
        events: [],
        web_trace: false,
      })
    }

    const ingested = relayStore.ingestBatch(runId, rawEvents)

    // Anti-fake gate: scan ingested events in production mode (reject synthetic in live route)
    const scanResult = scanRealEvents(ingested, { allowSynthetic: false })
    if (!scanResult.ok) {
      const detail = scanResult.findings.map(f => `${f.code}:${f.eventId}`).join('; ')
      return NextResponse.json(
        {
          error: 'synthetic/invalid events rejected on live route',
          detail,
          run_id: runId,
          web_trace: false,
        },
        { status: 400 },
      )
    }

    return NextResponse.json({
      ok: true,
      run_id: runId,
      count: ingested.length,
      events: ingested,
      web_trace: true,
    })
  } catch (e) {
    return NextResponse.json({ error: 'failed to ingest events', detail: String(e) }, { status: 400 })
  }
}
