'use client';

import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Clock3, PauseCircle, PlayCircle, RefreshCw, Wrench, ShieldAlert, RotateCcw } from 'lucide-react';
import { useWorkspace } from '../workspace-store';
import { normalizeStatusMessage } from '../status-bar';

export type AgentRun = {
  runId: string;
  status: string;
  version: number;
  updatedAt: string;
  goalSpec: { request: string; riskTier: string; binding: { projectId: string } };
  plan: { tasks: Array<{ id: string; title: string; capability: string }> };
  completedTaskIds: string[];
  pendingApprovalIds: string[];
  failure?: string;
  budget?: { maxToolCalls: number; maxTokens: number; maxCostUsd: number; maxDurationMs: number };
  budgetUsage?: { toolCalls: number; tokens: number; costUsd: number; startedAtMs: number };
  auditTimeline?: Array<{ eventId: string; type: string; message: string; createdAt: string }>;
  invocations?: Array<{
    invocationId: string;
    toolName: string;
    status: string;
    idempotencyKey?: string;
    error?: string;
    output?: unknown;
  }>;
  actionRecords?: Array<{
    actionId: string;
    idempotencyKey: string;
    riskTier: string;
    approvalId?: string;
    status: string;
    createdAt: string;
  }>;
};

type MissionActionState = 'idle' | 'loading' | 'ready' | 'error' | 'manual';

export interface MissionControlProps {
  userRole?: 'estimator' | 'pm' | 'admin' | 'viewer';
}

function safeString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return fallback;
  try {
    const str = String(value);
    return str !== '[object Object]' ? str : fallback;
  } catch {
    return fallback;
  }
}

function normalizeError(err: unknown): string {
  if (typeof err === 'string' && err.trim()) return err;
  if (err && typeof err === 'object') {
    if ('error' in err && typeof (err as any).error === 'string' && (err as any).error.trim()) {
      return (err as any).error;
    }
    if ('message' in err && typeof (err as any).message === 'string' && (err as any).message.trim()) {
      return (err as any).message;
    }
    if ('detail' in err && typeof (err as any).detail === 'string' && (err as any).detail.trim()) {
      return (err as any).detail;
    }
  }
  if (err === null || err === undefined) return 'Mission operation failed';
  try {
    const str = String(err);
    return str !== '[object Object]' ? str : 'Mission operation failed';
  } catch {
    return 'Mission operation failed';
  }
}

function normalizeRun(raw: any): AgentRun {
  const statusStr = safeString(raw?.status, 'unknown');
  const runId = safeString(raw?.runId, 'unknown-run');
  const version = typeof raw?.version === 'number' ? raw.version : 1;
  const updatedAt = safeString(raw?.updatedAt, new Date().toISOString());

  const goalRequest = safeString(raw?.goalSpec?.request, 'No goal specified');
  const riskTier = safeString(raw?.goalSpec?.riskTier, 'high');
  const bindingProjectId = safeString(raw?.goalSpec?.binding?.projectId, '');

  const tasks = Array.isArray(raw?.plan?.tasks)
    ? raw.plan.tasks.map((t: any) => ({
        id: safeString(t?.id, 'unknown-task'),
        title: safeString(t?.title, 'Untitled Task'),
        capability: safeString(t?.capability, 'general'),
      }))
    : [];

  const completedTaskIds = Array.isArray(raw?.completedTaskIds)
    ? raw.completedTaskIds.map((id: any) => safeString(id))
    : [];

  const pendingApprovalIds = Array.isArray(raw?.pendingApprovalIds)
    ? raw.pendingApprovalIds.map((id: any) => safeString(id))
    : [];

  const failure = raw?.failure !== undefined && raw?.failure !== null ? safeString(raw.failure) : undefined;

  return {
    runId,
    status: statusStr,
    version,
    updatedAt,
    goalSpec: {
      request: goalRequest,
      riskTier,
      binding: { projectId: bindingProjectId },
    },
    plan: { tasks },
    completedTaskIds,
    pendingApprovalIds,
    failure,
    budget: raw?.budget,
    budgetUsage: raw?.budgetUsage,
    auditTimeline: Array.isArray(raw?.auditTimeline) ? raw.auditTimeline : [],
    invocations: Array.isArray(raw?.invocations) ? raw.invocations : [],
    actionRecords: Array.isArray(raw?.actionRecords) ? raw.actionRecords : [],
  };
}

