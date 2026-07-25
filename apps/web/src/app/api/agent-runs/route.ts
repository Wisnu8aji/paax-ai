import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

function baseUrl(): string {
  return (process.env.AI_ORCHESTRATOR_URL || 'http://127.0.0.1:8082').replace(/\/+$/, '');
}
function headers(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-Internal-Key': process.env.INTERNAL_SERVICE_KEY || '',
    'X-User-Id': process.env.PAAX_PORTABLE_ACTOR_ID || 'paax-web',
  };
}

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get('projectId') || '';
  try {
    const response = await fetch(`${baseUrl()}/agent-runs?projectId=${encodeURIComponent(projectId)}`, { headers: headers(), cache: 'no-store' });
    const body = await response.text();
    return new NextResponse(body, { status: response.status, headers: { 'Content-Type': response.headers.get('content-type') || 'application/json' } });
  } catch (error) {
    return NextResponse.json({ error: 'Agent runtime belum tersedia', detail: String(error) }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const payload = await request.json();
  try {
    const response = await fetch(`${baseUrl()}/agent-runs`, { method: 'POST', headers: headers(), body: JSON.stringify(payload) });
    const body = await response.text();
    return new NextResponse(body, { status: response.status, headers: { 'Content-Type': response.headers.get('content-type') || 'application/json' } });
  } catch (error) {
    return NextResponse.json({ error: 'Agent runtime belum tersedia', detail: String(error) }, { status: 503 });
  }
}
