'use client';

/**
 * TechnicalStatusBar — bar status teknis persisten (blueprint §5, §6.3):
 * Page | Scale | X Y | Zoom | status pipeline. Mono 11px.
 */

import { BookOpen, HelpCircle } from 'lucide-react';
import { useWorkspace, useActiveSheet } from './workspace-store';

function statusDotColor(message: string, running: boolean): string {
  const m = message.toLowerCase();
  if (running || m.includes('progress') || m.includes('uploading')) return 'var(--di-accent)';
  if (m.includes('ready') || m.includes('complete') || m.includes('sent')) return 'var(--di-ok)';
  if (m.includes('cancel') || m.includes('fail')) return 'var(--di-err)';
  return 'var(--di-info)';
}

export function TechnicalStatusBar() {
  const { state } = useWorkspace();
  const sheet = useActiveSheet();
  const busy = state.analysis.running || state.upload.running;
  const dot = statusDotColor(state.statusMessage, busy);

  return (
    <footer
      className="di-mono"
      style={{
        height: 'var(--di-statusbar-h)',
        display: 'flex',
        alignItems: 'center',
        gap: 18,
        padding: '0 14px',
        borderTop: '1px solid var(--di-border)',
        background: 'var(--di-bg)',
        fontSize: 11,
        color: 'var(--di-text3)',
        flexShrink: 0,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
      }}
    >
      {state.mode === 'handoff' ? (
        <>
          <span>
            Project: <span style={{ color: 'var(--di-text2)' }}>{state.projectId || 'Proyek aktif'}</span>
          </span>
          <span>Scale: {sheet?.scale ?? '—'}</span>
          <span>Units: Mixed</span>
        </>
      ) : (
        <>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Page: <span style={{ color: 'var(--di-text2)' }}>{sheet ? `${sheet.code} – ${sheet.title}` : '—'}</span>
          </span>
          <span>Scale: {sheet?.scale ?? '—'}</span>
          <span>X: —</span>
          <span>Y: —</span>
          <span>
            Zoom: {Math.round(state.canvas.zoom * 100)}%
          </span>
        </>
      )}

      <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
        <span
          className={busy ? 'di-pulse' : undefined}
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: dot,
            display: 'inline-block',
            flexShrink: 0,
          }}
        />
        <span style={{ color: 'var(--di-text2)' }}>{state.statusMessage}</span>
      </span>

      <span style={{ display: 'inline-flex', gap: 2 }}>
        <button className="di-icon-btn" style={{ width: 24, height: 22 }} title="Documentation">
          <BookOpen size={13} />
        </button>
        <button className="di-icon-btn" style={{ width: 24, height: 22 }} title="Help">
          <HelpCircle size={13} />
        </button>
      </span>
    </footer>
  );
}
