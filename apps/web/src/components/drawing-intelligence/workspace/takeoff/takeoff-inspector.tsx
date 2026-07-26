'use client';

import { useState, useCallback } from 'react';
import { AlertTriangle, CheckCircle2, Magnet, RefreshCw, RotateCcw, RotateCw, Ruler, ShieldCheck, Wrench } from 'lucide-react';
import { useWorkspace } from '../workspace-store';
import { calculateDrawingIntelligenceWorkItem, fetchCivilWorkItems, fetchQuantityReadiness } from '../../drawing-intelligence-api';
import { normalizeStatusMessage } from '../status-bar';

type TakeoffActionState = 'idle' | 'loading' | 'ready' | 'error' | 'manual';

function normalizeError(err: unknown): string {
  if (typeof err === 'string' && err.trim()) return err;
  if (err && typeof err === 'object') {
    if ('message' in err && typeof (err as any).message === 'string' && (err as any).message.trim()) {
      return (err as any).message;
    }
    if ('detail' in err && typeof (err as any).detail === 'string' && (err as any).detail.trim()) {
      return (err as any).detail;
    }
  }
  if (err === null || err === undefined) return 'Backend request failed';
  try {
    const str = String(err);
    return str !== '[object Object]' ? str : 'Backend request failed';
  } catch {
    return 'Backend request failed';
  }
}

