// paax/web — /api/paax/events/ws route (F1-rev1 gateway live WS relay route).
//
// Endpoint default yang di-reference oleh ws-client.ts (runtime-bridge.ts:94-127):
//   GET /api/paax/events/ws?run_id=<id>[&task_id=<id>]
//       → Endpoint relay gateway v2 (WebSocket / HTTP stream relay).

import { type NextRequest, NextResponse } from 'next/server'
import { getRelayStore } from '@/lib/paax/event-relay-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get('run_id') || ''
  const taskId = request.nextUrl.searchParams.get('task_id') || ''
  const afterSeqNum = Number(request.nextUrl.searchParams.get('after_sequence') ?? '-1')
  const afterSeq = Number.isNaN(afterSeqNum) ? -1 : afterSeqNum

  if (!runId) {
    return NextResponse.json({ error: 'run_id required' }, { status: 400 })
  }

  const relayStore = getRelayStore()

  if (relayStore.hasRun(runId)) {
    const events = relayStore.getEvents(runId, afterSeq, taskId)
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        method: 'paax.event_batch',
        params: {
          run_id: runId,
          events,
        },
        _replay: true,
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
  }

  // Run belum memiliki events — status jujur: 200 + events kosong + web_trace false.
  // 503 hanya untuk gateway unavailable, bukan state kosong (kontrak plan F2 §3.1).
  return NextResponse.json(
    {
      run_id: runId,
      events: [],
      web_trace: false,
      detail: 'run belum memiliki events di relay store — menunggu gateway F1',
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
