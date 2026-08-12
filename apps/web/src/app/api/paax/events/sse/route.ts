// paax/web — /api/paax/events/sse route (F1-rev1 gateway live SSE endpoint).
//
// SSE endpoint yang di-reference oleh ws-client.ts dan runtime-bridge.ts:
//   GET /api/paax/events/sse?run_id=<id>&access_token=<token>[&task_id=<id>]
//       → Live Server-Sent Events stream dari gateway relay store.
//
// Journal recovery: worker menulis event durable ke PAAX_AGENT_EVENT_JOURNAL
// SEBELUM relay POST, jadi bila relay worker→web gagal, stream ini tetap
// menghidrasi event journal (connect + refresh berkala) — browser tidak pernah
// macet di seq 0. Semua event journal sudah melewati gate anti-synthetic
// (G2.3), sehingga refresh tidak pernah meng-invent event.

import { type NextRequest } from 'next/server'
import { getRelayStore } from '@/lib/paax/event-relay-store'
import { getAgentEventJournalPath, JOURNAL_REFRESH_MS } from '@/lib/paax/agent-event-journal'
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
      // 1. Journal replay/hydration (silent): events durable dari worker yang
      //    relay-nya gagal tersedia untuk browser sejak connect. Tidak
      //    menotifikasi subscriber — batch existing di bawah yang mengirimnya.
      relayStore.hydrateFromJournal(runId)

      // 2. Send existing events from relay store
      const existing = relayStore.getEvents(runId, afterSeq, taskId)
      for (const ev of existing) {
        const frame = `data: ${JSON.stringify(ev)}\n\n`
        controller.enqueue(encoder.encode(frame))
      }

      // 3. Subscribe to new live events
      const unsubscribe = relayStore.subscribe(runId, (ev: PaaxEventEnvelope) => {
        if (taskId && ev.params.task_id !== taskId) return
        try {
          const frame = `data: ${JSON.stringify(ev)}\n\n`
          controller.enqueue(encoder.encode(frame))
        } catch {
          // Stream closed
        }
      })

      // 4. Journal refresh while connected: worker→web relay bisa gagal saat
      //    stream sudah connect. Polling journal ringan (refreshFromJournal
      //    menghidrasi hanya event BARU — dedup event_id + sequence — lalu
      //    menotifikasi subscriber) sehingga console live tetap sinkron tanpa
      //    event synthetic.
      const journalPath = getAgentEventJournalPath()
      let journalRefresh: ReturnType<typeof setInterval> | undefined
      if (journalPath) {
        journalRefresh = setInterval(() => relayStore.refreshFromJournal(runId), JOURNAL_REFRESH_MS)
      }

      // Handle signal abort/cancel
      request.signal.addEventListener('abort', () => {
        if (journalRefresh) clearInterval(journalRefresh)
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
