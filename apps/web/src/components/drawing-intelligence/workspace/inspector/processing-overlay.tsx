'use client';

/** AI Analysis in Progress overlay + stepper + log (blueprint §13, gambar referensi 7).
 *
 * STATUS R2: NONAKTIF (RETIRE-AFTER-PARITY, MP §12.1). Digantikan oleh
 * AgentExecutionConsole (agentic/agent-execution-console) setelah console
 * parity (MP §11 G2.1-G2.4, K14). Komponen dipertahankan — TIDAK dihapus
 * sebelum pengganti lulus parity + integration (Owner §21, no-delete-sebelum-
 * parity). Rendering dinonaktifkan via prop `disabled` (default true).
 *
 * Alasan nonaktif: overlay ini memakai polling 2s + stepper + teks hardcoded
 * (temuan Stage A §2.1 #8) — melanggar Owner §0.14-15 (trace nyata, tanpa
 * fake progress).
 */

import { useSyncExternalStore } from 'react';
import { Check, CheckCircle2 } from 'lucide-react';
import { useWorkspace } from '../workspace-store';
import { getRuntimeStore } from '../agentic/agent-execution-console/runtime-bridge';

/** Explicit compatibility fallback path (FAIL-CLOSED, labeled, non-polling by default). */
async function fetchDemRunStatusCompatibilityFallback(runId: string) {
  try {
    const { fetchDemRunStatus } = await import('../../drawing-intelligence-api');
    return await fetchDemRunStatus(runId);
  } catch {
    return null;
  }
}

export function ProcessingOverlay({ disabled = true }: { disabled?: boolean }) {
  const { state, dispatch } = useWorkspace();

  const runtimeStore = getRuntimeStore();
  const runtimeState = useSyncExternalStore(
    (cb) => runtimeStore.subscribe(cb),
    () => runtimeStore.getState(),
  );

  if (disabled) return null;
  if (!state.analysis.running) return null;

  const { stages } = state.analysis;
  const completedTasks = runtimeState.completedTaskCount;
  const totalTasks = runtimeState.tasks.length || 12;
  const progressPct = Math.round((completedTasks / totalTasks) * 100);
  const currentMessage = runtimeState.statusStack.length > 0
    ? runtimeState.statusStack[runtimeState.statusStack.length - 1].label
    : state.analysis.currentMessage || 'Preparing sheets…';

  const synStatus = completedTasks >= totalTasks ? 'synthesis_complete' : completedTasks > 0 ? 'synthesis_in_progress' : 'pending';

  // Make stages reactive to real EventStore task status
  const activeStages = stages.map((s, i) => {
    if (synStatus === 'synthesis_complete') return { ...s, status: 'done' as const };
    if (synStatus === 'synthesis_in_progress') {
      return { ...s, status: (i < 2 ? 'done' : i === 2 ? 'active' : 'pending') as 'done' | 'active' | 'pending' };
    }
    return { ...s, status: (i === 0 ? 'active' : 'pending') as 'done' | 'active' | 'pending' };
  });

  return (
    <div
      className="di-fade"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(4, 8, 12, 0.55)',
        backdropFilter: 'blur(3px)',
      }}
    >
      <div
        className="di-panel di-rise"
        style={{
          width: 640,
          maxWidth: '92vw',
          borderRadius: 16,
          padding: 28,
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}
      >
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h2 style={{ fontFamily: 'var(--di-font-display)', fontSize: 20, margin: 0, color: 'var(--di-text)' }}>
            AI Analysis in Progress
          </h2>
          <span style={{ fontSize: 12.5, color: 'var(--di-text2)' }}>
            Our AI is analyzing your drawing and extracting structured data.
          </span>
        </div>

        {/* Stepper */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          {activeStages.map((s, i) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', flex: i < activeStages.length - 1 ? 1 : undefined }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: `2px solid ${
                      s.status === 'done' ? 'var(--di-ok)' : s.status === 'active' ? 'var(--di-action)' : 'var(--di-border)'
                    }`,
                    background: s.status === 'done' ? 'var(--di-ok-bg)' : 'transparent',
                    color: s.status === 'active' ? 'var(--di-action)' : s.status === 'done' ? 'var(--di-ok)' : 'var(--di-text3)',
                    boxShadow: s.status === 'active' ? '0 0 0 4px rgba(0, 0, 0, 0.16)' : 'none',
                    flexShrink: 0,
                  }}
                >
                  {s.status === 'done' ? (
                    <Check size={14} />
                  ) : (
                    <span className="di-mono" style={{ fontSize: 12, fontWeight: 700 }}>{s.id}</span>
                  )}
                </div>
                <span
                  style={{
                    fontSize: 9.5,
                    color: s.status === 'pending' ? 'var(--di-text3)' : 'var(--di-text2)',
                    textAlign: 'center',
                    maxWidth: 72,
                  }}
                >
                  {s.label}
                </span>
              </div>
              {i < activeStages.length - 1 && (
                <div
                  style={{
                    flex: 1,
                    height: 2,
                    marginBottom: 18,
                    background: s.status === 'done' ? 'var(--di-ok)' : 'var(--di-border)',
                  }}
                />
              )}
            </div>
          ))}
        </div>

        {/* Current message */}
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: 13, color: 'var(--di-text)' }}>{currentMessage || 'Preparing sheets…'}</span>
          <span style={{ fontSize: 11, color: 'var(--di-text3)' }}>
            Linking detected elements to work breakdown structure…
          </span>
        </div>

        {/* Progress bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'var(--di-panel2)', overflow: 'hidden' }}>
            <div
              style={{
                width: `${progressPct}%`,
                height: '100%',
                background: 'var(--di-action)',
                borderRadius: 999,
                transition: `width var(--di-t-med) var(--di-ease)`,
              }}
            />
          </div>
          <span className="di-mono" style={{ fontSize: 12, color: 'var(--di-text2)', width: 40, textAlign: 'right' }}>
            {progressPct}%
          </span>
        </div>

        {/* Live stats */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="di-mono" style={{ fontSize: 11, color: 'var(--di-text3)' }}>
            Tasks: {completedTasks}/{totalTasks} completed · Status: {synStatus}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button
            className="di-btn di-btn-ghost"
            onClick={() => {
              dispatch({ type: 'analysis', patch: { running: false, setupOpen: true } });
              dispatch({ type: 'set-status', message: 'Analysis cancelled' });
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
