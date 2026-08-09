import { NextRequest, NextResponse } from 'next/server';
import {
  addGatewayEvent,
  getGatewayEvents,
  recordGatewayCommand,
} from './event-gateway-store';

export const runtime = 'nodejs';

function orchestratorUrl(): string {
  return (process.env.AI_ORCHESTRATOR_URL || 'http://127.0.0.1:8082').replace(/\/+$/, '');
}

export async function GET(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get('run_id');
  const afterSeqStr = request.nextUrl.searchParams.get('after_sequence');
  const taskId = request.nextUrl.searchParams.get('task_id');
  const afterSequence = afterSeqStr ? parseInt(afterSeqStr, 10) : -1;

  if (!runId) {
    return NextResponse.json({ error: 'Missing run_id parameter' }, { status: 400 });
  }

  // Attempt proxying to AI Orchestrator service if available
  try {
    const url = `${orchestratorUrl()}/api/paax/events?run_id=${encodeURIComponent(runId)}&after_sequence=${afterSequence}${taskId ? `&task_id=${encodeURIComponent(taskId)}` : ''}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 800);
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }
  } catch {
    // Backend service unreachable: fallback to local event gateway store
  }

  const events = getGatewayEvents(runId, Number.isNaN(afterSequence) ? -1 : afterSequence, taskId);
  return NextResponse.json({ run_id: runId, events });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (body.method === 'paax.command') {
      recordGatewayCommand(body);
      return NextResponse.json({ ok: true, method: 'paax.command', command: body.params?.command, run_id: body.params?.run_id });
    }

    if (body.method === 'paax.event') {
      const result = addGatewayEvent(body);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true, method: 'paax.event', event_id: body.params?.event_id });
    }

    return NextResponse.json({ error: 'Unknown method. Expected paax.command or paax.event' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to process request', detail: String(err) }, { status: 500 });
  }
}
