// @vitest-environment node
// paax/web — sse/route.ts journal hydration regression tests.
//
// Worker→web relay outage harus tidak meninggalkan browser di seq 0: SSE
// menghidrasi event journal saat connect DAN me-refresh journal berkala
// selagi stream terbuka — tanpa event synthetic, tanpa duplikat.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { GET } from './route';
import { getRelayStore } from '../../../../../lib/paax/event-relay-store';
import { JOURNAL_REFRESH_MS } from '../../../../../lib/paax/agent-event-journal';
import type { PaaxEventEnvelope } from '../../../../../components/drawing-intelligence/workspace/agentic/agent-execution-console/event-contract';

const ENV_KEY = 'PAAX_AGENT_EVENT_JOURNAL';

function journalLine(run: string, seq: number, eventIdSuffix = '00000001', extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    jsonrpc: '2.0',
    method: 'paax.event',
    params: {
      event_id: `paax:evt:${run}:${seq}:${eventIdSuffix}`,
      run_id: `paax:run:${run}`,
      sequence: seq,
      timestamp: '2026-08-12T00:00:00.000Z',
      type: 'task.progress',
      payload_summary: {},
      ...extra,
    },
  });
}

async function readStreamFrames(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string[]> {
  const decoder = new TextDecoder();
  const frames: string[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    frames.push(decoder.decode(value));
  }
  return frames;
}

function parseFrames(frames: string[]): PaaxEventEnvelope[] {
  return frames
    .filter((f) => f.startsWith('data: '))
    .map((f) => JSON.parse(f.slice(6)) as PaaxEventEnvelope);
}

describe('/api/paax/events/sse route — journal hydration', () => {
  afterEach(() => {
    getRelayStore().clear();
    vi.useRealTimers();
    delete process.env[ENV_KEY];
  });

  it('SSE mengirim event journal saat connect bila relay store kosong (bukan seq 0)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'paax-sse-connect-'));
    const journal = join(dir, 'agent-events.jsonl');
    writeFileSync(journal, journalLine('sse-connect', 1) + '\n' + journalLine('sse-connect', 2) + '\n');
    process.env[ENV_KEY] = journal;
    vi.useFakeTimers();

    try {
      const abort = new AbortController();
      const req = new NextRequest('http://localhost:3000/api/paax/events/sse?run_id=paax:run:sse-connect', {
        signal: abort.signal,
      });
      const res = await GET(req);
      expect(res.status).toBe(200);

      const framesPromise = readStreamFrames(res.body!.getReader());
      abort.abort();
      const frames = await framesPromise;

      const events = parseFrames(frames);
      expect(events.map((e) => e.params.sequence)).toEqual([1, 2]);
      expect(events.every((e) => e._replay === true)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('SSE me-refresh event journal selagi connected — dedup + tanpa synthetic', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'paax-sse-refresh-'));
    const journal = join(dir, 'agent-events.jsonl');
    writeFileSync(journal, '');
    process.env[ENV_KEY] = journal;
    vi.useFakeTimers();

    try {
      const runId = 'sse-refresh';
      const abort = new AbortController();
      const req = new NextRequest(`http://localhost:3000/api/paax/events/sse?run_id=paax:run:${runId}`, {
        signal: abort.signal,
      });
      const res = await GET(req);
      expect(res.status).toBe(200);

      const framesPromise = readStreamFrames(res.body!.getReader());

      // Worker relay gagal — worker hanya menulis journal. Event 1 & 2 muncul.
      appendFileSync(journal, journalLine(runId, 1) + '\n' + journalLine(runId, 2) + '\n');
      await vi.advanceTimersByTimeAsync(JOURNAL_REFRESH_MS + 10);

      // Duplikat event_id, duplikat sequence, dan event synthetic → tidak boleh dikirim.
      appendFileSync(journal, journalLine(runId, 1) + '\n');
      appendFileSync(journal, journalLine(runId, 2, '00000002') + '\n');
      appendFileSync(journal, journalLine(runId, 3, '00000003', { payload_summary: { synthetic: true } }) + '\n');
      await vi.advanceTimersByTimeAsync(JOURNAL_REFRESH_MS + 10);

      // Worker menulis event baru seq 3 — refresh harus mengirimnya.
      appendFileSync(journal, journalLine(runId, 3) + '\n');
      await vi.advanceTimersByTimeAsync(JOURNAL_REFRESH_MS + 10);

      abort.abort();
      const frames = await framesPromise;

      const events = parseFrames(frames);
      expect(events.map((e) => e.params.sequence)).toEqual([1, 2, 3]);
      expect(new Set(events.map((e) => e.params.event_id)).size).toBe(3);
      expect(events.some((e) => (e.params.payload_summary as Record<string, unknown> | null)?.synthetic)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
