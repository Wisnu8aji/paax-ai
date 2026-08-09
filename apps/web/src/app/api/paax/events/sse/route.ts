// paax/web — /api/paax/events/sse route (F1-rev1 gateway live SSE endpoint).
//
// SSE endpoint yang di-reference oleh ws-client.ts dan runtime-bridge.ts:
//   GET /api/paax/events/sse?run_id=<id>&access_token=<token>[&task_id=<id>]
//       → Live Server-Sent Events stream dari gateway relay store.

import { type NextRequest } from 'next/server'
import { getRelayStore } from '@/lib/paax/event-relay-store'
import type { PaaxEventEnvelope } from '@/components/drawing-intelligence/workspace/agentic/agent-execution-console/event-contract'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get('run_id') || ''
  const taskId = request.nextUrl.searchParams.get('task_id') || ''
  const afterSeqNum = Number(request.nextUrl.searchParams.get('after_sequence') ?? '-1')
  const afterSeq = Number.isNaN(afterSeqNum) ? -1 : afterSeqNum

  if (!runId) {
    return new Response(JSON.stringify({ error: 'run_id required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const relayStore = getRelayStore()
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      // 1. Send existing events from relay store
      const existing = relayStore.getEvents(runId, afterSeq, taskId)
      for (const ev of existing) {
        const frame = `data: ${JSON.stringify(ev)}\n\n`
        controller.enqueue(encoder.encode(frame))
      }

      // 2. Subscribe to new live events
      const unsubscribe = relayStore.subscribe(runId, (ev: PaaxEventEnvelope) => {
        if (taskId && ev.params.task_id !== taskId) return
        try {
          const frame = `data: ${JSON.stringify(ev)}\n\n`
          controller.enqueue(encoder.encode(frame))
        } catch {
          // Stream closed
        }
      })

      // Handle signal abort/cancel
      request.signal.addEventListener('abort', () => {
        unsubscribe()
        try {
          controller.close()
        } catch {
          // Stream already closed
        }
      })
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
