// @vitest-environment node

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';
import { getRelayStore } from '../../../../lib/paax/event-relay-store';

const ENV_KEY = 'PAAX_AGENT_EVENT_JOURNAL';
const GATEWAY_KEY = 'PAAX_GATEWAY_URL';

function journalLine(run: string, seq: number, type: string): string {
  return JSON.stringify({
    jsonrpc: '2.0',
    method: 'paax.event',
    params: {
      event_id: `paax:evt:${run}:${seq}:00000001`,
      run_id: `paax:run:${run}`,
      sequence: seq,
      timestamp: new Date().toISOString(),
      type,
      payload_summary: {},
    },
  });
}

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

  it('GET /api/paax/events mereplay event durable saat relay memory kosong', async () => {
    const previousJournal = process.env.PAAX_AGENT_EVENT_JOURNAL;
    const directory = mkdtempSync(join(tmpdir(), 'paax-events-'));
    const journal = join(directory, 'agent-events.jsonl');
    const runId = 'journal-replay-01';
    writeFileSync(journal, JSON.stringify({
      jsonrpc: '2.0', method: 'paax.event',
      params: {
        event_id: 'paax:evt:journal-replay-01:0:00000001',
        run_id: `paax:run:${runId}`, sequence: 0, type: 'run.started',
        timestamp: new Date().toISOString(), payload_summary: { source: 'worker' },
      },
    }) + '\n');
    process.env.PAAX_AGENT_EVENT_JOURNAL = journal;
    try {
      const response = await GET(new NextRequest(`http://localhost:3000/api/paax/events?run_id=${runId}`));
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.web_trace).toBe(true);
      expect(body.events).toHaveLength(1);
      expect(body.events[0].params.run_id).toBe(`paax:run:${runId}`);
    } finally {
      if (previousJournal === undefined) delete process.env.PAAX_AGENT_EVENT_JOURNAL;
      else process.env.PAAX_AGENT_EVENT_JOURNAL = previousJournal;
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('GET /api/paax/events fallback ke journal saat gateway relay gagal (bukan 503)', async () => {
    const previousJournal = process.env[ENV_KEY];
    const previousGateway = process.env[GATEWAY_KEY];
    const directory = mkdtempSync(join(tmpdir(), 'paax-gw-fallback-'));
    const journal = join(directory, 'agent-events.jsonl');
    const runId = 'gw-fallback-run';
    writeFileSync(journal, journalLine(runId, 0, 'run.started') + '\n');
    process.env[ENV_KEY] = journal;
    process.env[GATEWAY_KEY] = 'http://127.0.0.1:1';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('relay down'));
    try {
      const response = await GET(new NextRequest(`http://localhost:3000/api/paax/events?run_id=paax:run:${runId}`));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.events).toHaveLength(1);
      expect(body.web_trace).toBe(true);
    } finally {
      fetchSpy.mockRestore();
      if (previousJournal === undefined) delete process.env[ENV_KEY];
      else process.env[ENV_KEY] = previousJournal;
      if (previousGateway === undefined) delete process.env[GATEWAY_KEY];
      else process.env[GATEWAY_KEY] = previousGateway;
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('GET /api/paax/events menggabungkan journal saat gateway reachable tetapi tertinggal', async () => {
    const previousJournal = process.env[ENV_KEY];
    const previousGateway = process.env[GATEWAY_KEY];
    const directory = mkdtempSync(join(tmpdir(), 'paax-gw-partial-'));
    const journal = join(directory, 'agent-events.jsonl');
    const runId = 'gw-partial-run';
    writeFileSync(journal, journalLine(runId, 0, 'run.started') + '\n' + journalLine(runId, 1, 'tool.started') + '\n');
    process.env[ENV_KEY] = journal;
    process.env[GATEWAY_KEY] = 'http://gateway.test';
    const upstreamOnlyFirst = JSON.parse(journalLine(runId, 0, 'run.started'));
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ events: [upstreamOnlyFirst] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    try {
      const response = await GET(new NextRequest(`http://localhost:3000/api/paax/events?run_id=${runId}`));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.web_trace).toBe(true);
      expect(body.events.map((event: { params: { sequence: number } }) => event.params.sequence)).toEqual([0, 1]);
    } finally {
      fetchSpy.mockRestore();
      if (previousJournal === undefined) delete process.env[ENV_KEY];
      else process.env[ENV_KEY] = previousJournal;
      if (previousGateway === undefined) delete process.env[GATEWAY_KEY];
      else process.env[GATEWAY_KEY] = previousGateway;
      rmSync(directory, { recursive: true, force: true });
    }
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

  it('POST /api/paax/events menolak event synthetic di jalur produksi dengan 400 dan web_trace=false', async () => {
    const runId = 'paax:run:test-synth';
    const postReq = new NextRequest('http://localhost:3000/api/paax/events', {
      method: 'POST',
      body: JSON.stringify({
        run_id: runId,
        events: [
          {
            event_id: 'paax:evt:test-synth:1:00000001',
            run_id: runId,
            sequence: 1,
            type: 'task.started',
            task_id: 'T01',
            timestamp: new Date().toISOString(),
            payload_summary: { synthetic: true, notProduction: true },
          },
        ],
      }),
    });
    const postRes = await POST(postReq);
    expect(postRes.status).toBe(400);
    const body = await postRes.json();
    expect(body.web_trace).toBe(false);
    expect(body.error).toContain('synthetic/invalid events rejected');
  });
});
