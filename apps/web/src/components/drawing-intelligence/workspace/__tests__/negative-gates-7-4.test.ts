// paax/web — §7.4 Negative Gate Tests (ORION-F2 Wave 1).
//
// Tes isolasi: hanya import dari event-store, scan, demo-events, event-contract.
// TIDAK mengimport workspace-store (untuk menghindari @paax/schemas dep gap).
// Semua tes murni deterministik — tidak butuh React DOM atau timer.

import { describe, it, expect } from 'vitest';
import { PaaxRuntimeStore, buildStateFromEvents } from '../agentic/agent-execution-console/event-store';
import { scanRealEvents, assertDemoEvents, assertProductionEvents } from '../agentic/agent-execution-console/scan';
import { buildDemoEvents } from '../agentic/agent-execution-console/demo-events';
import { makeEventEnvelope } from '../agentic/agent-execution-console/event-contract';

const F2_RUN_ID = 'paax:run:test-20260807';

function f2Ev(seq: number, type: string, patch: Record<string, unknown> = {}) {
  return makeEventEnvelope({
    event_id: `paax:evt:test-20260807:${seq}:${seq.toString(16).padStart(8, '0')}`,
    run_id: F2_RUN_ID,
    sequence: seq,
    timestamp: new Date(Date.UTC(2026, 7, 7, 17, 0, 0, seq * 1000)).toISOString(),
    type,
    ...(patch as Parameters<typeof makeEventEnvelope>[0]),
  });
}

// ── §7.4 Gate 1: run switch tidak campur rawEvents ────────────────────────────

describe('§7.4 gate: run switch tidak campur rawEvents', () => {
  it('resetRun() membersihkan rawEvents, tasks, trace, dan mereset connection ke idle', () => {
    const store = new PaaxRuntimeStore();
    store.ingest(f2Ev(1, 'run.started', { payload_summary: {} }));
    store.ingest(f2Ev(2, 'task.started', { task_id: 'T01' }));
    expect(store.getState().rawEvents.length).toBe(2);
    expect(store.getState().tasks.find(t => t.id === 'T01')?.state).toBe('running');

    store.resetRun();
    const s = store.getState();
    expect(s.rawEvents.length).toBe(0);
    expect(s.trace.length).toBe(0);
    expect(s.tasks.every(t => t.state === 'pending')).toBe(true);
    expect(s.completedTaskCount).toBe(0);
    expect(s.connection).toBe('idle');
    expect(s.runId).toBeNull();
  });

  it('setelah resetRun(), event run B tidak mengandung data run A', () => {
    const store = new PaaxRuntimeStore();
    store.ingest(f2Ev(1, 'task.started', { task_id: 'T01', payload_summary: { run: 'A' } }));
    store.resetRun();

    const evB = makeEventEnvelope({
      event_id: 'paax:evt:run-b:1:0000001b',
      run_id: 'paax:run:run-b',
      sequence: 1,
      timestamp: new Date().toISOString(),
      type: 'task.started',
      task_id: 'T02',
    });
    store.ingest(evB);

    const s = store.getState();
    expect(s.rawEvents.length).toBe(1);
    expect(s.rawEvents[0]!.params.run_id).toBe('paax:run:run-b');
    expect(s.rawEvents.some(e => e.params.run_id === F2_RUN_ID)).toBe(false);
  });
});

// ── §7.4 Gate 2: demo events ditolak jalur produksi ──────────────────────────

describe('§7.4 gate: demo events tidak masuk production store path', () => {
  it('buildDemoEvents() lolos assertDemoEvents (jalur demo OK)', () => {
    expect(() => assertDemoEvents(buildDemoEvents())).not.toThrow();
  });

  it('buildDemoEvents() DITOLAK assertProductionEvents (jalur produksi OK)', () => {
    expect(() => assertProductionEvents(buildDemoEvents())).toThrow(/SYNTHETIC_IN_PRODUCTION/);
  });

  it('scanRealEvents menolak SEMUA demo events di jalur produksi', () => {
    const demoEvs = buildDemoEvents();
    const result = scanRealEvents(demoEvs);
    expect(result.ok).toBe(false);
    const syntheticFindings = result.findings.filter(f =>
      f.code === 'SYNTHETIC_IN_PRODUCTION' || f.code === 'SIMULATION_MARKER',
    );
    // Setiap demo event punya setidaknya satu finding
    expect(syntheticFindings.length).toBeGreaterThanOrEqual(demoEvs.length);
  });

  it('event synthetic:true tanpa notProduction ditolak di produksi (SIMULATION_MARKER)', () => {
    const bad = f2Ev(5, 'task.started', {
      task_id: 'T01',
      payload_summary: { synthetic: true },
    });
    const result = scanRealEvents([bad]);
    expect(result.ok).toBe(false);
    expect(result.findings.some(f => f.code === 'SIMULATION_MARKER')).toBe(true);
  });

  it('event produksi bersih lolos scan tanpa findings', () => {
    const ok = [
      f2Ev(1, 'run.started', { payload_summary: { run_id: F2_RUN_ID } }),
      f2Ev(2, 'task.started', { task_id: 'T01' }),
      f2Ev(3, 'task.completed', { task_id: 'T01', payload_summary: { progress: 1 } }),
    ];
    expect(scanRealEvents(ok).ok).toBe(true);
  });
});

