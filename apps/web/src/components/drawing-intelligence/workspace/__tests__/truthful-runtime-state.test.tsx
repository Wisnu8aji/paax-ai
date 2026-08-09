// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import React from 'react';

import { WorkspaceProvider, useWorkspace } from '../workspace-store';
import { canDisplayFinalQuantity } from '../quantity-authority';
import { useBackendSync } from '../use-backend-sync';

// ── EXTEND R2 (ORION-F2, MP §10.2) — anti-fake gate G2.3 ────────────────────
// Modul Agent Execution Console (event v2): scan anti-fake, event store,
// replay, task rail, mode view. Semua state dari event nyata — tidak ada
// timer/hardcoded progress.
import { scanRealEvents, assertDemoEvents, assertProductionEvents } from '../agentic/agent-execution-console/scan';
import { buildDemoEvents } from '../agentic/agent-execution-console/demo-events';
import { buildStateFromEvents, PaaxRuntimeStore } from '../agentic/agent-execution-console/event-store';
import { computeAfterSequence, ReplayCoordinator } from '../agentic/agent-execution-console/replay';
import { makeEventEnvelope } from '../agentic/agent-execution-console/event-contract';
import { completedTaskCount } from '../agentic/task-rail/task-rail';
import { buildWorkerTreeV2, subagentCounts } from '../agentic/trace/worker-tree';
import { applyModeToGate, createToolViewState, setToolViewMode } from '../agentic/agent-execution-console/mode-view';
import { PaaxEventClient } from '../agentic/agent-execution-console/ws-client';

const F2_RUN_ID = 'paax:run:test-20260807';

function f2Ev(seq: number, type: string, patch: Record<string, unknown> = {}): ReturnType<typeof makeEventEnvelope> {
  return makeEventEnvelope({
    event_id: `paax:evt:test-20260807:${seq}:${seq.toString(16).padStart(8, '0')}`,
    run_id: F2_RUN_ID,
    sequence: seq,
    timestamp: new Date(Date.UTC(2026, 7, 7, 17, 0, 0, seq * 1000)).toISOString(),
    type,
    ...(patch as any),
  });
}

// Mock API layer to model real HTTP backend states
vi.mock('../../drawing-intelligence-api', () => ({
  fetchReviewQueue: vi.fn(),
  fetchQuantityReadiness: vi.fn(),
  fetchCivilWorkItems: vi.fn(),
  fetchProjectDemSheets: vi.fn(),
  fetchProjectDemRuns: vi.fn(),
  fetchSummaryViews: vi.fn(),
  fetchPackageIntelligence: vi.fn(),
  fetchActiveSheetContext: vi.fn(),
  fetchDrawingPackageIndex: vi.fn(),
  retrieveProjectGraph: vi.fn(),
}));

import * as api from '../../drawing-intelligence-api';

function TestSyncConsumer({ projectId }: { projectId: string | null }) {
  useBackendSync(projectId);
  const { state } = useWorkspace();

  return (
    <div>
      <div data-testid="backend-status">
        {state.backendConnected ? 'connected' : state.backendSyncError || 'loading'}
      </div>
      <div data-testid="sheet-count">{state.sheets.length}</div>
      <div data-testid="mapped-sheet-count">{state.mappedSheets.length}</div>
      <div data-testid="file-count">{state.files.length}</div>
      <div data-testid="quantity-count">{state.quantities.length}</div>
    </div>
  );
}

