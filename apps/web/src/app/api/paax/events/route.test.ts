// @vitest-environment node

import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';
import { getRelayStore } from '../../../../lib/paax/event-relay-store';

describe('/api/paax/events route handler', () => {
  beforeEach(() => {
    getRelayStore().clear();
  });

  it('GET /api/paax/events error 400 bila run_id tidak diisi', async () => {
    const req = new NextRequest('http://localhost:3000/api/paax/events');
    const res = await GET(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('run_id required');
  });

  it('POST /api/paax/events menyimpan event dan GET mengembalikannya', async () => {
    const runId = 'paax:run:test-01';

    const postReq = new NextRequest('http://localhost:3000/api/paax/events', {
      method: 'POST',
      body: JSON.stringify({
        run_id: runId,
        events: [
          {
            event_id: 'paax:evt:run-test-01:1:00000001',
            run_id: runId,
            sequence: 1,
            timestamp: new Date().toISOString(),
            type: 'task.started',
            task_id: 'T01',
            payload_summary: { status: 'running' },
          },
        ],
      }),
    });
    const postRes = await POST(postReq);
    expect(postRes.status).toBe(200);
    const postBody = await postRes.json();
    expect(postBody.ok).toBe(true);
    expect(postBody.count).toBe(1);
    expect(postBody.web_trace).toBe(true);

    const getReq = new NextRequest(`http://localhost:3000/api/paax/events?run_id=${runId}`);
    const getRes = await GET(getReq);
    expect(getRes.status).toBe(200);
    const body = await getRes.json();
    expect(body.events.length).toBe(1);
    expect(body.web_trace).toBe(true);
  });

  it('POST /api/paax/events error 400 bila run_id tidak diisi', async () => {
    const postReq = new NextRequest('http://localhost:3000/api/paax/events', {
      method: 'POST',
      body: JSON.stringify({ events: [] }),
    });
    const postRes = await POST(postReq);
    expect(postRes.status).toBe(400);
  });

  it('GET /api/paax/events mengembalikan events kosong dan web_trace=false bila run belum ada', async () => {
    const getReq = new NextRequest('http://localhost:3000/api/paax/events?run_id=paax:run:nonexistent');
    const getRes = await GET(getReq);
    expect(getRes.status).toBe(200);
    const body = await getRes.json();
    expect(body.events).toEqual([]);
    expect(body.web_trace).toBe(false);
  });

  it('GET /api/paax/events filter after_sequence berfungsi', async () => {
    const runId = 'paax:run:test-seq';

    const postReq = new NextRequest('http://localhost:3000/api/paax/events', {
      method: 'POST',
      body: JSON.stringify({
        run_id: runId,
        events: [
          { run_id: runId, sequence: 1, type: 'task.started', task_id: 'T01', timestamp: new Date().toISOString() },
          { run_id: runId, sequence: 2, type: 'task.progress', task_id: 'T01', timestamp: new Date().toISOString() },
          { run_id: runId, sequence: 3, type: 'task.completed', task_id: 'T01', timestamp: new Date().toISOString() },
        ],
      }),
    });
    await POST(postReq);

    const getReq = new NextRequest(`http://localhost:3000/api/paax/events?run_id=${runId}&after_sequence=1`);
    const getRes = await GET(getReq);
    const body = await getRes.json();
    expect(body.events.length).toBe(2);
    expect(body.events.every((e: { params: { sequence: number } }) => e.params.sequence > 1)).toBe(true);
  });

  // ── Plan compliance rev2: dedup event_id (plan §3.6) ────────────────────────
  it('POST /api/paax/events dedup event_id — event yang sama tidak diduplikasi (plan §3.6)', async () => {
    const runId = 'paax:run:test-dedup';
    const ts = new Date().toISOString();
    const eventPayload = {
      run_id: runId,
      events: [
        { event_id: 'paax:evt:dedup:1:00000001', run_id: runId, sequence: 1, type: 'task.started', task_id: 'T01', timestamp: ts },
        // event_id sama — harus didedup
        { event_id: 'paax:evt:dedup:1:00000001', run_id: runId, sequence: 1, type: 'task.started', task_id: 'T01', timestamp: ts },
        { event_id: 'paax:evt:dedup:2:00000002', run_id: runId, sequence: 2, type: 'task.completed', task_id: 'T01', timestamp: ts },
      ],
    };
    const postReq = new NextRequest('http://localhost:3000/api/paax/events', {
      method: 'POST',
      body: JSON.stringify(eventPayload),
    });
    await POST(postReq);

    const getReq = new NextRequest(`http://localhost:3000/api/paax/events?run_id=${runId}`);
    const getRes = await GET(getReq);
    const body = await getRes.json();
    // Hanya 2 event unik (event_id duplikat tidak disimpan)
    expect(body.events.length).toBe(2);
    const ids = body.events.map((e: { params: { event_id: string } }) => e.params.event_id);
    expect(new Set(ids).size).toBe(2);
  });
});