function statusIcon(status: string) {
  const s = safeString(status).toLowerCase();
  if (s === 'completed') return <CheckCircle2 size={15} />;
  if (s === 'paused' || s === 'waiting_approval') return <PauseCircle size={15} />;
  if (s === 'failed' || s === 'blocked') return <AlertTriangle size={15} />;
  if (s === 'running') return <PlayCircle size={15} />;
  return <Clock3 size={15} />;
}

export function MissionControl({ userRole = 'estimator' }: MissionControlProps) {
  const { state, dispatch } = useWorkspace();
  const projectId = state.projectId;
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [actionState, setActionState] = useState<MissionActionState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [goal, setGoal] = useState('Audit data kolom Lantai 2, hitung quantity terverifikasi, dan laporkan konflik.');
  const [manualNote, setManualNote] = useState('');
  const [approvalNote, setApprovalNote] = useState('');

  const isMounted = useRef(true);
  const inFlightRef = useRef(false);
  const lastFailedOpRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const performFetchRuns = useCallback(async (projId: string) => {
    setActionState('loading');
    setErrorMessage(null);
    dispatch({ type: 'set-status', message: 'Fetching agent mission runs…' });

    try {
      const response = await fetch(`/api/agent-runs?projectId=${encodeURIComponent(projId)}`, { cache: 'no-store' });
      if (!response.ok) {
        const errorJson = await response.json().catch(() => ({}));
        throw new Error(safeString(errorJson.error || errorJson.detail || `HTTP ${response.status}`, `HTTP ${response.status}`));
      }
      const rawData = await response.json();
      if (!Array.isArray(rawData)) {
        throw new Error('Malformed backend response: expected array of agent runs');
      }
      const normalizedRuns = rawData.map(normalizeRun);
      if (!isMounted.current) return;
      setRuns(normalizedRuns);
      setActionState('ready');
      dispatch({ type: 'set-status', message: `Mission Control ready — ${normalizedRuns.length} agent runs loaded` });
    } catch (e) {
      if (!isMounted.current) return;
      const normalizedMsg = normalizeError(e);
      setErrorMessage(normalizedMsg);
      setActionState('error');
      dispatch({ type: 'set-status', message: normalizeStatusMessage(`Mission operation failed: ${normalizedMsg}`) });
    }
  }, [dispatch]);

  const fetchRuns = useCallback(async (projId: string) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    lastFailedOpRef.current = () => fetchRuns(projId);
    try {
      await performFetchRuns(projId);
    } finally {
      inFlightRef.current = false;
    }
  }, [performFetchRuns]);

  useEffect(() => {
    if (!projectId) return;
    void fetchRuns(projectId);
  }, [projectId, fetchRuns]);

  const handleRefresh = useCallback(() => {
    if (!projectId || actionState === 'loading' || inFlightRef.current) return;
    void fetchRuns(projectId);
  }, [projectId, actionState, fetchRuns]);

  const executeCreateRun = useCallback(async (projId: string, goalText: string) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    lastFailedOpRef.current = () => executeCreateRun(projId, goalText);

    setActionState('loading');
    setErrorMessage(null);
    dispatch({ type: 'set-status', message: 'Creating engineering mission plan…' });

    try {
      const response = await fetch('/api/agent-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: projId, goal: goalText, riskTier: 'high', deliverables: ['engineering audit', 'evidence register'] }),
      });
      if (!response.ok) {
        const errorJson = await response.json().catch(() => ({}));
        throw new Error(safeString(errorJson.error || errorJson.detail || `HTTP ${response.status}`, `HTTP ${response.status}`));
      }
      lastFailedOpRef.current = () => fetchRuns(projId);
      await performFetchRuns(projId);
    } catch (e) {
      if (!isMounted.current) return;
      const normalizedMsg = normalizeError(e);
      setErrorMessage(normalizedMsg);
      setActionState('error');
      dispatch({ type: 'set-status', message: normalizeStatusMessage(`Mission operation failed: ${normalizedMsg}`) });
    } finally {
      inFlightRef.current = false;
    }
  }, [dispatch, performFetchRuns, fetchRuns]);

  const createRun = useCallback(async () => {
    if (!projectId || !goal.trim() || actionState === 'loading' || inFlightRef.current) return;
    await executeCreateRun(projectId, goal);
  }, [projectId, goal, actionState, executeCreateRun]);

  const executeTransition = useCallback(async (projId: string, targetRun: AgentRun, targetStatus: string) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    lastFailedOpRef.current = () => executeTransition(projId, targetRun, targetStatus);

    setActionState('loading');
    setErrorMessage(null);
    dispatch({ type: 'set-status', message: `Transitioning mission state to ${targetStatus}…` });

    try {
      const response = await fetch(`/api/agent-runs/${encodeURIComponent(targetRun.runId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'transition', projectId: projId, status: safeString(targetStatus), expectedVersion: targetRun.version }),
      });
      if (!response.ok) {
        const errorJson = await response.json().catch(() => ({}));
        throw new Error(safeString(errorJson.error || errorJson.detail || `HTTP ${response.status}`, `HTTP ${response.status}`));
      }
      lastFailedOpRef.current = () => fetchRuns(projId);
      await performFetchRuns(projId);
    } catch (e) {
      if (!isMounted.current) return;
      const normalizedMsg = normalizeError(e);
      setErrorMessage(normalizedMsg);
      setActionState('error');
      dispatch({ type: 'set-status', message: normalizeStatusMessage(`Mission operation failed: ${normalizedMsg}`) });
    } finally {
      inFlightRef.current = false;
    }
  }, [dispatch, performFetchRuns, fetchRuns]);

  const transition = useCallback(async (run: AgentRun, status: string) => {
    if (!projectId || actionState === 'loading' || inFlightRef.current) return;
    await executeTransition(projectId, run, status);
  }, [projectId, actionState, executeTransition]);

  const executeNextStep = useCallback(async (run: AgentRun, approvalToken?: any) => {
    if (!projectId || actionState === 'loading' || inFlightRef.current) return;
    inFlightRef.current = true;
    const operation = async () => {
      const response = await fetch(`/api/agent-runs/${encodeURIComponent(run.runId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'step',
          projectId,
          expectedVersion: run.version,
          idempotencyKey: `${run.runId}:${run.version}`,
          approvalToken,
        }),
      });
      if (!response.ok) {
        const errorJson = await response.json().catch(() => ({}));
        throw new Error(safeString(errorJson.error || errorJson.detail || `HTTP ${response.status}`, `HTTP ${response.status}`));
      }
      await performFetchRuns(projectId);
    };
    lastFailedOpRef.current = operation;
    setActionState('loading');
    setErrorMessage(null);
    dispatch({ type: 'set-status', message: 'Executing next governed mission step…' });
    try { await operation(); }
    catch (error) {
      const message = normalizeError(error);
      setErrorMessage(message); setActionState('error');
      dispatch({ type: 'set-status', message: normalizeStatusMessage(`Mission operation failed: ${message}`) });
    } finally { inFlightRef.current = false; }
  }, [projectId, actionState, dispatch, performFetchRuns]);

  const submitApproval = useCallback(async (run: AgentRun) => {
    if (!projectId || userRole === 'viewer') return;
    const approvalToken = {
      tokenId: `appr-${Date.now()}`,
      projectId,
      toolName: 'core_engine.calculate_measurement_facts',
      approvedBy: userRole,
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    };
    await executeNextStep(run, approvalToken);
  }, [projectId, userRole, executeNextStep]);

  const handleRetry = useCallback(() => {
    if (inFlightRef.current) return;
    if (lastFailedOpRef.current) {
      void lastFailedOpRef.current();
    } else if (projectId) {
      void fetchRuns(projectId);
    }
  }, [projectId, fetchRuns]);

  const handleManualFallback = useCallback(() => {
    setActionState('manual');
    dispatch({ type: 'set-status', message: 'Manual mission entry mode active (backend fallback).' });
  }, [dispatch]);

  const active = useMemo(() => runs.filter((r) => !['completed', 'failed', 'cancelled'].includes(safeString(r.status).toLowerCase())).length, [runs]);

  const canApprove = userRole === 'estimator' || userRole === 'pm' || userRole === 'admin';

  return (
    <section style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: 18, background: 'var(--di-bg)' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <Activity size={20} color="var(--di-accent)" />
        <div>
          <h2 style={{ margin: 0, fontSize: 16 }}>Mission Control</h2>
          <div style={{ fontSize: 11, color: 'var(--di-text3)' }}>
            Agentic runs terikat proyek · {active} aktif · {runs.length} total
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={actionState === 'loading' || !projectId}
          style={{ marginLeft: 'auto' }}
        >
          <RefreshCw size={14} className={actionState === 'loading' ? 'spin' : undefined} /> Refresh
        </button>
      </header>

      {!projectId && (
        <div style={{ padding: 16, border: '1px solid var(--di-border)', borderRadius: 8 }}>
          Pilih project terlebih dahulu. Agent tidak diizinkan berjalan tanpa ProjectContextBinding.
        </div>
      )}

      {projectId && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 0.9fr) minmax(420px, 1.6fr)', gap: 14 }}>
          <div style={{ border: '1px solid var(--di-border)', borderRadius: 10, padding: 14, background: 'var(--di-panel)' }}>
            <strong style={{ fontSize: 13 }}>Buat engineering mission</strong>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              rows={7}
              style={{ width: '100%', marginTop: 10, resize: 'vertical', background: 'var(--di-bg)', color: 'var(--di-text)', border: '1px solid var(--di-border)', borderRadius: 7, padding: 10 }}
            />
            <button
              onClick={() => void createRun()}
              disabled={actionState === 'loading' || !goal.trim()}
              style={{ marginTop: 10, width: '100%', height: 34, cursor: actionState === 'loading' ? 'not-allowed' : 'pointer' }}
            >
              Buat Plan Terikat PLHUT
            </button>
            <p style={{ fontSize: 11, color: 'var(--di-text3)', lineHeight: 1.5 }}>
              Run hanya membuat plan dan state persisten. Aksi RAB, approval, dan keputusan engineering tetap melalui authority gate.
            </p>

            {actionState === 'error' && (
              <div data-testid="mission-error-panel" role="alert" style={{ marginTop: 10, padding: 12, border: '1px solid var(--di-err, #ef4444)', borderRadius: 8, background: 'rgba(239, 68, 68, 0.08)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--di-err, #ef4444)' }}>
                  <AlertTriangle size={15} /> Mission Backend Error
                </div>
                <p data-testid="mission-error-message" style={{ fontSize: 11, margin: '6px 0', color: 'var(--di-text2)', lineHeight: 1.4 }}>
                  {errorMessage}
                </p>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button
                    data-testid="retry-mission-btn"
                    onClick={handleRetry}
                    style={{
                      flex: 1,
                      height: 30,
                      fontSize: 11,
                      background: 'var(--di-accent)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 5,
                      cursor: 'pointer',
                    }}
                  >
                    Retry Mission Operation
                  </button>
                  <button
                    onClick={handleManualFallback}
                    style={{
                      height: 30,
                      padding: '0 10px',
                      fontSize: 11,
                      background: 'var(--di-bg2, #2a2a2a)',
                      color: 'var(--di-text2)',
                      border: '1px solid var(--di-border)',
                      borderRadius: 5,
                      cursor: 'pointer',
                    }}
                  >
                    Manual Mission Input
                  </button>
                </div>
              </div>
            )}

            {actionState === 'manual' && (
              <div data-testid="mission-manual-panel" style={{ marginTop: 10, padding: 12, border: '1px solid var(--di-border)', borderRadius: 8, background: 'var(--di-bg2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}>
                  <Wrench size={15} /> Manual Fallback Mode
                </div>
                <p style={{ fontSize: 11, margin: '4px 0 8px', color: 'var(--di-text3)', lineHeight: 1.4 }}>
                  Backend tidak tersedia. Pengguna dapat memasukkan instruksi atau catatan manual secara independen.
                </p>
                <input
                  type="text"
                  placeholder="Catatan / instruksi mission manual..."
                  value={manualNote}
                  onChange={(e) => setManualNote(e.target.value)}
                  style={{ width: '100%', height: 28, fontSize: 11, padding: '0 8px', background: 'var(--di-bg)', border: '1px solid var(--di-border)', borderRadius: 5, color: 'var(--di-text)' }}
                />
              </div>
            )}
          </div>

          <div
            data-testid={actionState === 'ready' ? 'mission-ready-panel' : undefined}
            style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
          >
            {runs.length === 0 && actionState !== 'loading' && actionState !== 'error' && (
              <div style={{ padding: 20, border: '1px dashed var(--di-border)', borderRadius: 10, color: 'var(--di-text3)' }}>
                Belum ada agent run untuk project ini.
              </div>
            )}

            {runs.map((run) => {
              const taskCount = run.plan?.tasks?.length ?? 0;
              const completedCount = run.completedTaskIds?.length ?? 0;
              const progress = taskCount ? Math.round((completedCount / taskCount) * 100) : 0;
              const currentStatus = safeString(run.status).toLowerCase();

              const hasReplay = run.invocations?.some((i) => i.status === 'replayed') || run.actionRecords?.some((a) => a.status === 'replayed');
              const hasEngineAuthority = run.invocations?.some((i) => (i.output as any)?.sourceAuthority === 'core_engine');

              return (
                <article key={run.runId} data-testid="mission-run-card" style={{ border: '1px solid var(--di-border)', borderRadius: 10, background: 'var(--di-panel)', padding: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    {statusIcon(run.status)}
                    <strong style={{ fontSize: 12 }}>{run.goalSpec?.request}</strong>
                    <span data-testid="run-status-badge" style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--di-text3)' }}>{run.status}</span>
                    {hasReplay && (
                      <span data-testid="replayed-badge" style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', display: 'flex', alignItems: 'center', gap: 3 }}>
                        <RotateCcw size={10} /> REPLAYED
                      </span>
                    )}
                    {hasEngineAuthority && (
                      <span data-testid="core-engine-authority-badge" style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', fontWeight: 600 }}>
                        sourceAuthority: core_engine
                      </span>
                    )}
                  </div>
                  <div style={{ height: 5, background: 'var(--di-panel2)', borderRadius: 4, overflow: 'hidden', margin: '10px 0 7px' }}>
                    <div style={{ width: `${progress}%`, height: '100%', background: 'var(--di-accent)' }} />
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--di-text3)' }}>
                    {completedCount}/{taskCount} tasks · risk {run.goalSpec?.riskTier} · v{run.version}
                  </div>
                  {run.budget && run.budgetUsage && (
                    <div data-testid="budget-usage-timeline" style={{ marginTop: 6, fontSize: 10.5, color: 'var(--di-text3)' }}>
                      Budget: {run.budgetUsage.toolCalls}/{run.budget.maxToolCalls} tools · {run.budgetUsage.tokens}/{run.budget.maxTokens} tokens · ${run.budgetUsage.costUsd.toFixed(4)}/${run.budget.maxCostUsd.toFixed(2)}
                    </div>
                  )}

                  {currentStatus === 'waiting_approval' && (
                    <div data-testid="approval-request-panel" role="alert" style={{ marginTop: 8, padding: 10, borderRadius: 6, background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.3)', color: '#eab308', fontSize: 11 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, marginBottom: 4 }}>
                        <ShieldAlert size={14} /> Human Approval Required
                      </div>
                      Authoritative calculation tool is waiting for valid project-scoped approval. Zero Engine calls executed.
                      {canApprove ? (
                        <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center' }}>
                          <input
                            type="text"
                            placeholder="Catatan approval (opsional)..."
                            value={approvalNote}
                            onChange={(e) => setApprovalNote(e.target.value)}
                            style={{ flex: 1, height: 26, fontSize: 10.5, padding: '0 6px', background: 'var(--di-bg)', border: '1px solid var(--di-border)', borderRadius: 4, color: 'var(--di-text)' }}
                          />
                          <button
                            data-testid="approve-mission-step-btn"
                            onClick={() => void submitApproval(run)}
                            style={{ height: 26, padding: '0 10px', fontSize: 10.5, background: 'var(--di-ok, #22c55e)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
                          >
                            Approve & Execute Engine Call
                          </button>
                        </div>
                      ) : (
                        <div data-testid="rbac-denial-notice" style={{ marginTop: 6, color: '#ef4444', fontSize: 10.5 }}>
                          Role '{userRole}' does not have permission to approve calculation tools. Required: estimator, pm, admin.
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {run.plan?.tasks?.map((task) => (
                      <span
                        key={task.id}
                        style={{
                          padding: '2px 6px',
                          borderRadius: 5,
                          fontSize: 9.5,
                          background: run.completedTaskIds?.includes(task.id) ? 'var(--di-success-soft)' : 'var(--di-panel2)',
                          color: 'var(--di-text2)',
                        }}
                      >
                        {task.title}
                      </span>
                    ))}
                  </div>
                  <div style={{ marginTop: 9, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {['running', 'waiting_tool'].includes(currentStatus) && (
                      <button data-testid="execute-step-btn" onClick={() => void executeNextStep(run)} disabled={actionState === 'loading'}>
                        Execute next governed step
                      </button>
                    )}
                    {currentStatus === 'queued' && (
                      <button onClick={() => void transition(run, 'planning')} disabled={actionState === 'loading'}>
                        Mulai planning
                      </button>
                    )}
                    {currentStatus === 'planning' && (
                      <button onClick={() => void transition(run, 'running')} disabled={actionState === 'loading'}>
                        Jalankan
                      </button>
                    )}
                    {currentStatus === 'running' && (
                      <button onClick={() => void transition(run, 'paused')} disabled={actionState === 'loading'}>
                        Pause
                      </button>
                    )}
                    {currentStatus === 'paused' && (
                      <button onClick={() => void transition(run, 'running')} disabled={actionState === 'loading'}>
                        Resume
                      </button>
                    )}
                    {currentStatus === 'running' && (
                      <button onClick={() => void transition(run, 'completed')} disabled={actionState === 'loading'}>
                        Tandai selesai
                      </button>
                    )}
                    {!['completed', 'failed', 'cancelled'].includes(currentStatus) && (
                      <button onClick={() => void transition(run, 'cancelled')} disabled={actionState === 'loading'}>
                        Batalkan
                      </button>
                    )}
                  </div>
                  {run.failure && <div data-testid="run-failure-message" style={{ marginTop: 8, color: 'var(--di-danger, #ef4444)', fontSize: 10.5 }}>{run.failure}</div>}
                  {(run.auditTimeline?.length ?? 0) > 0 && (
                    <details data-testid="audit-timeline-details" style={{ marginTop: 8 }}>
                      <summary style={{ fontSize: 10.5, cursor: 'pointer' }}>Audit timeline ({run.auditTimeline?.length})</summary>
                      <ol style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 10, color: 'var(--di-text3)' }}>
                        {run.auditTimeline?.slice(-8).map((event) => <li key={event.eventId}>{event.type}: {event.message}</li>)}
                      </ol>
                    </details>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