describe('Phase 09D Truthful Runtime State Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.fetchCivilWorkItems as any).mockResolvedValue(null);
    (api.fetchPackageIntelligence as any).mockResolvedValue(null);
    (api.fetchActiveSheetContext as any).mockResolvedValue(null);
    (api.fetchDrawingPackageIndex as any).mockResolvedValue(null);
    (api.retrieveProjectGraph as any).mockResolvedValue({ query: '', answer: '', nodes: [] });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('1. Initial load displays loading / uninitialized state before backend responds', () => {
    (api.fetchReviewQueue as any).mockReturnValue(new Promise(() => {})); // Never resolves
    (api.fetchQuantityReadiness as any).mockReturnValue(new Promise(() => {}));
    (api.fetchProjectDemSheets as any).mockReturnValue(new Promise(() => {}));
    (api.fetchProjectDemRuns as any).mockReturnValue(new Promise(() => {}));
    (api.fetchSummaryViews as any).mockReturnValue(new Promise(() => {}));

    const { getByTestId } = render(
      <WorkspaceProvider projectId="proj-123">
        <TestSyncConsumer projectId="proj-123" />
      </WorkspaceProvider>
    );

    expect(getByTestId('backend-status').textContent).toBe('loading');
    expect(getByTestId('sheet-count').textContent).toBe('0');
    expect(getByTestId('mapped-sheet-count').textContent).toBe('0');
    expect(getByTestId('file-count').textContent).toBe('0');
  });

  it('2. Missing project/run produces truthful not-ready state without fallback to mock sheets/quantities', async () => {
    (api.fetchReviewQueue as any).mockResolvedValue({ items: [], snapshot_id: null });
    (api.fetchQuantityReadiness as any).mockResolvedValue({ items: [], snapshot_id: null, summary: { total: 0, ready: 0, needs_review: 0 } });
    (api.fetchProjectDemSheets as any).mockResolvedValue([]);
    (api.fetchProjectDemRuns as any).mockResolvedValue([]);
    (api.fetchSummaryViews as any).mockResolvedValue([]);

    const { getByTestId } = render(
      <WorkspaceProvider projectId="proj-empty">
        <TestSyncConsumer projectId="proj-empty" />
      </WorkspaceProvider>
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(getByTestId('backend-status').textContent).toBe('not-ready');
    expect(getByTestId('sheet-count').textContent).toBe('0');
    expect(getByTestId('mapped-sheet-count').textContent).toBe('0');
    expect(getByTestId('file-count').textContent).toBe('0');
    expect(getByTestId('quantity-count').textContent).toBe('0');
  });

  it('3. Backend API rejection produces typed error state without fallback to mock data', async () => {
    (api.fetchReviewQueue as any).mockRejectedValue(new Error('Backend 500 Internal Error'));
    (api.fetchQuantityReadiness as any).mockRejectedValue(new Error('Backend 500 Internal Error'));
    (api.fetchProjectDemSheets as any).mockRejectedValue(new Error('Backend 500 Internal Error'));
    (api.fetchProjectDemRuns as any).mockRejectedValue(new Error('Backend 500 Internal Error'));
    (api.fetchSummaryViews as any).mockRejectedValue(new Error('Backend 500 Internal Error'));

    const { getByTestId } = render(
      <WorkspaceProvider projectId="proj-error">
        <TestSyncConsumer projectId="proj-error" />
      </WorkspaceProvider>
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(getByTestId('backend-status').textContent).toBe('not-ready');
    expect(getByTestId('sheet-count').textContent).toBe('0');
    expect(getByTestId('file-count').textContent).toBe('0');
  });

  it('4. Processing progress state preserves real run status without forcing 100% completion', async () => {
    (api.fetchReviewQueue as any).mockResolvedValue({ items: [], snapshot_id: 'snap-1' });
    (api.fetchQuantityReadiness as any).mockResolvedValue({ items: [], snapshot_id: 'snap-1', summary: { total: 0, ready: 0, needs_review: 0 } });
    (api.fetchProjectDemSheets as any).mockResolvedValue([]);
    (api.fetchProjectDemRuns as any).mockResolvedValue([
      {
        id: 'run-1',
        file_name: 'Struktur_Gedung.pdf',
        status: 'pages_extracting',
        total_pages: 4,
        created_at: '2026-07-30T00:00:00Z',
      },
    ]);
    (api.fetchSummaryViews as any).mockResolvedValue([]);

    const { getByTestId } = render(
      <WorkspaceProvider projectId="proj-processing">
        <TestSyncConsumer projectId="proj-processing" />
      </WorkspaceProvider>
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(getByTestId('backend-status').textContent).toBe('connected');
    expect(getByTestId('file-count').textContent).toBe('1');
    expect(getByTestId('mapped-sheet-count').textContent).toBe('4');
  });

  it('5. Quantity authority strictly gates display: canDisplayFinalQuantity requires sourceAuthority === "core_engine"', () => {
    expect(canDisplayFinalQuantity({ sourceAuthority: 'core_engine' })).toBe(true);
    expect(canDisplayFinalQuantity({ sourceAuthority: 'none' })).toBe(false);
    expect(canDisplayFinalQuantity({ sourceAuthority: 'proposal' })).toBe(false);
    expect(canDisplayFinalQuantity({ sourceAuthority: 'review' })).toBe(false);
    expect(canDisplayFinalQuantity({ sourceAuthority: 'measurement_fact' })).toBe(false);
  });
});

// ── EXTEND R2 (ORION-F2) — anti-fake gate event v2 (G2.3, DoD 10) ───────────

describe('truthful-runtime-state: scan anti-fake event v2 (G2.3)', () => {
  it('menolak marker simulasi di jalur produksi', () => {
    const bad = f2Ev(1, 'task.started', { payload_summary: { simulated: true } });
    const result = scanRealEvents([bad]);
    expect(result.ok).toBe(false);
    expect(result.findings.some(f => f.code === 'SIMULATION_MARKER')).toBe(true);
  });

  it('menolak synthetic:true tanpa label notProduction di jalur produksi', () => {
    const bad = f2Ev(2, 'task.progress', { payload_summary: { synthetic: true, progress: 0.5 } });
    const result = scanRealEvents([bad]);
    expect(result.ok).toBe(false);
  });

  it('menolak synthetic:true meski berlabel notProduction di jalur produksi', () => {
    const bad = f2Ev(3, 'task.progress', { payload_summary: { synthetic: true, notProduction: true, progress: 0.5 } });
    const result = scanRealEvents([bad]);
    expect(result.ok).toBe(false);
    expect(result.findings.some(f => f.code === 'SYNTHETIC_IN_PRODUCTION')).toBe(true);
  });

  it('fixture demo berlabel synthetic+notProduction lolos jalur demo', () => {
    const events = buildDemoEvents();
    expect(() => assertDemoEvents(events)).not.toThrow();
    for (const e of events) {
      expect(e.params.payload_summary?.['synthetic']).toBe(true);
      expect(e.params.payload_summary?.['notProduction']).toBe(true);
    }
  });

  it('fixture demo DITOLAK jalur produksi', () => {
    expect(() => assertProductionEvents(buildDemoEvents())).toThrow(/SYNTHETIC_IN_PRODUCTION/);
  });

  it('event produksi valid lolos scan tanpa marker', () => {
    const okEvents = [
      f2Ev(1, 'run.started', { payload_summary: { run_id: F2_RUN_ID } }),
      f2Ev(2, 'task.started', { task_id: 'T01' }),
      f2Ev(3, 'task.progress', { task_id: 'T01', payload_summary: { progress: 0.4 } }),
      f2Ev(4, 'task.completed', { task_id: 'T01', payload_summary: { progress: 1 } }),
    ];
    const result = scanRealEvents(okEvents);
    expect(result.ok).toBe(true);
    expect(result.total).toBe(4);
  });
});

describe('truthful-runtime-state: state dibangun dari event (no timer/hardcoded)', () => {
  it('task rail menghitung completed hanya dari event task.completed', () => {
    const state = buildStateFromEvents(buildDemoEvents());
    expect(state.tasks.filter(t => t.state === 'completed').map(t => t.id)).toContain('T01');
    expect(completedTaskCount(state.tasks)).toBe(3); // T01, T02, T03
    expect(state.tasks.find(t => t.id === 'T11')?.state).toBe('waiting_approval');
    expect(state.tasks.find(t => t.id === 'T12')?.state).toBe('pending');
    expect(state.tasks.find(t => t.id === 'T12')?.progress).toBe(0);
  });

  it('progress task hanya dari task.progress event', () => {
    const state = buildStateFromEvents(buildDemoEvents());
    expect(state.tasks.find(t => t.id === 'T03')?.progress).toBe(1);
    const onlyStarted = buildStateFromEvents([
      f2Ev(1, 'run.started', {}),
      f2Ev(2, 'task.started', { task_id: 'T05' }),
    ]);
    expect(onlyStarted.tasks.find(t => t.id === 'T05')?.progress).toBe(0);
    expect(onlyStarted.tasks.find(t => t.id === 'T05')?.state).toBe('running');
  });

  it('reasoning block hanya dari reasoning.delta/reasoning.available nyata', () => {
    const state = buildStateFromEvents(buildDemoEvents());
    expect(state.reasoningByTask['T03'] ?? '').toContain('RENCANA KOLOM LANTAI 1');
    expect(state.reasoningByTask['T01'] ?? '').toBe('');
  });

  it('store menahan trace + subagent tree + approval dari event', () => {
    const state = buildStateFromEvents(buildDemoEvents());
    expect(state.trace.filter(t => t.type.startsWith('tool')).length).toBeGreaterThanOrEqual(4);
    const tree = buildWorkerTreeV2(buildDemoEvents() as any);
    expect(subagentCounts(tree).total).toBeGreaterThanOrEqual(1);
    expect(state.approvals.some(a => a.status === 'pending' && a.impact === 'high')).toBe(true);
  });
});

describe('truthful-runtime-state: replay after_sequence (reconnect)', () => {
  it('computeAfterSequence dari event yang diterima', () => {
    expect(computeAfterSequence(buildDemoEvents().slice(0, 5))).toBe(5);
    expect(computeAfterSequence([], 'T01')).toBe(-1);
  });

  it('ReplayCoordinator: disconnect → replay → live dengan dedup', () => {
    const seed = buildDemoEvents().slice(0, 10);
    const coord = new ReplayCoordinator(seed);
    coord.markLive();
    coord.onDisconnect('ws closed');
    expect(coord.getState().disconnected).toBe(true);

    coord.startReplay({ runId: F2_RUN_ID, received: seed });
    expect(coord.getState().phase).toBe('replaying');
    expect(coord.getState().afterSequence).toBe(10);

    coord.applyBatch([...seed.slice(0, 3), ...buildDemoEvents().slice(10, 14)] as any);
    expect(coord.getState().received).toBe(4);

    coord.applyBatch([]);
    expect(coord.getState().phase).toBe('live');
    expect(coord.getState().disconnected).toBe(false);
  });
});

describe('truthful-runtime-state: mode Product/Technical/Evidence (mode-view)', () => {
  it('technical mode ditolak tanpa role owner/auditor', () => {
    const next = setToolViewMode(createToolViewState(), 'technical');
    expect(next.mode).toBe('product');
    expect(next.gate.lastDeniedAt).toBeDefined();
  });

  it('technical mode diizinkan untuk owner', () => {
    const state = { ...createToolViewState(), gate: { ...createToolViewState().gate, currentRole: 'owner' } };
    expect(setToolViewMode(state, 'technical').mode).toBe('technical');
  });

  it('evidence mode bebas tanpa gate', () => {
    const state = createToolViewState();
    expect(setToolViewMode(state, 'evidence').mode).toBe('evidence');
    expect(applyModeToGate(state.gate, 'evidence').mode).toBe('evidence');
  });
});

describe('truthful-runtime-state: PaaxRuntimeStore dedup + ingest', () => {
  it('ingest event yang sama dua kali tidak menggandakan trace', () => {
    const store = new PaaxRuntimeStore();
    const toolEvt = f2Ev(2, 'tool.started', { task_id: 'T01', payload_summary: { tool: 'x' } });
    store.ingest(toolEvt);
    store.ingest(toolEvt);
    expect(store.getState().trace.length).toBe(1);
    expect(store.getState().rawEvents.length).toBe(1);
  });
});

describe('truthful-runtime-state: web_trace live status gate (Acceptance Gate 2)', () => {
  it('web_trace false saat transport none, idle, atau demo', () => {
    const clientNone = new PaaxEventClient({
      runId: 'paax:run:test-webtrace',
      onEvent: () => {},
      onStatus: () => {},
    });
    expect(clientNone.getStatus().web_trace).toBe(false);

    const clientDemo = new PaaxEventClient({
      runId: 'paax:run:demo-webtrace',
      demoEvents: buildDemoEvents(),
      onEvent: () => {},
      onStatus: () => {},
    });
    clientDemo.start();
    expect(clientDemo.getStatus().kind).toBe('demo');
    expect(clientDemo.getStatus().web_trace).toBe(false);
  });

  it('web_trace true saat event live diterima dan divalidasi', () => {
    let statusCaptured: any = null;
    const client = new PaaxEventClient({
      runId: 'paax:run:test-live',
      onEvent: () => {},
      onStatus: (s) => { statusCaptured = s; },
      httpUrl: '/api/paax/events',
    });
    const deliver = (client as any).deliver.bind(client);
    const validLiveEv = f2Ev(1, 'task.started', { task_id: 'T01', payload_summary: { status: 'running' } });

    deliver(validLiveEv);

    expect(statusCaptured).not.toBeNull();
    expect(statusCaptured.web_trace).toBe(true);
    expect(client.getStatus().web_trace).toBe(true);
  });

  it('web_trace false saat frame ditolak scanRealEvents (SCAN_REJECT)', () => {
    let statusCaptured: any = null;
    const client = new PaaxEventClient({
      runId: 'paax:run:test-live-reject',
      onEvent: () => {},
      onStatus: (s) => { statusCaptured = s; },
      httpUrl: '/api/paax/events',
    });
    const deliver = (client as any).deliver.bind(client);
    const syntheticFrame = f2Ev(1, 'task.started', { task_id: 'T01', payload_summary: { synthetic: true, notProduction: true } });

    deliver(syntheticFrame);

    expect(statusCaptured.web_trace).toBe(false);
    expect(statusCaptured.lastError).toMatch(/^SCAN_REJECT:/);
    expect(client.getStatus().web_trace).toBe(false);
  });
});

