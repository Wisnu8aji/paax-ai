// @vitest-environment node
// paax/web — ws/route.ts plan compliance tests (rev2).
//
// Gate plan F2 §3.1: route mengembalikan 503 HANYA saat dependency benar-benar
// unavailable, bukan untuk run yang kosong. Run kosong → 200 + empty events +
// web_trace: false.

import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { GET } from './route';
import { getRelayStore } from '../../../../../lib/paax/event-relay-store';

const ENV_KEY = 'PAAX_AGENT_EVENT_JOURNAL';

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

describe('/api/paax/events/ws route handler — plan compliance (rev2)', () => {
  beforeEach(() => {
    getRelayStore().clear();
  });

  it('GET ws/route error 400 bila run_id tidak diisi', async () => {
    const req = new NextRequest('http://localhost:3000/api/paax/events/ws');
    const res = await GET(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('run_id required');
  });

  it('GET ws/route mengembalikan 200 + events kosong + web_trace=false bila run belum ada (bukan 503)', async () => {
    // Gap fix rev2: 503 hanya untuk gateway unavailable, bukan state kosong.
    const req = new NextRequest('http://localhost:3000/api/paax/events/ws?run_id=paax:run:nonexistent-ws');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events).toEqual([]);
    expect(body.web_trace).toBe(false);
    expect(body.run_id).toBe('paax:run:nonexistent-ws');
    // Tidak ada field error — status jujur kosong, bukan error dependency
    expect(body.error).toBeUndefined();
  });

  it('GET ws/route mengembalikan 200 + events + web_trace=true bila run ada', async () => {
    const runId = 'paax:run:ws-test-01';
    const store = getRelayStore();
    store.ingest(runId, {
      event_id: 'paax:evt:ws-test-01:1:00000001',
      run_id: runId,
      sequence: 1,
      type: 'task.started',
      task_id: 'T01',
      timestamp: new Date().toISOString(),
    });

    const req = new NextRequest(`http://localhost:3000/api/paax/events/ws?run_id=${runId}`);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.web_trace).toBe(true);
    // WS route menggunakan jsonrpc envelope format: params.events
    expect(body.jsonrpc).toBe('2.0');
    expect(body.method).toBe('paax.event_batch');
    expect(body.params.events.length).toBe(1);
    expect(body.params.run_id).toBe(runId);
  });

  it('GET ws/route after_sequence filter berfungsi', async () => {
    const runId = 'paax:run:ws-test-seq';
    const store = getRelayStore();
    const ts = new Date().toISOString();
    store.ingest(runId, { event_id: 'paax:evt:ws-seq:1:00000001', run_id: runId, sequence: 1, type: 'task.started', task_id: 'T01', timestamp: ts });
    store.ingest(runId, { event_id: 'paax:evt:ws-seq:2:00000002', run_id: runId, sequence: 2, type: 'task.progress', task_id: 'T01', timestamp: ts });
    store.ingest(runId, { event_id: 'paax:evt:ws-seq:3:00000003', run_id: runId, sequence: 3, type: 'task.completed', task_id: 'T01', timestamp: ts });

    const req = new NextRequest(`http://localhost:3000/api/paax/events/ws?run_id=${runId}&after_sequence=1`);
    const res = await GET(req);
    const body = await res.json();
    expect(body.params.events.length).toBe(2);
    expect(body.params.events.every((e: { params: { sequence: number } }) => e.params.sequence > 1)).toBe(true);
  });

  it('GET ws/route mereplay event journal saat relay memory kosong (worker relay outage)', async () => {
    const previousJournal = process.env[ENV_KEY];
    const directory = mkdtempSync(join(tmpdir(), 'paax-ws-journal-'));
    const journal = join(directory, 'agent-events.jsonl');
    const runId = 'ws-journal-run';
    writeFileSync(journal, journalLine(runId, 0, 'run.started') + '\n' + journalLine(runId, 1, 'task.started') + '\n');
    process.env[ENV_KEY] = journal;
    try {
      const req = new NextRequest(`http://localhost:3000/api/paax/events/ws?run_id=paax:run:${runId}`);
      const res = await GET(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.web_trace).toBe(true);
      expect(body.method).toBe('paax.event_batch');
      expect(body.params.events).toHaveLength(2);
      expect(body.params.events.map((e: { params: { sequence: number } }) => e.params.sequence)).toEqual([0, 1]);
    } finally {
      if (previousJournal === undefined) delete process.env[ENV_KEY];
      else process.env[ENV_KEY] = previousJournal;
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
