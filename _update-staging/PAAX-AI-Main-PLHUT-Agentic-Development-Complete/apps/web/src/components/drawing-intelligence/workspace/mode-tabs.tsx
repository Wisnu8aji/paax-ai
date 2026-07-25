'use client';

/**
 * ModeTabs — 6 mode workspace (blueprint §4) + workflow indicator.
 * Files · Sheets · Analyze · Review · Quantities · Handoff.
 */

import {
  FolderOpen,
  LayoutGrid,
  ScanSearch,
  SendHorizonal,
  Sparkles,
  Table2,
  Ruler,
  BrainCircuit,
} from 'lucide-react';
import { useWorkspace } from './workspace-store';
import type { WorkspaceMode } from './di-types';

const MODES: { id: WorkspaceMode; label: string; icon: typeof FolderOpen }[] = [
  { id: 'files', label: 'Files', icon: FolderOpen },
  { id: 'sheets', label: 'Sheets', icon: LayoutGrid },
  { id: 'analyze', label: 'Analyze', icon: Sparkles },
  { id: 'review', label: 'Review', icon: ScanSearch },
  { id: 'takeoff', label: 'Takeoff', icon: Ruler },
  { id: 'quantities', label: 'Quantities', icon: Table2 },
  { id: 'mission', label: 'Mission', icon: BrainCircuit },
  { id: 'handoff', label: 'Handoff', icon: SendHorizonal },
];

export function ModeTabs() {
  const { state, dispatch } = useWorkspace();

  const counts: Partial<Record<WorkspaceMode, number>> = {
    files: state.files.length,
    sheets: state.sheets.length,
    review: state.reviewQueue.filter((r) => !r.resolved).length,
    quantities: state.quantities.length,
    handoff: state.quantities.filter((q) => q.status === 'verified').length,
  };

  return (
    <nav
      aria-label="Workspace mode"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        height: 38,
        padding: '0 12px',
        borderBottom: '1px solid var(--di-border)',
        background: 'var(--di-bg)',
        flexShrink: 0,
      }}
    >
      {MODES.map((m) => {
        const Icon = m.icon;
        const active = state.mode === m.id;
        const count = counts[m.id];
        return (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={active}
            title={`${m.label} mode`}
            onClick={() => dispatch({ type: 'set-mode', mode: m.id })}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              height: 28,
              padding: '0 10px',
              borderRadius: 7,
              border: 'none',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 500,
              fontFamily: 'var(--di-font)',
              background: active ? 'var(--di-accent-soft)' : 'transparent',
              color: active ? 'var(--di-accent)' : 'var(--di-text2)',
              transition:
                'background var(--di-t-fast) var(--di-ease), color var(--di-t-fast) var(--di-ease)',
            }}
            onMouseEnter={(e) => {
              if (!active) e.currentTarget.style.color = 'var(--di-text)';
            }}
            onMouseLeave={(e) => {
              if (!active) e.currentTarget.style.color = 'var(--di-text2)';
            }}
          >
            <Icon size={14} />
            {m.label}
            {typeof count === 'number' && count > 0 && (
              <span
                className="di-mono"
                style={{
                  fontSize: 10,
                  color: active ? 'var(--di-accent)' : 'var(--di-text3)',
                  background: 'var(--di-panel2)',
                  borderRadius: 5,
                  padding: '1px 5px',
                  lineHeight: 1.4,
                }}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}

      <span
        className="di-mono"
        style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--di-text3)', whiteSpace: 'nowrap' }}
        title="Workflow progress"
      >
        Files {counts.files} → Sheets {counts.sheets} → Verified {counts.handoff} → Ready
      </span>
    </nav>
  );
}
