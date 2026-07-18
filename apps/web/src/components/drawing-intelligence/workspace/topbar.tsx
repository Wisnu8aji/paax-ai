'use client';

/**
 * WorkspaceTopbar — logo, breadcrumb, search, filter, compare revisions,
 * analyze selected, share, avatar (blueprint §5, §22).
 */

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Filter, GitCompare, Search, Share2, Sparkles } from 'lucide-react';
import { useWorkspace } from './workspace-store';

const DISCIPLINE_OPTIONS: { id: string | null; label: string }[] = [
  { id: null, label: 'All' },
  { id: 'STR', label: 'STR' },
  { id: 'ARC', label: 'ARC' },
];

function useClickOutside(onOutside: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [onOutside]);
  return ref;
}

function FilterMenu() {
  const { state, dispatch } = useWorkspace();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        className="di-btn"
        title="Filter sheets by discipline"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Filter size={14} />
        Filter
        <ChevronDown size={12} style={{ opacity: 0.7 }} />
      </button>
      {open && (
        <div
          className="di-panel di-rise"
          role="menu"
          style={{
            position: 'absolute',
            top: 38,
            right: 0,
            minWidth: 160,
            borderRadius: 10,
            padding: 6,
            zIndex: 40,
            boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
          }}
        >
          <div
            className="di-section-title"
            style={{ padding: '4px 8px 6px' }}
          >
            Discipline
          </div>
          {DISCIPLINE_OPTIONS.map((opt) => {
            const active = state.navigator.disciplineFilter === opt.id;
            return (
              <button
                key={opt.label}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                className="di-btn di-btn-ghost"
                style={{
                  width: '100%',
                  justifyContent: 'flex-start',
                  height: 30,
                  background: active ? 'var(--di-accent-soft)' : undefined,
                  color: active ? 'var(--di-accent)' : undefined,
                }}
                onClick={() => {
                  dispatch({ type: 'navigator', patch: { disciplineFilter: opt.id } });
                  setOpen(false);
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CompareRevisionsButton() {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        className="di-btn"
        title="Compare revisions"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <GitCompare size={14} />
        Compare Revisions
      </button>
      {open && (
        <div
          className="di-panel di-rise"
          role="dialog"
          style={{
            position: 'absolute',
            top: 38,
            right: 0,
            width: 220,
            borderRadius: 10,
            padding: '10px 12px',
            zIndex: 40,
            fontSize: 12,
            color: 'var(--di-text2)',
            boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
          }}
        >
          No previous revisions to compare.
        </div>
      )}
    </div>
  );
}

function ShareButton() {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        className="di-btn"
        title="Share workspace link"
        onClick={() => {
          setOpen(true);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setOpen(false), 1500);
        }}
      >
        <Share2 size={14} />
        Share
      </button>
      {open && (
        <div
          className="di-panel di-fade"
          role="status"
          style={{
            position: 'absolute',
            top: 38,
            right: 0,
            borderRadius: 8,
            padding: '7px 12px',
            zIndex: 40,
            fontSize: 12,
            color: 'var(--di-text)',
            whiteSpace: 'nowrap',
            boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
          }}
        >
          Link copied
        </div>
      )}
    </div>
  );
}

export function WorkspaceTopbar({ projectName }: { projectName: string }) {
  const { state, dispatch } = useWorkspace();

  return (
    <header
      style={{
        height: 'var(--di-topbar-h)',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '0 14px',
        borderBottom: '1px solid var(--di-border)',
        background: 'var(--di-bg)',
        flexShrink: 0,
      }}
    >
      {/* Kiri: logo + breadcrumb + judul */}
      <span
        style={{
          fontFamily: 'var(--di-font-display)',
          fontWeight: 700,
          fontSize: 18,
          letterSpacing: '0.06em',
          color: 'var(--di-text)',
        }}
      >
        PAAX
      </span>

      <nav
        aria-label="Breadcrumb"
        style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--di-text3)' }}
      >
        <a
          href="#"
          className="di-btn-ghost"
          style={{
            color: 'var(--di-text3)',
            textDecoration: 'none',
            padding: '2px 3px',
            borderRadius: 4,
            transition: 'color var(--di-t-fast) var(--di-ease)',
          }}
          title="Projects"
          onClick={(e) => e.preventDefault()}
        >
          Projects
        </a>
        <span aria-hidden="true">›</span>
        <a
          href="#"
          style={{
            color: 'var(--di-text3)',
            textDecoration: 'none',
            padding: '2px 3px',
            borderRadius: 4,
          }}
          title={projectName}
          onClick={(e) => e.preventDefault()}
        >
          {projectName}
        </a>
        <span aria-hidden="true">›</span>
        <a
          href="#"
          style={{
            color: 'var(--di-text3)',
            textDecoration: 'none',
            padding: '2px 3px',
            borderRadius: 4,
          }}
          title="Building A"
          onClick={(e) => e.preventDefault()}
        >
          Building A
        </a>
      </nav>

      <span aria-hidden="true" style={{ width: 1, height: 18, background: 'var(--di-border-strong)' }} />

      <strong style={{ fontFamily: 'var(--di-font-display)', fontSize: 15, color: 'var(--di-text)', fontWeight: 600 }}>
        Drawing Intelligence
      </strong>

      {/* Tengah-kanan: search */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ position: 'relative', width: 260 }}>
          <Search
            size={14}
            style={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--di-text3)',
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            className="di-input"
            placeholder="Search sheets, items, or tags"
            value={state.gallery.search}
            onChange={(e) => dispatch({ type: 'gallery', patch: { search: e.target.value } })}
            style={{ width: '100%', paddingLeft: 30, paddingRight: 40 }}
          />
          <span
            aria-hidden="true"
            className="di-mono"
            style={{
              position: 'absolute',
              right: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: 10.5,
              color: 'var(--di-text3)',
              border: '1px solid var(--di-border)',
              borderRadius: 4,
              padding: '1px 5px',
              pointerEvents: 'none',
            }}
          >
            ⌘K
          </span>
        </div>

        <FilterMenu />
        <CompareRevisionsButton />

        <button
          type="button"
          className="di-btn di-btn-accent"
          title="Analyze the selected sheets"
          onClick={() => dispatch({ type: 'set-mode', mode: 'analyze' })}
        >
          <Sparkles size={14} />
          Analyze Selected
        </button>

        <ShareButton />

        <div
          title="Aji Ramadhan — online"
          style={{
            position: 'relative',
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: 'var(--di-accent-soft)',
            color: 'var(--di-accent)',
            border: '1px solid rgba(155, 106, 85, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 700,
            fontFamily: 'var(--di-font)',
            flexShrink: 0,
          }}
        >
          AR
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              bottom: -1,
              right: -1,
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--di-ok)',
              border: '1.5px solid var(--di-bg)',
            }}
          />
        </div>
      </div>
    </header>
  );
}
