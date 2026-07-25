'use client';

/** Ask PAAX slide-over kontekstual (blueprint §20). */

import { useEffect, useRef, useState } from 'react';
import { FileText, SendHorizonal, X } from 'lucide-react';
import { useWorkspace, useActiveSheet, useSelectedElement } from '../workspace-store';

const SUGGESTED_PROMPTS = [
  'Explain why this column needs review.',
  'Show all source sheets used for this quantity.',
  'Compare column types across the detected levels.',
  'Summarize unresolved structural issues.',
];

export function AskPaaxPanel() {
  const { state, dispatch, askPaax } = useWorkspace();
  const sheet = useActiveSheet();
  const selectedElement = useSelectedElement();
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [state.askPaax.messages.length, state.askPaax.busy]);

  if (!state.askPaax.open) return null;

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    askPaax(trimmed);
    setDraft('');
  };

  return (
    <aside
      className="di-panel di-rise"
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: 380,
        zIndex: 55,
        display: 'flex',
        flexDirection: 'column',
        borderTop: 'none',
        borderBottom: 'none',
        borderRight: 'none',
        boxShadow: '-8px 0 24px rgba(0,0,0,0.35)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px',
          borderBottom: '1px solid var(--di-border)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <strong style={{ fontFamily: 'var(--di-font-display)', fontSize: 15, color: 'var(--di-text)' }}>Ask PAAX</strong>
          <span className="di-pill" data-tone="accent">BETA</span>
        </div>
        <button className="di-icon-btn" onClick={() => dispatch({ type: 'ask-paax', patch: { open: false } })}>
          <X size={16} />
        </button>
      </div>

      {/* Context chips */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '10px 16px 0' }}>
        {sheet && (
          <span
            className="di-mono"
            style={{
              fontSize: 10.5,
              padding: '3px 8px',
              borderRadius: 999,
              background: 'var(--di-panel2)',
              color: 'var(--di-text2)',
            }}
          >
            Context: {sheet.code}
          </span>
        )}
        {selectedElement && (
          <span
            className="di-mono"
            style={{
              fontSize: 10.5,
              padding: '3px 8px',
              borderRadius: 999,
              background: 'var(--di-accent-soft)',
              color: 'var(--di-accent)',
            }}
          >
            {selectedElement.code}
          </span>
        )}
      </div>

      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {state.askPaax.messages.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            <span style={{ fontSize: 11.5, color: 'var(--di-text3)' }}>Try asking:</span>
            {SUGGESTED_PROMPTS.map((p) => (
              <button
                key={p}
                className="di-btn di-btn-ghost"
                style={{ justifyContent: 'flex-start', height: 'auto', padding: '8px 10px', whiteSpace: 'normal', textAlign: 'left' }}
                onClick={() => submit(p)}
              >
                {p}
              </button>
            ))}
          </div>
        )}

        {state.askPaax.messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div
              style={{
                maxWidth: '86%',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                padding: '8px 12px',
                borderRadius: 12,
                fontSize: 12.5,
                background: m.role === 'user' ? 'var(--di-accent-soft)' : 'var(--di-panel2)',
                color: 'var(--di-text)',
              }}
            >
              <span>{m.text}</span>
              {m.refs && m.refs.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 2 }}>
                  {m.refs.map((ref, ri) => (
                    <button
                      key={ri}
                      className="di-btn di-btn-ghost"
                      style={{ justifyContent: 'flex-start', height: 24, fontSize: 10.5, padding: '0 8px' }}
                      onClick={() => {
                        if (ref.sheetId) {
                          dispatch({ type: 'set-active-sheet', sheetId: ref.sheetId });
                          dispatch({ type: 'set-mode', mode: 'review' });
                        }
                        if (ref.elementId) {
                          dispatch({ type: 'select-element', elementId: ref.elementId });
                        }
                      }}
                    >
                      <FileText size={11} /> {ref.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {state.askPaax.busy && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--di-text3)' }}>
            <span>PAAX is thinking</span>
            <span style={{ display: 'inline-flex', gap: 2 }}>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="di-pulse"
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: '50%',
                    background: 'var(--di-text3)',
                    display: 'inline-block',
                    animationDelay: `${i * 0.2}s`,
                  }}
                />
              ))}
            </span>
          </div>
        )}
      </div>

      <form
        style={{ display: 'flex', gap: 8, padding: 14, borderTop: '1px solid var(--di-border)', flexShrink: 0 }}
        onSubmit={(e) => {
          e.preventDefault();
          submit(draft);
        }}
      >
        <input
          className="di-input"
          style={{ flex: 1 }}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask a question about this sheet…"
        />
        <button type="submit" className="di-btn di-btn-primary" style={{ width: 36, padding: 0, justifyContent: 'center' }}>
          <SendHorizonal size={15} />
        </button>
      </form>
    </aside>
  );
}
