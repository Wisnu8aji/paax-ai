// @vitest-environment node
// paax/web — agent-event-journal.ts regression tests.
//
// Journal replay must only ever surface VALID, non-synthetic v2 envelopes for
// the requested run: garbage lines, synthetic markers, and other runs' events
// are dropped before they reach the relay store or the browser.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  JOURNAL_REFRESH_MS,
  RUN_ID_PREFIX,
  getAgentEventJournalPath,
  parseJournalLine,
  rawRunId,
  readJournalEvents,
} from './agent-event-journal';

const ENV_KEY = 'PAAX_AGENT_EVENT_JOURNAL';

function journalLine(run: string, seq: number, extra: Record<string, unknown> = {}, eventIdSuffix = '00000001'): string {
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

function writeJournal(lines: string[]): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), 'paax-journal-'));
  const path = join(dir, 'agent-events.jsonl');
  writeFileSync(path, lines.join('\n') + '\n');
  return { dir, path };
}

describe('agent-event-journal', () => {
  afterEach(() => {
    delete process.env[ENV_KEY];
  });

  it('rawRunId menormalkan prefixed dan raw run id ke bentuk yang sama', () => {
    expect(rawRunId('paax:run:run-a')).toBe('run-a');
    expect(rawRunId('run-a')).toBe('run-a');
    expect(rawRunId('')).toBe('');
  });

  it('getAgentEventJournalPath membaca env PAAX_AGENT_EVENT_JOURNAL', () => {
    expect(getAgentEventJournalPath()).toBe('');
    process.env[ENV_KEY] = '  data/portable/agent-events.jsonl  ';
    expect(getAgentEventJournalPath()).toBe('data/portable/agent-events.jsonl');
  });

  it('parseJournalLine menerima envelope v2 valid dan menandai _replay', () => {
    const env = parseJournalLine(journalLine('run-a', 3));
    expect(env).not.toBeNull();
    expect(env!._replay).toBe(true);
    expect(env!.params.sequence).toBe(3);
    expect(env!.params.run_id).toBe('paax:run:run-a');
    expect(env!.params.event_id).toMatch(/^paax:evt:run-a:3:[0-9a-f]{8}$/);
  });

  it('parseJournalLine menolak baris tidak valid / bukan v2 / params rusak', () => {
    expect(parseJournalLine('not json')).toBeNull();
    expect(parseJournalLine('')).toBeNull();
    expect(parseJournalLine('{}')).toBeNull();
    expect(parseJournalLine(JSON.stringify({ jsonrpc: '2.0', method: 'paax.event' }))).toBeNull();
    expect(parseJournalLine(JSON.stringify({ jsonrpc: '1.0', method: 'paax.event', params: {} }))).toBeNull();
    const badSeq = JSON.parse(journalLine('run-a', 1)) as Record<string, any>;
    badSeq.params.sequence = 'x';
    expect(parseJournalLine(JSON.stringify(badSeq))).toBeNull();
  });

  it('parseJournalLine menolak event synthetic (gate anti-fake G2.3)', () => {
    const synthetic = journalLine('run-a', 1, { payload_summary: { synthetic: true } });
    expect(parseJournalLine(synthetic)).toBeNull();
  });

  it('parseJournalLine memfilter run saat runId diberikan', () => {
    expect(parseJournalLine(journalLine('run-a', 1), 'paax:run:run-b')).toBeNull();
    expect(parseJournalLine(journalLine('run-a', 1), 'run-a')).not.toBeNull();
  });

  it('readJournalEvents menggabungkan valid, memfilter run, dan urutkan sequence', () => {
    const { dir, path } = writeJournal([
      journalLine('run-a', 3),
      'garbage-line',
      journalLine('run-b', 1),
      journalLine('run-a', 1),
      journalLine('run-a', 2),
      JSON.stringify({ jsonrpc: '2.0', method: 'paax.event', params: {} }),
    ]);
    try {
      const events = readJournalEvents(path, 'paax:run:run-a');
      expect(events.map((e) => e.params.sequence)).toEqual([1, 2, 3]);
      expect(events.every((e) => e.params.run_id === 'paax:run:run-a')).toBe(true);

      const rawKeyed = readJournalEvents(path, 'run-a');
      expect(rawKeyed.map((e) => e.params.sequence)).toEqual([1, 2, 3]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('readJournalEvents tidak melempar untuk file hilang / path kosong', () => {
    expect(readJournalEvents('', 'run-a')).toEqual([]);
    expect(readJournalEvents(join(tmpdir(), 'tidak-ada.jsonl'), 'run-a')).toEqual([]);
  });

  it('export JOURNAL_REFRESH_MS dan RUN_ID_PREFIX tersedia', () => {
    expect(JOURNAL_REFRESH_MS).toBeGreaterThan(0);
    expect(RUN_ID_PREFIX).toBe('paax:run:');
  });
});
