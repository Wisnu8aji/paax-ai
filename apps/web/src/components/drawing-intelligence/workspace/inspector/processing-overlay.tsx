'use client';

/** AI Analysis in Progress overlay + stepper + log (blueprint §13, gambar referensi 7). */

import { useEffect, useState } from 'react';
import { Check, CheckCircle2 } from 'lucide-react';
import { useWorkspace } from '../workspace-store';
import { fetchDemRunStatus } from '../../drawing-intelligence-api';

export function ProcessingOverlay() {
  const { state, dispatch } = useWorkspace();
  const [realStatus, setRealStatus] = useState<any>(null);

  const runId = state.upload.entries.find((e) => e.runId)?.runId;

  useEffect(() => {
    if (!state.analysis.running || !runId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetchDemRunStatus(runId);
        setRealStatus(res);
      } catch (e) {}
    }, 2000);
    fetchDemRunStatus(runId).then(setRealStatus).catch(() => {});
    return () => clearInterval(interval);
  }, [state.analysis.running, runId]);

  if (!state.analysis.running) return null;
  const { stages, progress, currentMessage } = state.analysis;
  
  const totalPages = realStatus?.total_pages || 0;
  const completedPages = realStatus?.pages?.filter((p: any) => p.status === 'complete' || p.status === 'failed').length || 0;
  const synStatus = realStatus?.synthesis_status || 'pending';
  const modelStack = Array.isArray(realStatus?.model_stack) ? realStatus.model_stack : [];

  // Make stages reactive to real synthesis status
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
                width: `${progress}%`,
                height: '100%',
                background: 'var(--di-action)',
                borderRadius: 999,
                transition: `width var(--di-t-med) var(--di-ease)`,
              }}
            />
          </div>
          <span className="di-mono" style={{ fontSize: 12, color: 'var(--di-text2)', width: 40, textAlign: 'right' }}>
            {progress}%
          </span>
        </div>

        {/* Live stats + model stack (QA mode, collapsed by default) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="di-mono" style={{ fontSize: 11, color: 'var(--di-text3)' }}>
            Analysis Stats: {completedPages}/{totalPages} pages extracted · Synthesis Status: {synStatus}
          </span>
          {modelStack.length > 0 && (
            <details>
              <summary style={{ fontSize: 11, color: 'var(--di-text3)', cursor: 'pointer' }}>Runtime components</summary>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6, paddingLeft: 4 }}>
                {modelStack.map((component: any, index: number) => (
                  <div key={`${component.name ?? 'component'}-${index}`} className="di-mono" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--di-text3)' }}>
                    <span>{String(component.name ?? 'Component')}</span>
                    <span>{String(component.version ?? '')}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
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
