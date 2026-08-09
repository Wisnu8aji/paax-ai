import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { GET as getEvents, POST as postEvents } from '@/app/api/paax/events/route';
import { GET as getSseEvents } from '@/app/api/paax/events/sse/route';
import { GET as getWsEvents } from '@/app/api/paax/events/ws/route';
import { getRelayStore } from '@/lib/paax/event-relay-store';
import { PaaxRuntimeStore } from '../agentic/agent-execution-console/event-store';

describe('FASE A & B — Gateway Live & Web Trace End-to-End Tests', () => {
  const runId = 'paax:run:live:20260808003103';
  const events3pPath = 'G:\\PAAX-Orchestration\\00_projects\\2026-08-07-drawing-intelligence-r2\\09_workspace\\r2\\live_test_3pages\\events_3p.jsonl';

  beforeEach(() => {
    getRelayStore().clear();
  });

  describe('FASE A — Gateway Live Relay Endpoints', () => {
    it('1. Returns 503 WAITING_DEPENDENCY with web_trace=false when gateway url is empty and no local run exists', async () => {
      const req = new NextRequest(`http://localhost:3000/api/paax/events?run_id=paax:run:unknown`);
      const res = await getEvents(req);
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error).toContain('gateway event relay belum tersedia');
      expect(body.detail).toContain('WAITING_DEPENDENCY');
      expect(body.web_trace).toBe(false);
    });

    it('2. Ingests events via POST /api/paax/events and returns 200 with web_trace=true', async () => {
      const rawEvents = [
        {
          event_id: 'paax:evt:paax:run:test:1:00000001',
          run_id: 'paax:run:test',
          type: 'spectra.classified',
          sequence: 1,
          timestamp: new Date().toISOString(),
          synthetic: false,
        },
      ];

      const postReq = new NextRequest('http://localhost:3000/api/paax/events', {
        method: 'POST',
        body: JSON.stringify({ run_id: 'paax:run:test', events: rawEvents }),
      });
      const postRes = await postEvents(postReq);
      expect(postRes.status).toBe(200);
      const postBody = await postRes.json();
      expect(postBody.ok).toBe(true);
      expect(postBody.web_trace).toBe(true);
      expect(postBody.count).toBe(1);

      // Subsequent GET returns HTTP 200 with events and web_trace=true
      const getReq = new NextRequest('http://localhost:3000/api/paax/events?run_id=paax:run:test');
      const getRes = await getEvents(getReq);
      expect(getRes.status).toBe(200);
      const getBody = await getRes.json();
      expect(getBody.events).toHaveLength(1);
      expect(getBody.events[0]._replay).toBe(true);
      expect(getBody.web_trace).toBe(true);
    });

    it('3. Serves SSE stream via /api/paax/events/sse with v2 envelopes', async () => {
      getRelayStore().ingest('paax:run:sse_test', {
        event_id: 'paax:evt:paax:run:sse_test:1:00000001',
        run_id: 'paax:run:sse_test',
        type: 'spectra.classified',
        sequence: 1,
        timestamp: new Date().toISOString(),
        synthetic: false,
      });

      const sseReq = new NextRequest('http://localhost:3000/api/paax/events/sse?run_id=paax:run:sse_test');
      const sseRes = await getSseEvents(sseReq);
      expect(sseRes.status).toBe(200);
      expect(sseRes.headers.get('Content-Type')).toBe('text/event-stream');
    });

    it('4. Serves WS route endpoint via /api/paax/events/ws with v2 batch envelopes', async () => {
      getRelayStore().ingest('paax:run:ws_test', {
        event_id: 'paax:evt:paax:run:ws_test:1:00000001',
        run_id: 'paax:run:ws_test',
        type: 'spectra.classified',
        sequence: 1,
        timestamp: new Date().toISOString(),
        synthetic: false,
      });

      const wsReq = new NextRequest('http://localhost:3000/api/paax/events/ws?run_id=paax:run:ws_test');
      const wsRes = await getWsEvents(wsReq);
      expect(wsRes.status).toBe(200);
      const wsBody = await wsRes.json();
      expect(wsBody.jsonrpc).toBe('2.0');
      expect(wsBody.method).toBe('paax.event_batch');
      expect(wsBody.web_trace).toBe(true);
      expect(wsBody.params.events).toHaveLength(1);
    });
  });

  describe('FASE B — Web Trace End-to-End Proven (events_3p.jsonl Replay)', () => {
    it('1. Replays 8 production events from events_3p.jsonl through relay store into PaaxRuntimeStore', () => {
      const fileContent = fs.readFileSync(events3pPath, 'utf-8');
      const lines = fileContent.trim().split('\n').filter(Boolean);
      expect(lines).toHaveLength(8);

      const parsedEvents = lines.map((l) => JSON.parse(l));
      const ingestedEnvelopes = getRelayStore().ingestBatch(runId, parsedEvents);
      expect(ingestedEnvelopes).toHaveLength(8);

      const runtimeStore = new PaaxRuntimeStore();
      for (const env of ingestedEnvelopes) {
        runtimeStore.ingest(env);
      }

      const state = runtimeStore.getState();
      expect(state.rawEvents).toHaveLength(8);
      expect(state.webTrace).toBe(true);
      expect(state.lastSequence).toBe(8);
      expect(state.replayed).toBe(true);
    });
  });
});
