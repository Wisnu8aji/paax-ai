'use client';

/** Files mode: empty state intake (blueprint §7, gambar 2) + daftar file. */

import { useState } from 'react';
import { FileText, Info, MoreVertical, UploadCloud, AlertTriangle } from 'lucide-react';
import { useWorkspace } from '../workspace-store';
import { formatBytes } from '../di-types';

function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      className="di-panel di-fade"
      style={{
        position: 'absolute',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '6px 12px',
        borderRadius: 8,
        fontSize: 11.5,
        zIndex: 80,
        boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
        whiteSpace: 'nowrap',
      }}
    >
      {message}
    </div>
  );
}

function FileMenu({ onAction }: { onAction: (label: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button
        className="di-icon-btn"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label="File menu"
      >
        <MoreVertical size={15} />
      </button>
      {open && (
        <div
          className="di-panel di-fade"
          style={{ position: 'absolute', top: 32, right: 0, zIndex: 50, borderRadius: 8, padding: 4, minWidth: 130 }}
          onClick={(e) => e.stopPropagation()}
        >
          {['Re-analyze', 'Remove'].map((label) => (
            <button
              key={label}
              className="di-btn di-btn-ghost"
              style={{ width: '100%', justifyContent: 'flex-start', height: 26, fontSize: 11.5 }}
              onClick={() => {
                setOpen(false);
                onAction(label);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Ilustrasi wireframe sederhana: file bertumpuk + denah kotak (blueprint gambar 2). */
function IntakeIllustration() {
  const stackFiles = [
    { name: 'Architectural-Plan.pdf', color: 'var(--di-err)' },
    { name: 'Structural-Plan.dwg', color: 'var(--di-info)' },
    { name: 'Electrical-Plan.pdf', color: 'var(--di-ok)' },
    { name: 'Mechanical-Plan.pdf', color: 'var(--di-accent)' },
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 26, marginBottom: 8 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {stackFiles.map((f, i) => (
          <div
            key={f.name}
            className="di-panel"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 10px',
              borderRadius: 7,
              width: 132,
              transform: `translateX(${i * 6}px)`,
            }}
          >
            <div style={{ width: 8, height: 8, borderRadius: 2, background: f.color, flexShrink: 0 }} />
            <span className="di-mono" style={{ fontSize: 10.5, color: 'var(--di-text2)' }}>
              {f.name}
            </span>
          </div>
        ))}
      </div>
      <div
        style={{
          width: 160,
          height: 120,
          borderRadius: 10,
          border: '1px solid var(--di-border-strong)',
          background: 'var(--di-paper)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'absolute', inset: 12, border: '1px solid var(--di-grid-line)' }} />
        <div style={{ position: 'absolute', top: 24, left: 24, right: 60, bottom: 60, border: '1px solid var(--di-grid-line)' }} />
        <div style={{ position: 'absolute', top: 20, right: 24, width: 24, height: 60, border: '1px solid var(--di-grid-line)' }} />
        <div style={{ position: 'absolute', bottom: 20, left: 24, width: 50, height: 22, border: '1px solid var(--di-grid-line)' }} />
      </div>
    </div>
  );
}

export function FilesMode() {
  const { state, dispatch } = useWorkspace();
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 1500);
  };

  if (state.backendSyncFailed && state.backendSyncError === 'failed') {
    return (
      <section style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center', maxWidth: 460 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, borderRadius: '50%', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--di-err)' }}>
            <AlertTriangle size={32} />
          </div>
          <h2 style={{ fontFamily: 'var(--di-font-display)', fontSize: 22, margin: 0 }}>Backend Connection Failed</h2>
          <p style={{ fontSize: 13, color: 'var(--di-text2)', margin: 0, lineHeight: 1.6 }}>
            Failed to synchronize workspace with the backend services for project ID: <code className="di-mono" style={{ color: 'var(--di-text1)', background: 'var(--di-surface2)', padding: '2px 4px', borderRadius: 4 }}>{state.projectId}</code>.
            Please verify that the backend services are running and accessible.
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button
              className="di-btn di-btn-primary"
              style={{ height: 38, padding: '0 18px' }}
              onClick={() => window.location.reload()}
            >
              Retry Connection
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (!state.hasData) {
    const isNotReady = state.backendSyncFailed && state.backendSyncError === 'not-ready';
    return (
      <section style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center', maxWidth: 460 }}>
          <IntakeIllustration />
          <h2 style={{ fontFamily: 'var(--di-font-display)', fontSize: 22, margin: 0 }}>
            {isNotReady ? 'No drawings found in project' : 'Upload drawings to begin analysis'}
          </h2>
          <p style={{ fontSize: 13, color: 'var(--di-text2)', margin: 0, lineHeight: 1.6 }}>
            {isNotReady
              ? 'This project does not contain any drawing graph data yet. Upload drawing files below to extract data, detect elements, and generate intelligent insights.'
              : 'Upload PDF, DWG, or image files to extract data, detect elements, and generate intelligent insights across your drawings.'}
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button
              className="di-btn di-btn-primary"
              style={{ height: 38, padding: '0 18px' }}
              onClick={() => dispatch({ type: 'upload', patch: { modalOpen: true } })}
            >
              <UploadCloud size={15} />
              Upload new files
            </button>
            <button
              className="di-btn"
              style={{ height: 38, padding: '0 18px' }}
              onClick={() => showToast('Coming soon')}
            >
              Import from project documents
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--di-text3)', marginTop: 6 }}>
            Supported formats: PDF, DWG, PNG, JPG, TIFF
            <Info size={12} />
          </div>
        </div>
        <Toast message={toast} />
      </section>
    );
  }

  return (
    <section style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: 20, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontFamily: 'var(--di-font-display)', fontSize: 16, margin: 0, flex: 1 }}>
          Drawing Files ({state.files.length})
        </h2>
        <button className="di-btn di-btn-primary" onClick={() => dispatch({ type: 'upload', patch: { modalOpen: true } })}>
          <UploadCloud size={14} />
          Upload new files
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {state.files.map((f) => (
          <div key={f.id} className="di-panel" style={{ borderRadius: 10, padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 8,
                background: 'rgba(217,108,108,0.16)',
                color: 'var(--di-err)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <FileText size={19} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{f.name}</div>
              <div style={{ fontSize: 11, color: 'var(--di-text3)' }}>
                {formatBytes(f.sizeBytes)} · {f.sheetCount} sheets
              </div>
            </div>
            <span className="di-pill" data-tone="ok">
              Analyzed
            </span>
            <button className="di-btn" onClick={() => dispatch({ type: 'set-mode', mode: 'sheets' })}>
              Open sheets
            </button>
            <FileMenu onAction={showToast} />
          </div>
        ))}
      </div>
      <Toast message={toast} />
    </section>
  );
}
