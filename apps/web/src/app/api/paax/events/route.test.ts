// @vitest-environment node

import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';
import { clearGatewayStore, addGatewayEvent, getGatewayCommands } from './event-gateway-store';
import { makeEventEnvelope } from '../../../../components/drawing-intelligence/workspace/agentic/agent-execution-console/event-contract';

describe('/api/paax/events route handler', () => {
  beforeEach(() => {
    clearGatewayStore();
  });

  it('GET /api/paax/events error 400 bila run_id tidak diisi', async () => {
    const req = new NextRequest('http://localhost:3000/api/paax/events');
    const res = await GET(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('Missing run_id');
  });

  it('POST /api/paax/events menyimpan event valid dan GET mengembalikannya', async () => {
    const event = makeEventEnvelope({
      event_id: 'paax:evt:run-test-01:1:00000001',
      run_id: 'paax:run:test-01',
      sequence: 1,
      timestamp: new Date().toISOString(),
      type: 'task.started',
      task_id: 'T01',
      payload_summary: { status: 'running' },
    });

    const postReq = new NextRequest('http://localhost:3000/api/paax/events', {
      method: 'POST',
      body: JSON.stringify(event),
    });
    const postRes = await POST(postReq);
    expect(postRes.status).toBe(200);

    const getReq = new NextRequest('http://localhost:3000/api/paax/events?run_id=paax:run:test-01');
    const getRes = await GET(getReq);
    expect(getRes.status).toBe(200);
    const body = await getRes.json();
    expect(body.events.length).toBe(1);
    expect(body.events[0].params.event_id).toBe('paax:evt:run-test-01:1:00000001');
  });

  it('POST /api/paax/events menolak synthetic event di jalur produksi (scanRealEvents gate)', async () => {
    const syntheticEvent = makeEventEnvelope({
      event_id: 'paax:evt:run-test-02:1:00000002',
      run_id: 'paax:run:test-02',
      sequence: 1,
      timestamp: new Date().toISOString(),
      type: 'task.started',
      task_id: 'T01',
      payload_summary: { synthetic: true, notProduction: true },
    });

    const postReq = new NextRequest('http://localhost:3000/api/paax/events', {
      method: 'POST',
      body: JSON.stringify(syntheticEvent),
    });
    const postRes = await POST(postReq);
    expect(postRes.status).toBe(400);
    const json = await postRes.json();
    expect(json.error).toContain('Scan rejected');
  });

  it('POST /api/paax/events mencatat command paax.command', async () => {
    const cmd = {
      jsonrpc: '2.0',
      method: 'paax.command',
      params: {
        command: 'pause',
        run_id: 'paax:run:test-03',
      },
    };

    const postReq = new NextRequest('http://localhost:3000/api/paax/events', {
      method: 'POST',
      body: JSON.stringify(cmd),
    });
    const postRes = await POST(postReq);
    expect(postRes.status).toBe(200);
    const json = await postRes.json();
    expect(json.ok).toBe(true);

    const loggedCmds = getGatewayCommands('paax:run:test-03');
    expect(loggedCmds.length).toBe(1);
    expect(loggedCmds[0].params.command).toBe('pause');
  });
});