export function TakeoffInspector() {
  const { state, dispatch } = useWorkspace();
  const [snap, setSnap] = useState(true);
  const [ortho, setOrtho] = useState(false);
  const [actionState, setActionState] = useState<TakeoffActionState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultSummary, setResultSummary] = useState<string | null>(null);
  const [manualNote, setManualNote] = useState('');

  const activeRunId = state.upload.entries.find((entry) => entry.runId)?.runId ?? state.files[0]?.id ?? null;
  const selectedWorkItemId = state.selectedQuantityId ?? state.quantities[0]?.id ?? state.analysis.packageIntelligence?.work_items[0]?.work_item_id ?? null;
  const projectId = state.projectId;

  const handleRunTakeoff = useCallback(async () => {
    if (actionState === 'loading') return;
    setActionState('loading');
    setErrorMessage(null);
    setResultSummary(null);
    dispatch({ type: 'set-status', message: 'Executing backend takeoff calculation…' });

    try {
      if (activeRunId && selectedWorkItemId) {
        const calc = await calculateDrawingIntelligenceWorkItem(activeRunId, selectedWorkItemId);
        const resText = (calc && calc.result !== null && calc.result !== undefined)
          ? `Volume/quantity terhitung ${calc.result.toLocaleString('id-ID')} ${calc.unit ?? ''} melalui Core Engine`
          : 'Takeoff calculations ready';
        setResultSummary(resText);
        dispatch({ type: 'set-status', message: `Takeoff calculation complete: ${resText}` });
      } else if (projectId) {
        const itemsRes = await fetchCivilWorkItems(projectId);
        const summaryText = itemsRes
          ? `Takeoff calculations ready: ${itemsRes.summary.ready} items ready, ${itemsRes.summary.total} total`
          : 'Takeoff calculations ready';
        setResultSummary(summaryText);
        dispatch({ type: 'set-status', message: summaryText });
      } else {
        const readinessRes = await fetchQuantityReadiness('default');
        const summaryText = `Takeoff calculations ready: ${readinessRes?.summary?.ready ?? 0} items ready`;
        setResultSummary(summaryText);
        dispatch({ type: 'set-status', message: summaryText });
      }
      setActionState('ready');
    } catch (err) {
      const normalizedMsg = normalizeError(err);
      setErrorMessage(normalizedMsg);
      setActionState('error');
      dispatch({ type: 'set-status', message: normalizeStatusMessage(`Takeoff calculation failed: ${normalizedMsg}`) });
    }
  }, [actionState, activeRunId, selectedWorkItemId, projectId, dispatch]);

  const handleManualFallback = useCallback(() => {
    setActionState('manual');
    dispatch({ type: 'set-status', message: 'Manual takeoff entry mode active (backend fallback).' });
  }, [dispatch]);

  return (
    <aside style={{ width: 292, borderLeft: '1px solid var(--di-border)', background: 'var(--di-panel)', padding: 12, overflow: 'auto' }}>
      <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
        <Ruler size={16} color="var(--di-accent)" />
        <strong style={{ fontSize: 13 }}>Takeoff Workbench</strong>
      </div>
      <p style={{ fontSize: 11, color: 'var(--di-text3)', lineHeight: 1.5 }}>
        Tool aktif: <b>{state.canvas.tool}</b>. Geometri merupakan draft sampai dikalibrasi dan diverifikasi.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
        <button onClick={() => setSnap(!snap)} style={{ height: 32, background: snap ? 'var(--di-accent-soft)' : undefined }}>
          <Magnet size={13} /> Snap {snap ? 'On' : 'Off'}
        </button>
        <button onClick={() => setOrtho(!ortho)} style={{ height: 32, background: ortho ? 'var(--di-accent-soft)' : undefined }}>
          Ortho {ortho ? 'On' : 'Off'}
        </button>
        <button disabled title="Undo tersedia ketika operation ledger berisi aksi">
          <RotateCcw size={13} /> Undo
        </button>
        <button disabled title="Redo tersedia setelah undo">
          <RotateCw size={13} /> Redo
        </button>
      </div>

      <div style={{ marginTop: 12 }}>
        <button
          onClick={handleRunTakeoff}
          disabled={actionState === 'loading'}
          style={{
            width: '100%',
            height: 36,
            background: 'var(--di-accent)',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontWeight: 600,
            fontSize: 12,
            cursor: actionState === 'loading' ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            opacity: actionState === 'loading' ? 0.7 : 1,
          }}
        >
          {actionState === 'loading' ? <RefreshCw size={14} className="spin" /> : <Ruler size={14} />}
          {actionState === 'loading' ? 'Calculating Takeoff…' : 'Run Takeoff Calculation'}
        </button>
      </div>

      {actionState === 'ready' && (
        <div data-testid="takeoff-ready-panel" style={{ marginTop: 10, padding: 10, border: '1px solid var(--di-ok)', borderRadius: 8, background: 'rgba(16, 185, 129, 0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: 'var(--di-ok)' }}>
            <CheckCircle2 size={14} /> Takeoff Ready
          </div>
          <p style={{ fontSize: 10.5, margin: '6px 0 0', color: 'var(--di-text2)' }}>
            {resultSummary || 'Takeoff calculations ready.'}
          </p>
        </div>
      )}

      {actionState === 'error' && (
        <div data-testid="takeoff-error-panel" role="alert" style={{ marginTop: 10, padding: 10, border: '1px solid var(--di-err)', borderRadius: 8, background: 'rgba(239, 68, 68, 0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: 'var(--di-err)' }}>
            <AlertTriangle size={14} /> Takeoff Backend Error
          </div>
          <p data-testid="takeoff-error-message" style={{ fontSize: 10.5, margin: '6px 0', color: 'var(--di-text2)', lineHeight: 1.4 }}>
            {errorMessage}
          </p>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button
              onClick={handleRunTakeoff}
              style={{
                flex: 1,
                height: 28,
                fontSize: 11,
                background: 'var(--di-accent)',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              Retry Takeoff Calculation
            </button>
            <button
              onClick={handleManualFallback}
              style={{
                height: 28,
                padding: '0 8px',
                fontSize: 11,
                background: 'var(--di-bg2, #2a2a2a)',
                color: 'var(--di-text2)',
                border: '1px solid var(--di-border)',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              Manual Takeoff Input
            </button>
          </div>
        </div>
      )}

      {actionState === 'manual' && (
        <div data-testid="takeoff-manual-panel" style={{ marginTop: 10, padding: 10, border: '1px solid var(--di-border)', borderRadius: 8, background: 'var(--di-bg2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600 }}>
            <Wrench size={14} /> Manual Fallback Mode
          </div>
          <p style={{ fontSize: 10.5, margin: '4px 0 8px', color: 'var(--di-text3)' }}>
            Backend tidak tersedia. Pengguna dapat memasukkan atau memverifikasi catatan manual secara independen.
          </p>
          <input
            type="text"
            placeholder="Catatan / angka manual..."
            value={manualNote}
            onChange={(e) => setManualNote(e.target.value)}
            style={{ width: '100%', height: 26, fontSize: 11, padding: '0 6px', background: 'var(--di-bg)', border: '1px solid var(--di-border)', borderRadius: 4, color: 'var(--di-text)' }}
          />
        </div>
      )}

      <div style={{ marginTop: 12, padding: 10, border: '1px solid var(--di-border)', borderRadius: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
          <ShieldCheck size={14} /> Authority lifecycle
        </div>
        <ol style={{ paddingLeft: 18, margin: '8px 0 0', fontSize: 10.5, color: 'var(--di-text3)', lineHeight: 1.6 }}>
          <li>Draft geometry</li>
          <li>Scale/view calibration</li>
          <li>Candidate review</li>
          <li>Verified Measurement Fact</li>
          <li>Core Engine calculation</li>
        </ol>
      </div>
    </aside>
  );
}
