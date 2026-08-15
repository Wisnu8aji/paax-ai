'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, Link2, Loader2, RefreshCw, Terminal, ListTodo, Activity } from 'lucide-react';
import { AgentExecutionConsole } from '@/components/drawing-intelligence/workspace/agentic/agent-execution-console';
import { fetchProjectDemRuns, type DemRunResponse } from '@/components/drawing-intelligence/drawing-intelligence-api';

export interface CommandRoomWorkSurfaceProps {
  projectId: string | null;
  projectName: string;
  initialRunId?: string | null;
  onOpenDrawing: () => void;
}
const ACTIVE_RUN_STATUSES = new Set([
  'created',
  'pages_queued',
  'pages_extracting',
  'processing',
  'uploading',
  'dem_complete',
  'partially_failed',
  'synthesis_in_progress',
  'synthesis_complete',
  'completed',
]);

function latestRun(runs: DemRunResponse[]): DemRunResponse | null {
  return runs
    .filter((run) => ACTIVE_RUN_STATUSES.has(run.status))
    .slice()
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0] ?? null;
}

export function CommandRoomWorkSurface({
  projectId,
  projectName,
  initialRunId = null,
  onOpenDrawing,
}: CommandRoomWorkSurfaceProps) {
  const [runId, setRunId] = useState(initialRunId?.trim() || null);
  const [runDraft, setRunDraft] = useState(initialRunId?.trim() || '');
  const [loadingRun, setLoadingRun] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  useEffect(() => {
    const next = initialRunId?.trim() || null;
    setRunId(next);
    setRunDraft(next ?? '');
  }, [initialRunId]);

  useEffect(() => {
    if (runId || !projectId) return;
    let cancelled = false;
    setLoadingRun(true);
    setRunError(null);
    void fetchProjectDemRuns(projectId)
      .then((runs) => {
        if (cancelled) return;
        const selected = latestRun(runs);
        if (selected) {
          setRunId(selected.id);
          setRunDraft(selected.id);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) setRunError(error instanceof Error ? error.message : 'Run tidak dapat dimuat.');
      })
      .finally(() => {
        if (!cancelled) setLoadingRun(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, runId]);

  function connectRun() {
    const next = runDraft.trim();
    if (!next) return;
    setRunError(null);
    setRunId(next);
  }

  function disconnectRun() {
    setRunId(null);
    setRunDraft('');
  }

  return (
    <section
      data-testid="command-room-work-surface"
      aria-label="Work execution surface"
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--cr-bg)',
      }}
    >
      <header
        style={{
          minHeight: 58,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 18px',
          borderBottom: '1px solid var(--cr-border)',
          background: 'color-mix(in srgb, var(--cr-bg) 94%, transparent)',
        }}
      >
        <Activity size={16} color="var(--cr-orange)" />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--cr-text)' }}>Work</div>
          <div style={{ fontSize: 11, color: 'var(--cr-text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {projectName} · execution surface
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
          <label htmlFor="command-room-work-run-id" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
            Run ID
          </label>
          <input
            id="command-room-work-run-id"
            aria-label="Run ID"
            value={runDraft}
            onChange={(event) => setRunDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') connectRun(); }}
            placeholder="run id"
            spellCheck={false}
            style={{ width: 190, minWidth: 0, height: 30, border: '1px solid var(--cr-border)', borderRadius: 7, background: 'var(--cr-panel2)', color: 'var(--cr-text)', padding: '0 8px', fontFamily: 'var(--font-jetbrains), monospace', fontSize: 11 }}
          />
          {runId ? (
            <button type="button" className="pax-cr-hover" onClick={disconnectRun} style={{ height: 30, padding: '0 9px', border: '1px solid var(--cr-border)', borderRadius: 7, background: 'transparent', color: 'var(--cr-text2)', cursor: 'pointer' }}>
              Disconnect
            </button>
          ) : (
            <button type="button" className="pax-cr-hover" aria-label="Connect run" onClick={connectRun} disabled={!runDraft.trim()} style={{ height: 30, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0 9px', border: '1px solid var(--cr-border)', borderRadius: 7, background: runDraft.trim() ? 'var(--cr-elev)' : 'transparent', color: runDraft.trim() ? 'var(--cr-text)' : 'var(--cr-text3)', cursor: runDraft.trim() ? 'pointer' : 'not-allowed' }}>
              <Link2 size={12} /> Connect
            </button>
          )}
        </div>
      </header>

      {runError && (
        <div role="alert" style={{ margin: '10px 14px 0', padding: '8px 10px', border: '1px solid rgba(242,107,56,0.35)', borderRadius: 7, background: 'var(--cr-orange-soft)', color: 'var(--cr-text2)', fontSize: 12 }}>
          {runError}
        </div>
      )}

      {runId ? (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
          <AgentExecutionConsole runId={runId} projectId={projectId} userRole="estimator" variant="panel" />
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 28 }}>
          <div style={{ width: 'min(100%, 680px)', border: '1px solid var(--cr-border)', borderRadius: 14, background: 'var(--cr-panel)', padding: '28px 30px', boxShadow: '0 20px 60px rgba(0,0,0,0.22)' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: 'var(--cr-orange)', marginBottom: 14 }}>
              <Terminal size={18} />
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Execution workspace</span>
            </div>
            <h2 style={{ margin: 0, color: 'var(--cr-text)', fontSize: 24, fontWeight: 650, letterSpacing: '-0.025em' }}>Work surface siap</h2>
            <p style={{ margin: '9px 0 22px', color: 'var(--cr-text2)', fontSize: 13, lineHeight: 1.6 }}>
              Sambungkan run gambar kerja untuk membuka urutan task, thinking nyata, terminal trace, payload, event ledger, dan status transport secara live.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginBottom: 22 }}>
              {[
                { icon: <ListTodo size={14} />, label: 'Task focus' },
                { icon: <Terminal size={14} />, label: 'Terminal trace' },
                { icon: <RefreshCw size={14} />, label: 'SSE / replay' },
              ].map((item) => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 7, minHeight: 42, padding: '0 10px', border: '1px solid var(--cr-border)', borderRadius: 8, color: 'var(--cr-text2)', fontSize: 11.5 }}>
                  <span style={{ display: 'flex', color: 'var(--cr-orange)' }}>{item.icon}</span>
                  {item.label}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" className="pax-cr-hover pax-press" onClick={onOpenDrawing} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 34, padding: '0 12px', border: '1px solid var(--cr-border)', borderRadius: 8, background: 'var(--cr-elev)', color: 'var(--cr-text)', cursor: 'pointer' }}>
                Open Drawing Intelligence <ExternalLink size={13} />
              </button>
              {loadingRun && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--cr-text3)', fontSize: 11.5 }}><Loader2 size={13} className="animate-spin" /> searching latest run</span>}
              {!loadingRun && projectId && <span style={{ color: 'var(--cr-text3)', fontSize: 11.5 }}>No active run selected.</span>}
              {!projectId && <span style={{ color: 'var(--cr-text3)', fontSize: 11.5 }}>Select a project or paste a run ID.</span>}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