// ── §7.4 Gate 3: task completion hanya dari event (no timer) ─────────────────

describe('§7.4 gate: task completion hanya dari event task.completed (no timer)', () => {
  it('completedTaskCount tidak berubah setelah task.started atau task.progress', () => {
    const store = new PaaxRuntimeStore();
    store.ingest(f2Ev(1, 'run.started', {}));
    store.ingest(f2Ev(2, 'task.started', { task_id: 'T01' }));
    expect(store.getState().completedTaskCount).toBe(0);
    store.ingest(f2Ev(3, 'task.progress', { task_id: 'T01', payload_summary: { progress: 0.9 } }));
    expect(store.getState().completedTaskCount).toBe(0);
    // Task masih running, progress 0.9, tapi count tetap 0 karena belum task.completed
    expect(store.getState().tasks.find(t => t.id === 'T01')?.state).toBe('running');
    expect(store.getState().tasks.find(t => t.id === 'T01')?.progress).toBe(0.9);
  });

  it('completedTaskCount naik 1 setelah task.completed dari event', () => {
    const store = new PaaxRuntimeStore();
    store.ingest(f2Ev(1, 'task.started', { task_id: 'T01' }));
    store.ingest(f2Ev(2, 'task.completed', { task_id: 'T01', payload_summary: { progress: 1 } }));
    expect(store.getState().completedTaskCount).toBe(1);
    expect(store.getState().tasks.find(t => t.id === 'T01')?.state).toBe('completed');
  });

  it('dedup: task.completed dua kali tidak double-count completedTaskCount', () => {
    const store = new PaaxRuntimeStore();
    const completedEv = f2Ev(2, 'task.completed', { task_id: 'T01', payload_summary: { progress: 1 } });
    store.ingest(f2Ev(1, 'task.started', { task_id: 'T01' }));
    store.ingest(completedEv);
    store.ingest(completedEv); // dedup by event_id
    expect(store.getState().completedTaskCount).toBe(1);
  });

  it('buildStateFromEvents: T12 tetap pending (no fake progress) setelah demo events', () => {
    const state = buildStateFromEvents(buildDemoEvents());
    const t12 = state.tasks.find(t => t.id === 'T12');
    expect(t12?.state).toBe('pending');
    expect(t12?.progress).toBe(0);
  });
});

// ── §7.4 Gate 4: disconnected state jujur (tidak pernah fake connected) ───────

describe('§7.4 gate: disconnected state jujur', () => {
  it('store awal selalu idle (bukan connected)', () => {
    const store = new PaaxRuntimeStore();
    expect(store.getState().connection).toBe('idle');
  });

  it('connection ke connected hanya setelah ingest event atau setConnection eksplisit', () => {
    const store = new PaaxRuntimeStore();
    store.ingest(f2Ev(1, 'run.started', {}));
    // reduceEvent menetapkan connection='connected' bila tidak 'failed'
    expect(store.getState().connection).toBe('connected');
  });

  it('resetRun() mengembalikan connection ke idle — bukan mempertahankan connected', () => {
    const store = new PaaxRuntimeStore();
    store.ingest(f2Ev(1, 'run.started', {}));
    expect(store.getState().connection).toBe('connected');
    store.resetRun();
    expect(store.getState().connection).toBe('idle');
  });

  it('setConnection disconnected tidak bisa berubah sendiri tanpa event/call eksplisit', () => {
    const store = new PaaxRuntimeStore();
    store.setConnection('disconnected');
    expect(store.getState().connection).toBe('disconnected');
    // Verify tidak ada auto-recovery tanpa event nyata
    // (tidak ada timer/setInterval di store)
    expect(store.getState().connection).toBe('disconnected');
  });
});

// ── §7.4 Gate 5: event_id dedup di store ────────────────────────────────────

describe('§7.4 gate: event_id dedup mencegah replay ganda', () => {
  it('ingest event yang sama (sama event_id) dua kali: rawEvents.length tetap 1', () => {
    const store = new PaaxRuntimeStore();
    const ev = f2Ev(1, 'tool.started', { task_id: 'T01', payload_summary: { tool: 'x' } });
    store.ingest(ev);
    store.ingest(ev);
    expect(store.getState().rawEvents.length).toBe(1);
    expect(store.getState().trace.length).toBe(1);
  });
});
