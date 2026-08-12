// @vitest-environment node
// paax/web — event-relay-store.ts journal hydration regression tests.
//
// hydrateFromJournal is the recovery path for worker→web relay outages:
// keyed by raw OR paax:run:<id> run ids, dedup by event_id AND sequence,
// silent (no listener notification). refreshFromJournal adds listener
// notification for the SSE refresh path.

import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PaaxEventRelayStore } from './event-relay-store';

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

function writeJournal(lines: string[]): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), 'paax-store-'));
  const path = join(dir, 'agent-events.jsonl');
  writeFileSync(path, lines.join('\n') + '\n');
  return { dir, path };
}

describe('PaaxEventRelayStore journal hydration', () => {
  let store: PaaxEventRelayStore;

  beforeEach(() => {
    store = new PaaxEventRelayStore();
  });

  it('hydrateFromJournal mengembalikan [] tanpa journal path', () => {
    expect(store.hydrateFromJournal('paax:run:run-a')).toEqual([]);
  });

  it('hydrate dari journal dengan key prefixed maupun raw, getEvents konsisten', () => {
    const { dir, path } = writeJournal([journalLine('run-a', 1), journalLine('run-a', 2)]);

    try {
      const added = store.hydrateFromJournal('paax:run:run-a', path);
      expect(added.map((e) => e.params.sequence)).toEqual([1, 2]);
      // Key lain (raw) membaca store yang sama.
      expect(store.getEvents('run-a').map((e) => e.params.sequence)).toEqual([1, 2]);
      expect(store.hasRun('paax:run:run-a')).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('hydrateFromJournal idempotent — panggilan kedua tidak menambah event', () => {
    const { dir, path } = writeJournal([journalLine('run-a', 1)]);

    try {
      expect(store.hydrateFromJournal('run-a', path)).toHaveLength(1);
      expect(store.hydrateFromJournal('run-a', path)).toEqual([]);
      expect(store.hydrateFromJournal('paax:run:run-a', path)).toEqual([]);
      expect(store.getEvents('run-a')).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('dedup by event_id — baris journal duplikat hanya masuk sekali', () => {
    const { dir, path } = writeJournal([journalLine('run-a', 1), journalLine('run-a', 1)]);

    try {
      expect(store.hydrateFromJournal('run-a', path)).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('dedup by sequence — event berbeda dengan sequence sama tidak ditambahkan', () => {
    const { dir, path } = writeJournal([
      journalLine('run-a', 1, '00000001'),
      journalLine('run-a', 1, '00000002'),
      journalLine('run-a', 2, '00000003'),
    ]);

    try {
      const added = store.hydrateFromJournal('run-a', path);
      expect(added).toHaveLength(2);
      expect(added.map((e) => e.params.sequence)).toEqual([1, 2]);
      expect(added.map((e) => e.params.event_id)).toContain('paax:evt:run-a:1:00000001');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('hydrateFromJournal SILENT — tidak menotifikasi subscriber; refreshFromJournal menotifikasi event baru', () => {
    const { dir, path } = writeJournal([journalLine('run-a', 1)]);

    try {
      const seen: number[] = [];
      const unsubscribe = store.subscribe('paax:run:run-a', (ev) => seen.push(ev.params.sequence));

      store.hydrateFromJournal('run-a', path);
      expect(seen).toEqual([]);

      // Tidak ada event baru di journal → refresh tidak menotifikasi apa pun.
      store.refreshFromJournal('run-a', path);
      expect(seen).toEqual([]);

      // Event baru ditulis worker (relay gagal) → refresh menotifikasi subscriber.
      appendFileSync(path, journalLine('run-a', 2) + '\n');
      store.refreshFromJournal('run-a', path);
      expect(seen).toEqual([2]);

      // Baris duplikat (event_id sama) → tidak ada notifikasi ulang.
      appendFileSync(path, journalLine('run-a', 2) + '\n');
      store.refreshFromJournal('run-a', path);
      expect(seen).toEqual([2]);

      unsubscribe();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('hydrateFromJournal hanya mengambil event untuk run yang diminta', () => {
    const { dir, path } = writeJournal([
      journalLine('run-a', 1),
      journalLine('run-b', 1),
      journalLine('run-b', 2),
    ]);

    try {
      store.hydrateFromJournal('paax:run:run-b', path);
      expect(store.getEvents('run-b').map((e) => e.params.sequence)).toEqual([1, 2]);
      expect(store.hasRun('run-a')).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('hydrateFromJournal tidak menggabungkan event synthetic dari journal', () => {
    const { dir, path } = writeJournal([
      journalLine('run-a', 1),
      journalLine('run-a', 2, '00000002', { payload_summary: { synthetic: true } }),
    ]);

    try {
      const added = store.hydrateFromJournal('run-a', path);
      expect(added.map((e) => e.params.sequence)).toEqual([1]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
