'use client';

// paax/web — AgentExecutionConsole (F2 #5, G2.1-G2.4).
//
// Pengganti ProcessingOverlay setelah parity. Konsol menampilkan:
//   - Task rail `Tasks X/12` (state TaskEngine nyata dari event task.*);
//   - Execution trace: reasoning block, tool call/payload/command/result,
//     subagent tree, artifact card, approval card, timeline, status stack;
//   - Mode Product / Technical / Evidence (mode-view.ts);
//   - Transport status jujur (WS/SSE/HTTP-replay/demo/none).
//
// Semua data dari event v2 nyata (event-store.ts). Tidak ada timer/hardcoded
// progress. Anti-fake: fixture demo hanya lewat prop `demoEvents` berlabel.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSyncExternalStore } from 'react';
import { Activity, Wifi, WifiOff, Database, FlaskConical, RefreshCw, ShieldAlert } from 'lucide-react';
import { PaaxRuntimeStore, type PaaxRuntimeState, type TaskUiState, type StatusStackItem, type ApprovalItem } from './event-store';
import { PaaxEventClient, type TransportStatus } from './ws-client';
import { TaskRail } from '../task-rail/task-rail';
import { ReasoningBlock } from '../trace/reasoning-block';
import { ToolTraceRow } from '../trace/tool-trace-row';
import { TraceTimeline } from '../trace/trace-timeline';
import { PaaxArtifactCard } from '../trace/artifact-card';
import { StatusStack } from '../trace/status-stack';
import { buildWorkerTreeV2, subagentCounts, type WorkerNodeLite } from '../trace/worker-tree';
import { ApprovalCard } from '../approval-card/approval-card';
import { EvidencePane, ZoomableImage } from '../evidence-pane/evidence-pane';
import { createToolViewState, setToolViewMode, setToolDisclosure, type ToolViewState, type PaaxTraceMode } from './mode-view';
import type { PaaxEventEnvelope } from './event-contract';

export interface AgentExecutionConsoleProps {
  /** run_id runtime F1 (paax:run:<runid>). Bila kosong → menunggu run. */
  runId?: string | null;
  projectId?: string | null;
  /** transport URL override (default /api/paax/events/ws dst). */
  wsUrl?: string;
  sseUrl?: string;
  httpUrl?: string;
  /** HANYA untuk story/test eksplisit — fixture berlabel synthetic. */
  demoEvents?: PaaxEventEnvelope[];
  /** task id awal yang diseleksi (test/deep-link). */
  initialActiveTaskId?: string;
  userRole?: 'estimator' | 'pm' | 'admin' | 'viewer' | 'owner' | 'auditor';
  /** render sebagai overlay abs (pengganti ProcessingOverlay) atau panel. */
  variant?: 'panel' | 'overlay';
  onClose?: () => void;
}

function transportIcon(status: TransportStatus) {
  if (status.kind === 'demo') return <FlaskConical size={12} />;
  if (status.connected) return <Wifi size={12} />;
  if (status.kind === 'none' || status.kind === 'http-replay') return <Database size={12} />;
  return <WifiOff size={12} />;
}

function transportColor(status: TransportStatus): string {
  if (status.kind === 'demo') return '#a855f7';
  if (status.connected) return 'var(--di-ok, #22c55e)';
  if (status.kind === 'none') return 'var(--di-text3)';
  return '#eab308';
}

