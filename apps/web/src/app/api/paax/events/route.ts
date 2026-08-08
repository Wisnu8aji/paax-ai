// paax/web — /api/paax/events route (F2 stub, WAITING_DEPENDENCY F1 W1-D).
//
// HTTP endpoint yang di-reference oleh ws-client.ts dan runtime-bridge.ts:
//   GET  /api/paax/events?run_id=<id>&after_sequence=<seq>[&task_id=<id>]
//        → HTTP replay dari gateway F1 event_store (EventLog.replay_after_sequence).
//
// WS  (/api/paax/events/ws) dan SSE (/api/paax/events/sse) memerlukan
// Next.js route handler terpisah atau upgrade middleware; untuk saat ini
// only HTTP replay path yang di-expose di sini.
//
// WAITING_DEPENDENCY F1 W1-D: gateway relay.py belum live. Route ini
// melaporkan status jujur (503) sampai gateway tersedia. ws-client.ts
// akan fallback ke http-replay → none bila endpoint 503. Status konsol:
//   transport=http-replay → http replay unavailable (jujur disconnected).
//
// Setelah F1 gateway live, ganti GATEWAY_URL ke env var nyata dan hapus
// fallback 503 ini.

import { type NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const GATEWAY_URL =
  process.env.PAAX_GATEWAY_URL ||
  process.env.PAAX_RUNTIME_URL ||
  ''

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

/** GET /api/paax/events — HTTP replay dari gateway event store. */
export async function GET(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get('run_id') || ''
  const afterSeq = request.nextUrl.searchParams.get('after_sequence') || '-1'
  const taskId = request.nextUrl.searchParams.get('task_id') || ''

  if (!runId) {
    return NextResponse.json({ error: 'run_id required' }, { status: 400 })
  }

  // WAITING_DEPENDENCY F1 W1-D: gateway belum live.
  if (!GATEWAY_URL) {
    return NextResponse.json(
      {
        error: 'gateway event relay belum tersedia',
        detail: 'WAITING_DEPENDENCY: F1 gateway relay contract W1-D',
        run_id: runId,
        after_sequence: Number(afterSeq),
        events: [],
      },
      { status: 503 },
    )
  }

  // Forward ke gateway bila PAAX_GATEWAY_URL tersedia.
  const params = new URLSearchParams({ run_id: runId, after_sequence: afterSeq })
  if (taskId) params.set('task_id', taskId)
  const target = `${GATEWAY_URL.replace(/\/+$/, '')}/events?${params.toString()}`

  try {
    const upstream = await fetch(target, {
      headers: gatewayHeaders(),
      cache: 'no-store',
    })
    const body = await upstream.text()
    return new NextResponse(body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'application/json',
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    return NextResponse.json(
      { error: 'gateway event relay tidak dapat dihubungi', detail: String(e), events: [] },
      { status: 503 },
    )
  }
}
