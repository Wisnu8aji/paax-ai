'use client';

/** Analysis Setup panel kanan (blueprint §12, gambar referensi 6). */

import { useState } from 'react';
import {
  Building2,
  Home,
  Landmark,
  Scale,
  SearchCheck,
  X,
  Zap,
} from 'lucide-react';
import { useWorkspace } from '../workspace-store';
import type { AnalysisScope, DetectionMode } from '../di-types';

const SCOPE_OPTIONS: { id: AnalysisScope; label: string; icon: typeof Landmark }[] = [
  { id: 'substructure', label: 'Substructure', icon: Landmark },
  { id: 'superstructure', label: 'Superstructure', icon: Building2 },
  { id: 'architecture', label: 'Architecture', icon: Home },
  { id: 'mep', label: 'MEP', icon: Zap },
];

const MODE_OPTIONS: { id: DetectionMode; label: string; desc: string; icon: typeof Scale }[] = [
  { id: 'balanced', label: 'Balanced', desc: 'Best mix of speed and accuracy for most projects', icon: Scale },
  { id: 'fast', label: 'Fast', desc: 'Quick scan with optimized performance', icon: Zap },
  { id: 'deep', label: 'Deep Review', desc: 'Most thorough analysis with maximum detail', icon: SearchCheck },
];

const OUTPUT_OPTIONS: {
  key: 'classifySheets' | 'detectItems' | 'extractQuantities' | 'buildFloorGrouping';
  label: string;
  sub: string;
}[] = [
  { key: 'classifySheets', label: 'Classify sheets', sub: 'Identify disciplines and sheet types' },
  { key: 'detectItems', label: 'Detect items', sub: 'Locate and classify building elements' },
  { key: 'extractQuantities', label: 'Prepare measurement candidates', sub: 'Geometry and evidence for human-approved takeoff' },
  { key: 'buildFloorGrouping', label: 'Build floor grouping', sub: 'Group sheets by floors and levels' },
];

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 34,
        height: 18,
        borderRadius: 999,
        border: 'none',
        padding: 2,
        background: checked ? 'var(--di-action)' : 'var(--di-panel2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: checked ? 'flex-end' : 'flex-start',
        cursor: 'pointer',
        transition: `background var(--di-t-fast) var(--di-ease)`,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: 'var(--di-action-ink)',
          display: 'block',
          transition: `transform var(--di-t-fast) var(--di-ease)`,
        }}
      />
    </button>
  );
}

function InfoLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
      <span className="di-section-title">{children}</span>
      <span style={{ color: 'var(--di-text3)', fontSize: 10 }} title="More info">ⓘ</span>
    </div>
  );
}

