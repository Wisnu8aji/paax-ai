'use client';

/** Upload Drawing Files modal + progress per-file (blueprint §8–9, gambar 3/4). */

import { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  FileArchive,
  FileImage,
  FileText,
  ShieldCheck,
  UploadCloud,
  X,
} from 'lucide-react';
import { useWorkspace } from '../workspace-store';
import { formatBytes, type UploadEntry } from '../di-types';

const SUPPORTED_FORMATS = ['PDF', 'DWG', 'DXF', 'PNG', 'JPG', 'TIFF'];

function kindFromName(name: string): UploadEntry['kind'] {
  const ext = name.split('.').pop()?.toUpperCase() ?? '';
  if (ext === 'JPEG') return 'JPG';
  if (['PDF', 'DWG', 'DXF', 'PNG', 'JPG', 'TIFF'].includes(ext)) return ext as UploadEntry['kind'];
  return 'PDF';
}

function FileIcon({ kind }: { kind: UploadEntry['kind'] }) {
  const bg =
    kind === 'PDF'
      ? 'rgba(217,108,108,0.16)'
      : kind === 'DWG' || kind === 'DXF'
        ? 'rgba(108,140,184,0.16)'
        : 'rgba(85,182,133,0.16)';
  const fg = kind === 'PDF' ? 'var(--di-err)' : kind === 'DWG' || kind === 'DXF' ? 'var(--di-info)' : 'var(--di-ok)';
  const Icon = kind === 'PDF' ? FileText : kind === 'DWG' || kind === 'DXF' ? FileArchive : FileImage;
  return (
    <div
      style={{
        width: 34,
        height: 34,
        borderRadius: 8,
        background: bg,
        color: fg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <Icon size={17} />
    </div>
  );
}

export function UploadDrawingModal() {
  const { state, dispatch, startUploadSimulation, triggerProjectSynthesis } = useWorkspace();
  const [pending, setPending] = useState<{ file?: File; name: string; sizeBytes: number; kind: UploadEntry['kind'] }[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const open = state.upload.modalOpen;
  const entries = state.upload.entries;
  const running = state.upload.running;
  const showProgress = running || entries.length > 0;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dispatch({ type: 'upload', patch: { modalOpen: false } });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, dispatch]);

  useEffect(() => {
    if (!open) setPending([]);
  }, [open]);

  if (!open) return null;

  const close = () => dispatch({ type: 'upload', patch: { modalOpen: false } });

  const addFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files).map((f) => ({
      file: f,
      name: f.name,
      sizeBytes: f.size,
      kind: kindFromName(f.name),
    }));
    setPending((prev) => [...prev, ...list]);
  };

  const doneCount = entries.filter((e) => e.status === 'completed').length;
  const totalPct = entries.length > 0 ? Math.round(entries.reduce((s, e) => s + e.progress, 0) / entries.length) : 0;
  const allDone = entries.length > 0 && doneCount === entries.length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(4, 8, 12, 0.66)',
        backdropFilter: 'blur(2px)',
      }}
      onClick={close}
    >
      <div
        className="di-panel di-rise"
        style={{ width: 720, maxWidth: '92vw', maxHeight: '88vh', overflow: 'auto', borderRadius: 16, padding: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        {!showProgress ? (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 6 }}>
              <UploadCloud size={22} style={{ color: 'var(--di-action)', marginTop: 2 }} />
              <div style={{ flex: 1 }}>
                <h2 style={{ fontFamily: 'var(--di-font-display)', fontSize: 18, margin: 0 }}>Upload Drawing Files</h2>
                <p style={{ fontSize: 12.5, color: 'var(--di-text2)', margin: '4px 0 0' }}>
                  Upload your drawings to start AI-powered analysis and intelligence.
                </p>
              </div>
              <button className="di-icon-btn" onClick={close} aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 18 }}>
              {/* Dropzone */}
              <div
                style={{
                  border: `2px dashed ${dragOver ? 'var(--di-action)' : 'var(--di-border-strong)'}`,
                  borderRadius: 12,
                  padding: 36,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                  gap: 10,
                  background: dragOver ? 'var(--di-accent-soft)' : 'transparent',
                  transition: 'background 160ms ease, border-color 160ms ease',
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  addFiles(e.dataTransfer.files);
                }}
              >
                <UploadCloud size={34} style={{ color: 'var(--di-action)' }} />
                <div style={{ fontSize: 13.5, fontWeight: 500 }}>Drag &amp; drop drawing files here</div>
                <div style={{ fontSize: 11.5, color: 'var(--di-text3)' }}>or</div>
                <button className="di-btn di-btn-primary" onClick={() => inputRef.current?.click()}>
                  Select files
                </button>
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  hidden
                  onChange={(e) => addFiles(e.target.files)}
                />

                <div style={{ marginTop: 16, width: '100%' }}>
                  <div style={{ fontSize: 10.5, color: 'var(--di-text3)', marginBottom: 6, letterSpacing: '0.03em' }}>
                    Supported formats
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, justifyContent: 'center' }}>
                    {SUPPORTED_FORMATS.map((f) => (
                      <span
                        key={f}
                        className="di-mono"
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          border: '1px solid var(--di-border-strong)',
                          borderRadius: 5,
                          padding: '3px 6px',
                          color: 'var(--di-text2)',
                        }}
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--di-text3)', marginTop: 8 }}>Max file size: 500 MB per file</div>
                </div>

                {pending.length > 0 && (
                  <div style={{ width: '100%', marginTop: 10, textAlign: 'left' }}>
                    <div style={{ fontSize: 10.5, color: 'var(--di-text3)', marginBottom: 4 }}>
                      {pending.length} file(s) selected
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {pending.map((f, i) => (
                        <div key={`${f.name}-${i}`} style={{ fontSize: 11, color: 'var(--di-text2)', display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{f.name}</span>
                          <span className="di-mono">{formatBytes(f.sizeBytes)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Preflight checklist */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Preflight checklist</div>
                {[
                  { title: 'Vector PDF preferred', sub: 'Ensures best accuracy for AI analysis' },
                  { title: 'One sheet per page recommended', sub: 'Improves classification and sheet mapping' },
                  { title: 'Naming will be auto-classified by AI', sub: 'Discipline, floor, and type detection' },
                ].map((item) => (
                  <div key={item.title} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <CheckCircle2 size={16} style={{ color: 'var(--di-ok)', marginTop: 1, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 500 }}>{item.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--di-text2)' }}>{item.sub}</div>
                    </div>
                  </div>
                ))}

                <div
                  style={{
                    marginTop: 4,
                    display: 'flex',
                    gap: 8,
                    padding: 12,
                    borderRadius: 10,
                    background: 'var(--di-info-bg)',
                    border: '1px solid var(--di-info-bd)',
                  }}
                >
                  <ShieldCheck size={16} style={{ color: 'var(--di-info)', flexShrink: 0, marginTop: 1 }} />
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 500 }}>Secure &amp; private</div>
                    <div style={{ fontSize: 11, color: 'var(--di-text2)' }}>
                      Your files are encrypted in transit and at rest. We never share your data.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 22 }}>
              <button className="di-btn" onClick={close}>
                Cancel
              </button>
              <button
                className="di-btn di-btn-primary"
                disabled={pending.length === 0}
                onClick={() => startUploadSimulation(pending)}
              >
                Upload files
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
              <h2 style={{ fontFamily: 'var(--di-font-display)', fontSize: 16, margin: 0, flex: 1 }}>
                Uploading {entries.length} files
              </h2>
              <button className="di-icon-btn" onClick={close} aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {entries.map((e) => (
                <div key={e.id} className="di-panel" style={{ borderRadius: 10, padding: 10, display: 'flex', gap: 10, alignItems: 'center' }}>
                  <FileIcon kind={e.kind} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {e.fileName}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        {e.status === 'completed' ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--di-ok)' }}>
                            <CheckCircle2 size={13} /> {e.statusLabel}
                          </span>
                        ) : (
                          <span style={{ fontSize: 11.5, color: 'var(--di-text2)' }}>{e.statusLabel}</span>
                        )}
                        <span className="di-mono" style={{ fontSize: 11, width: 34, textAlign: 'right' }}>
                          {e.progress}%
                        </span>
                      </div>
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--di-text3)', marginBottom: 6 }}>
                      {formatBytes(e.sizeBytes)} · {e.kind}
                    </div>
                    <div style={{ height: 4, borderRadius: 2, background: 'var(--di-panel2)', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${e.progress}%`,
                          background: 'var(--di-action)',
                          transition: 'width 200ms ease',
                        }}
                      />
                    </div>
                  </div>
                  <button className="di-icon-btn" style={{ width: 24, height: 24, flexShrink: 0 }} aria-label="Remove">
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>

            {allDone && (
              <div
                className="di-rise"
                style={{
                  marginTop: 14,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: 12,
                  borderRadius: 10,
                  background: 'var(--di-ok-bg)',
                  border: '1px solid var(--di-ok-bd)',
                }}
              >
                <CheckCircle2 size={16} style={{ color: 'var(--di-ok)', flexShrink: 0 }} />
                <div style={{ fontSize: 12, color: 'var(--di-text)', flex: 1 }}>
                  Upload complete. Extracting in background...
                </div>
                <button
                  className="di-btn di-btn-primary"
                  onClick={() => {
                    close();
                    if (entries.some(e => e.runId)) {
                      dispatch({ type: 'set-mode', mode: 'analyze' });
                    }
                  }}
                >
                  Configure Analysis
                </button>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18 }}>
              {running && (
                <span
                  className="di-spin"
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    border: '2px solid var(--di-border-strong)',
                    borderTopColor: 'var(--di-action)',
                    display: 'inline-block',
                  }}
                />
              )}
              <span style={{ fontSize: 12, color: 'var(--di-text2)' }}>
                {running ? `Uploading ${entries.length} files` : 'Upload finished'} · {doneCount} of {entries.length} files uploaded
              </span>
              <div style={{ flex: 1 }} />
              <span className="di-mono" style={{ fontSize: 18, fontWeight: 700 }}>
                {totalPct}%
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button className="di-btn di-btn-ghost" onClick={() => setPending([])}>
                + Add more
              </button>
              <button className="di-btn" onClick={close}>
                Cancel
              </button>
              <button className="di-btn di-btn-primary" disabled={!allDone} onClick={close}>
                Continue
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