export function AgentExecutionConsole({
  runId,
  projectId,
  wsUrl,
  sseUrl,
  httpUrl,
  demoEvents,
  initialActiveTaskId,
  userRole = 'estimator',
  variant = 'panel',
  onClose,
}: AgentExecutionConsoleProps): React.ReactElement {
  const storeRef = useRef<PaaxRuntimeStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = new PaaxRuntimeStore();
  }
  const store = storeRef.current;

  const state = useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.getState(),
  );

  const [transport, setTransport] = useState<TransportStatus>({ kind: 'none', connected: false, detail: 'idle' });
  const [toolView, setToolView] = useState<ToolViewState>(() => createToolViewState());
  const [activeTaskId, setActiveTaskId] = useState<string | null>(initialActiveTaskId ?? null);
  const [selectedEvidenceRef, setSelectedEvidenceRef] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const clientRef = useRef<PaaxEventClient | null>(null);

  // Seed demo events bila diberikan (replay deterministik, bukan timer).
  useEffect(() => {
    if (demoEvents && demoEvents.length > 0) {
      store.rebuild(demoEvents);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoEvents, refreshKey]);

  // Transport live.
  useEffect(() => {
    if (!runId) return;
    const client = new PaaxEventClient({
      runId,
      wsUrl,
      sseUrl,
      httpUrl,
      demoEvents,
      onEvent: (ev) => store.ingest(ev),
      onStatus: (s) => {
        setTransport(s);
        if (s.kind === 'demo') {
          store.setConnection('connected');
        } else if (s.connected) {
          store.setConnection('connected');
        } else if (s.kind === 'none') {
          store.setConnection('idle');
        } else {
          store.setConnection('disconnected');
        }
      },
      onReplayRequest: () => {
        store.setConnection('replaying');
      },
    });
    clientRef.current = client;
    client.start();
    return () => {
      client.stop();
      clientRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, refreshKey]);

  const workers = useMemo(() => buildWorkerTreeV2(state.rawEvents), [state.rawEvents]);
  const counts = useMemo(() => subagentCounts(workers), [workers]);

  const evidenceRefs = useMemo(() => {
    const refs: string[] = [];
    for (const item of state.trace) {
      if (item.type === 'artifact.created' && item.payloadRef) refs.push(item.payloadRef);
    }
    return refs;
  }, [state.trace]);

  const activeReasoning = activeTaskId ? state.reasoningByTask[activeTaskId] : undefined;
  const activeReasoningGlobal = !activeTaskId ? Object.values(state.reasoningByTask).filter(Boolean).join('\n') : undefined;

  const handleSelectTask = (taskId: string) => {
    setActiveTaskId(taskId);
    setToolDisclosure(toolView, `task:${taskId}`, true);
  };

  const handleMode = (mode: PaaxTraceMode) => {
    setToolView(setToolViewMode(toolView, mode));
  };

  const technical = toolView.mode === 'technical';
  const evidence = toolView.mode === 'evidence';

  const canApprove = userRole === 'estimator' || userRole === 'pm' || userRole === 'admin' || userRole === 'owner';

  const handleApproval = (decision: { approvalId: string; decision: 'approved' | 'rejected'; rationale: string }) => {
    // Wire ke gateway bila WS tersedia; bila tidak, status jujur via store.
    const sent = clientRef.current?.sendCommand({
      command: 'approve',
      runId: runId ?? '',
      payload: { approval_id: decision.approvalId, decision: decision.decision, rationale: decision.rationale },
    });
    if (!sent && runId) {
      store.setConnection('disconnected');
    }
  };

  const handleRetry = () => {
    setRefreshKey(k => k + 1);
  };

  const containerStyle: React.CSSProperties =
    variant === 'overlay'
      ? {
          position: 'absolute',
          inset: 0,
          zIndex: 45,
          background: 'rgba(4, 8, 12, 0.82)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }
      : { flex: 1, minWidth: 0, overflow: 'auto', background: 'var(--di-bg)' };

  return (
    <div
      data-testid="agent-execution-console"
      data-variant={variant}
      style={containerStyle}
    >
      <div
        className="di-panel"
        style={{
          width: '100%',
          maxWidth: variant === 'overlay' ? 980 : undefined,
          maxHeight: variant === 'overlay' ? '90vh' : undefined,
          borderRadius: 14,
          border: '1px solid var(--di-border)',
          background: 'var(--di-panel)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <header style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--di-border)' }}>
          <Activity size={16} color="var(--di-accent)" />
          <strong style={{ fontSize: 13 }}>Agent Execution Console</strong>
          <span data-testid="transport-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, padding: '2px 7px', borderRadius: 5, color: transportColor(transport), background: 'var(--di-panel2)', fontWeight: 600 }}>
            {transportIcon(transport)} {transport.kind}
            {transport.kind === 'demo' && ' (synthetic)'}
          </span>
          <span style={{ fontSize: 10, color: 'var(--di-text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>
            {runId ?? 'menunggu run'}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--di-text3)' }}>
            {state.connection} · seq {state.lastSequence}
            {state.replayed && ' · replayed'}
          </span>
          <button type="button" onClick={handleRetry} title="reconnect/replay" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, padding: '3px 8px', borderRadius: 5, cursor: 'pointer' }}>
            <RefreshCw size={11} /> replay
          </button>
          {variant === 'overlay' && onClose && (
            <button type="button" onClick={onClose} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 5, cursor: 'pointer' }}>tutup</button>
          )}
        </header>

        {/* Mode tabs */}
        <div style={{ display: 'flex', gap: 4, padding: '6px 14px', borderBottom: '1px solid var(--di-border)' }}>
          {(['product', 'technical', 'evidence'] as PaaxTraceMode[]).map(mode => (
            <button
              key={mode}
              type="button"
              data-testid={`mode-${mode}`}
              onClick={() => handleMode(mode)}
              style={{
                fontSize: 11,
                padding: '4px 12px',
                borderRadius: 6,
                border: `1px solid ${toolView.mode === mode ? 'var(--di-action, #3b82f6)' : 'var(--di-border)'}`,
                background: toolView.mode === mode ? 'rgba(59, 130, 246, 0.1)' : 'var(--di-panel2)',
                color: 'var(--di-text2)',
                cursor: 'pointer',
                fontWeight: toolView.mode === mode ? 700 : 400,
              }}
            >
              {mode}
            </button>
          ))}
          {toolView.gate.lastDeniedAt && (
            <span data-testid="mode-denied" style={{ fontSize: 10, color: 'var(--di-danger, #ef4444)', marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <ShieldAlert size={11} /> Technical mode perlu role owner/auditor
            </span>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'auto' }}>
          {/* Task rail */}
          <div style={{ padding: 12, borderRight: '1px solid var(--di-border)', overflow: 'auto', flexShrink: 0 }}>
            <TaskRail tasks={state.tasks} activeTaskId={activeTaskId} onSelectTask={handleSelectTask} />
          </div>

          {/* Main trace column */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10, padding: 12, overflow: 'auto' }}>
            {/* Status stack + subagent summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(200px,0.6fr)', gap: 10 }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--di-text3)', marginBottom: 4, fontWeight: 700 }}>STATUS STACK</div>
                <StatusStack items={state.statusStack} />
              </div>
              <div data-testid="subagent-summary" style={{ fontSize: 10.5, color: 'var(--di-text3)', alignSelf: 'start', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--di-border)', background: 'var(--di-panel2)' }}>
                subagents: {counts.total} · running {counts.running} · completed {counts.completed} · failed {counts.failed}
              </div>
            </div>

            {/* Reasoning block (HANYA reasoning nyata) */}
            {(activeReasoning ?? activeReasoningGlobal) && (
              <div>
                <div style={{ fontSize: 10, color: 'var(--di-text3)', marginBottom: 4, fontWeight: 700 }}>REASONING {activeTaskId ? `· ${activeTaskId}` : ''}</div>
                <ReasoningBlock
                  content={activeReasoning ?? activeReasoningGlobal}
                  model={state.trace.find(t => t.taskId === activeTaskId)?.model}
                  provider={state.trace.find(t => t.taskId === activeTaskId)?.provider}
                />
              </div>
            )}

            {/* Approvals */}
            {state.approvals.filter(a => a.status === 'pending').length > 0 && (
              <div>
                <div style={{ fontSize: 10, color: 'var(--di-text3)', marginBottom: 4, fontWeight: 700 }}>APPROVAL</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {state.approvals.filter(a => a.status === 'pending').map(a => (
                    <ApprovalCard key={a.approvalId} card={a} onRespond={handleApproval} canApprove={canApprove} />
                  ))}
                </div>
              </div>
            )}

            {/* Tool/command trace rows */}
            <div>
              <div style={{ fontSize: 10, color: 'var(--di-text3)', marginBottom: 4, fontWeight: 700 }}>TOOL / COMMAND TRACE</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {state.trace.filter(t => t.type.startsWith('tool') || t.type.startsWith('command')).slice(-40).map(item => (
                  <ToolTraceRow key={item.eventId} item={item} technical={technical} />
                ))}
                {state.trace.filter(t => t.type.startsWith('tool') || t.type.startsWith('command')).length === 0 && (
                  <div style={{ fontSize: 10.5, color: 'var(--di-text3)' }}>Belum ada tool call dari runtime.</div>
                )}
              </div>
            </div>

            {/* Artifacts */}
            {evidenceRefs.length > 0 && (
              <div>
                <div style={{ fontSize: 10, color: 'var(--di-text3)', marginBottom: 4, fontWeight: 700 }}>ARTIFACTS</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6 }}>
                  {state.trace.filter(t => t.type === 'artifact.created').slice(-12).map(item => (
                    <PaaxArtifactCard
                      key={item.eventId}
                      artifactId={(item.summary?.['artifact_id'] as string) ?? item.eventId}
                      kind={(item.summary?.['kind'] as string) ?? 'artifact'}
                      payloadRef={item.payloadRef}
                      summary={item.summary}
                      onOpen={evidence ? (ref) => setSelectedEvidenceRef(ref) : undefined}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Timeline (transcript window) */}
            <div>
              <div style={{ fontSize: 10, color: 'var(--di-text3)', marginBottom: 4, fontWeight: 700 }}>TIMELINE</div>
              <TraceTimeline items={state.trace} limit={technical ? 300 : 100} />
            </div>
          </div>

          {/* Evidence pane */}
          {evidence && (
            <div style={{ padding: 12, borderLeft: '1px solid var(--di-border)', overflow: 'auto', flexShrink: 0 }}>
              <EvidencePane selectedRef={selectedEvidenceRef} onSelectRef={setSelectedEvidenceRef} refs={evidenceRefs} />
              {selectedEvidenceRef && (
                <div style={{ marginTop: 8 }}>
                  <ZoomableImage src={selectedEvidenceRef} alt="artifact" caption={selectedEvidenceRef} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer: honest transport detail */}
        <footer style={{ padding: '6px 14px', borderTop: '1px solid var(--di-border)', fontSize: 9.5, color: 'var(--di-text3)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>{transport.detail}</span>
          {transport.kind === 'demo' && (
            <span data-testid="demo-label" style={{ color: '#a855f7', fontWeight: 700 }}>
              synthetic:true · notProduction:true — jalur demo TEST, bukan produksi
            </span>
          )}
          {transport.kind === 'none' && (
            <span data-testid="transport-none-label" style={{ color: '#eab308' }}>
              Menunggu gateway relay event v2 F1 (WS/SSE). Status integrasi jujur: belum live.
            </span>
          )}
          {projectId && <span style={{ marginLeft: 'auto' }}>project: {projectId}</span>}
        </footer>
      </div>
    </div>
  );
}

// Re-export untuk test.
export type { PaaxRuntimeState, TaskUiState, StatusStackItem, ApprovalItem, WorkerNodeLite };