export function AnalysisSetupPanel() {
  const { state, dispatch, startAnalysis } = useWorkspace();
  const [toast, setToast] = useState<string | null>(null);

  if (!state.analysis.setupOpen) return null;
  const cfg = state.analysis.config;

  const selectedSheets = state.selectedSheetIds
    .map((id) => state.sheets.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => !!s);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  return (
    <aside
      className="di-panel di-rise"
      style={{
        width: 420,
        display: 'flex',
        flexDirection: 'column',
        borderTop: 'none',
        borderBottom: 'none',
        borderRight: 'none',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 18px',
          borderBottom: '1px solid var(--di-border)',
          flexShrink: 0,
        }}
      >
        <h2 style={{ fontFamily: 'var(--di-font-display)', fontSize: 17, margin: 0 }}>Analysis Setup</h2>
        <button
          className="di-icon-btn"
          onClick={() => {
            dispatch({ type: 'analysis', patch: { setupOpen: false } });
            dispatch({ type: 'set-mode', mode: 'review' });
          }}
        >
          <X size={16} />
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Selected sheets */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="di-section-title">Selected Sheets ({selectedSheets.length})</span>
            <button
              className="di-btn-ghost"
              style={{ border: 'none', background: 'none', padding: 0, color: 'var(--di-action)', fontSize: 11.5, cursor: 'pointer' }}
              onClick={() => dispatch({ type: 'set-sheet-selection', sheetIds: [] })}
            >
              Clear all
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {selectedSheets.map((s) => (
              <span
                key={s.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  height: 26,
                  padding: '0 8px 0 10px',
                  borderRadius: 8,
                  background: 'var(--di-panel2)',
                  fontSize: 11.5,
                  color: 'var(--di-text)',
                }}
              >
                {s.floorId} – {s.floorLabel}
                <button
                  style={{ background: 'none', border: 'none', color: 'var(--di-text3)', cursor: 'pointer', display: 'flex', padding: 0 }}
                  onClick={() => dispatch({ type: 'toggle-sheet-selection', sheetId: s.id })}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
            <button
              className="di-btn di-btn-ghost"
              style={{ height: 26, fontSize: 11.5 }}
              onClick={() => dispatch({ type: 'set-mode', mode: 'sheets' })}
            >
              + Add more sheets
            </button>
          </div>
        </div>

        <div style={{ padding: '8px 12px', background: 'var(--di-warn-bg)', border: '1px solid var(--di-warn-bd)', borderRadius: 8, fontSize: 11, color: 'var(--di-text2)' }}>
          <strong>Runtime:</strong> Detection Mode now controls package analysis. Fast indexes the full set; Balanced adds vector descriptors; Deep enables table and geometry review on the selected scope. Final quantities still require approval and Core Engine.
        </div>

        {/* Scope */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <InfoLabel>Scope — Select what to analyze</InfoLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {SCOPE_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const active = cfg.scope === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => dispatch({ type: 'analysis-config', patch: { scope: opt.id } })}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
                    padding: '10px 4px',
                    borderRadius: 8,
                    border: `1px solid ${active ? 'var(--di-action)' : 'var(--di-border)'}`,
                    background: active ? 'var(--di-accent-soft)' : 'var(--di-panel2)',
                    color: active ? 'var(--di-text)' : 'var(--di-text2)',
                    cursor: 'pointer',
                    fontSize: 10.5,
                  }}
                >
                  <Icon size={16} color={active ? 'var(--di-action)' : 'var(--di-text3)'} />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Detection mode */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <InfoLabel>Detection Mode</InfoLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {MODE_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const active = cfg.mode === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => dispatch({ type: 'analysis-config', patch: { mode: opt.id } })}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: `1px solid ${active ? 'var(--di-action)' : 'var(--di-border)'}`,
                    background: active ? 'var(--di-accent-soft)' : 'var(--di-panel2)',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <Icon size={16} color={active ? 'var(--di-action)' : 'var(--di-text3)'} style={{ marginTop: 2, flexShrink: 0 }} />
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--di-text)' }}>{opt.label}</span>
                    <span style={{ fontSize: 11, color: 'var(--di-text3)' }}>{opt.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Output + Preview */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <InfoLabel>Output — Select outputs to generate</InfoLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {OUTPUT_OPTIONS.map((opt) => {
              const active = cfg.outputs[opt.key];
              return (
                <button
                  key={opt.key}
                  onClick={() => dispatch({ type: 'analysis-outputs', patch: { [opt.key]: !active } })}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    padding: '10px',
                    borderRadius: 8,
                    border: `1px solid ${active ? 'var(--di-action)' : 'var(--di-border)'}`,
                    background: active ? 'var(--di-accent-soft)' : 'var(--di-panel2)',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span
                    style={{
                      width: 15,
                      height: 15,
                      borderRadius: 4,
                      border: `1px solid ${active ? 'var(--di-action)' : 'var(--di-border-strong)'}`,
                      background: active ? 'var(--di-action)' : 'transparent',
                      flexShrink: 0,
                      marginTop: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--di-action-ink)',
                      fontSize: 10,
                    }}
                  >
                    {active ? '✓' : ''}
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--di-text)' }}>{opt.label}</span>
                    <span style={{ fontSize: 10, color: 'var(--di-text3)' }}>{opt.sub}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div
            className="di-panel"
            style={{
              background: 'var(--di-panel2)',
              borderRadius: 10,
              padding: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              marginTop: 4,
            }}
          >
            <span className="di-section-title">Preview Summary</span>
            <span className="di-mono" style={{ fontSize: 15, fontWeight: 700, color: 'var(--di-text)' }}>
              {selectedSheets.length} selected sheets
            </span>
            <span style={{ fontSize: 11, color: 'var(--di-text2)' }}>Mode: {cfg.mode === 'deep' ? 'Deep Review' : cfg.mode === 'fast' ? 'Fast package index' : 'Balanced'}</span>
            <span style={{ fontSize: 11, color: 'var(--di-text3)' }}>Vector-first routing · Raster fallback only when required</span>
            <span style={{ fontSize: 11, color: 'var(--di-text3)' }}>Low-confidence results enter human review; no quantity is auto-approved</span>
            <button className="di-btn" style={{ alignSelf: 'flex-start', marginTop: 4, height: 26, fontSize: 11 }}>
              Details
            </button>
          </div>
        </div>

        {/* Human verification */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <InfoLabel>Human Verification — Configure review and approval</InfoLabel>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--di-text2)' }}>Flag low confidence detections for review</span>
            <Switch
              checked={cfg.flagLowConfidence}
              onChange={(v) => dispatch({ type: 'analysis-config', patch: { flagLowConfidence: v } })}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--di-text2)' }}>Require reviewer approval for quantities</span>
            <Switch
              checked={cfg.requireReviewerApproval}
              onChange={(v) => dispatch({ type: 'analysis-config', patch: { requireReviewerApproval: v } })}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--di-text2)' }}>Auto-assign reviewers</span>
            <Switch
              checked={cfg.autoAssignReviewers}
              onChange={(v) => dispatch({ type: 'analysis-config', patch: { autoAssignReviewers: v } })}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--di-text2)' }}>Confidence threshold</span>
            <select
              className="di-btn"
              style={{ fontSize: 11.5, paddingRight: 6 }}
              value={cfg.confidenceThreshold}
              onChange={(e) =>
                dispatch({ type: 'analysis-config', patch: { confidenceThreshold: Number(e.target.value) } })
              }
            >
              <option value={70}>70%</option>
              <option value={80}>80% (Recommended)</option>
              <option value={90}>90%</option>
            </select>
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 10,
          padding: 14,
          borderTop: '1px solid var(--di-border)',
          flexShrink: 0,
        }}
      >
        <button className="di-btn" onClick={() => showToast('Setup saved')}>Save setup</button>
        <button className="di-btn di-btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={startAnalysis}>
          ▶ Start analysis
        </button>
      </div>

      {toast && (
        <div
          className="di-rise"
          style={{
            position: 'absolute',
            bottom: 64,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--di-elev)',
            border: '1px solid var(--di-border-strong)',
            borderRadius: 8,
            padding: '6px 14px',
            fontSize: 12,
            color: 'var(--di-text)',
          }}
        >
          {toast}
        </div>
      )}
    </aside>
  );
}
