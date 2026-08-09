import { NextRequest } from 'next/server';
import { getGatewayEvents } from '../event-gateway-store';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get('run_id');
  const taskId = request.nextUrl.searchParams.get('task_id');
  const authToken = request.nextUrl.searchParams.get('access_token');

  if (!runId) {
    return new Response(JSON.stringify({ error: 'Missing run_id parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (authToken === 'invalid-token') {
    return new Response(JSON.stringify({ error: 'Unauthorized token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let isClosed = false;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let lastSeq = -1;

      const sendNext = () => {
        if (isClosed) return;
        const events = getGatewayEvents(runId, lastSeq, taskId);
        for (const ev of events) {
          if (ev.params.sequence > lastSeq) {
            lastSeq = ev.params.sequence;
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
        }
      };

      sendNext();
      const interval = setInterval(sendNext, 300);

      request.signal.addEventListener('abort', () => {
        isClosed = true;
        clearInterval(interval);
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
