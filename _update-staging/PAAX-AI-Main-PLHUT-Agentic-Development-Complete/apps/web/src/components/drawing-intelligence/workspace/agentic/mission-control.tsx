'use client';

import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Clock3, PauseCircle, PlayCircle, RefreshCw } from 'lucide-react';
import { useWorkspace } from '../workspace-store';

type AgentRun = {
  runId: string;
  status: string;
  version: number;
  updatedAt: string;
  goalSpec: { request: string; riskTier: string; binding: { projectId: string } };
  plan: { tasks: Array<{ id: string; title: string; capability: string }> };
  completedTaskIds: string[];
  pendingApprovalIds: string[];
  failure?: string;
};

function statusIcon(status: string) {
  if (status === 'completed') return <CheckCircle2 size={15} />;
  if (status === 'paused' || status === 'waiting_approval') return <PauseCircle size={15} />;
  if (status === 'failed' || status === 'blocked') return <AlertTriangle size={15} />;
  if (status === 'running') return <PlayCircle size={15} />;
  return <Clock3 size={15} />;
}

export function MissionControl() {
  const { state } = useWorkspace();
  const projectId = state.projectId;
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [goal, setGoal] = useState('Audit data kolom Lantai 2, hitung quantity terverifikasi, dan laporkan konflik.');

  async function refresh() {
    if (!projectId) return;
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/agent-runs?projectId=${encodeURIComponent(projectId)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || `HTTP ${response.status}`);
      setRuns(await response.json());
    } catch (e) { setError(String(e)); } finally { setLoading(false); }
  }

  async function createRun() {
    if (!projectId || !goal.trim()) return;
    setLoading(true); setError(null);
    try {
      const response = await fetch('/api/agent-runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, goal, riskTier: 'high', deliverables: ['engineering audit', 'evidence register'] }) });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || `HTTP ${response.status}`);
      await refresh();
    } catch (e) { setError(String(e)); setLoading(false); }
  }

  async function transition(run: AgentRun, status: string) {
    if (!projectId) return;
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/agent-runs/${encodeURIComponent(run.runId)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'transition', projectId, status, expectedVersion: run.version }) });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || `HTTP ${response.status}`);
      await refresh();
    } catch (e) { setError(String(e)); setLoading(false); }
  }

  useEffect(() => { void refresh(); }, [projectId]);
  const active = useMemo(() => runs.filter((r) => !['completed', 'failed', 'cancelled'].includes(r.status)).length, [runs]);

  return (
    <section style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: 18, background: 'var(--di-bg)' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <Activity size={20} color="var(--di-accent)" />
        <div><h2 style={{ margin: 0, fontSize: 16 }}>Mission Control</h2><div style={{ fontSize: 11, color: 'var(--di-text3)' }}>Agentic runs terikat proyek · {active} aktif · {runs.length} total</div></div>
        <button onClick={() => void refresh()} disabled={loading || !projectId} style={{ marginLeft: 'auto' }}><RefreshCw size={14} /> Refresh</button>
      </header>
      {!projectId && <div style={{ padding: 16, border: '1px solid var(--di-border)', borderRadius: 8 }}>Pilih project terlebih dahulu. Agent tidak diizinkan berjalan tanpa ProjectContextBinding.</div>}
      {projectId && <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 0.9fr) minmax(420px, 1.6fr)', gap: 14 }}>
        <div style={{ border: '1px solid var(--di-border)', borderRadius: 10, padding: 14, background: 'var(--di-panel)' }}>
          <strong style={{ fontSize: 13 }}>Buat engineering mission</strong>
          <textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={7} style={{ width: '100%', marginTop: 10, resize: 'vertical', background: 'var(--di-bg)', color: 'var(--di-text)', border: '1px solid var(--di-border)', borderRadius: 7, padding: 10 }} />
          <button onClick={() => void createRun()} disabled={loading || !goal.trim()} style={{ marginTop: 10, width: '100%', height: 34 }}>Buat Plan Terikat PLHUT</button>
          <p style={{ fontSize: 11, color: 'var(--di-text3)', lineHeight: 1.5 }}>Run hanya membuat plan dan state persisten. Aksi RAB, approval, dan keputusan engineering tetap melalui authority gate.</p>
          {error && <div style={{ marginTop: 8, color: 'var(--di-danger)', fontSize: 11 }}>{error}</div>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {runs.length === 0 && !loading && <div style={{ padding: 20, border: '1px dashed var(--di-border)', borderRadius: 10, color: 'var(--di-text3)' }}>Belum ada agent run untuk project ini.</div>}
          {runs.map((run) => {
            const progress = run.plan.tasks.length ? Math.round(run.completedTaskIds.length / run.plan.tasks.length * 100) : 0;
            return <article key={run.runId} style={{ border: '1px solid var(--di-border)', borderRadius: 10, background: 'var(--di-panel)', padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>{statusIcon(run.status)}<strong style={{ fontSize: 12 }}>{run.goalSpec.request}</strong><span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--di-text3)' }}>{run.status}</span></div>
              <div style={{ height: 5, background: 'var(--di-panel2)', borderRadius: 4, overflow: 'hidden', margin: '10px 0 7px' }}><div style={{ width: `${progress}%`, height: '100%', background: 'var(--di-accent)' }} /></div>
              <div style={{ fontSize: 10.5, color: 'var(--di-text3)' }}>{run.completedTaskIds.length}/{run.plan.tasks.length} tasks · risk {run.goalSpec.riskTier} · v{run.version}</div>
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 5 }}>{run.plan.tasks.map((task) => <span key={task.id} style={{ padding: '2px 6px', borderRadius: 5, fontSize: 9.5, background: run.completedTaskIds.includes(task.id) ? 'var(--di-success-soft)' : 'var(--di-panel2)', color: 'var(--di-text2)' }}>{task.title}</span>)}</div>
              <div style={{ marginTop: 9, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {run.status === 'queued' && <button onClick={() => void transition(run, 'planning')} disabled={loading}>Mulai planning</button>}
                {run.status === 'planning' && <button onClick={() => void transition(run, 'running')} disabled={loading}>Jalankan</button>}
                {run.status === 'running' && <button onClick={() => void transition(run, 'paused')} disabled={loading}>Pause</button>}
                {run.status === 'paused' && <button onClick={() => void transition(run, 'running')} disabled={loading}>Resume</button>}
                {run.status === 'running' && <button onClick={() => void transition(run, 'completed')} disabled={loading}>Tandai selesai</button>}
                {!['completed', 'failed', 'cancelled'].includes(run.status) && <button onClick={() => void transition(run, 'cancelled')} disabled={loading}>Batalkan</button>}
              </div>
              {run.failure && <div style={{ marginTop: 8, color: 'var(--di-danger)', fontSize: 10.5 }}>{run.failure}</div>}
            </article>;
          })}
        </div>
      </div>}
    </section>
  );
}
