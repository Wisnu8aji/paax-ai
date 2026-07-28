'use client';

import { PanelLeftClose, PanelLeftOpen, Search, UploadCloud } from 'lucide-react';
import { useMemo } from 'react';
import { useWorkspace } from '../workspace-store';
import type { NavigatorTab } from '../workspace-store';
import { buildSheetNavigationGroups, displayClassification } from './sheet-navigation';

const MODES: Array<{ id: NavigatorTab; label: string }> = [
  { id: 'level', label: 'Level' },
  { id: 'classification', label: 'Classification' },
  { id: 'source', label: 'Original order' },
];

function SheetThumbnail({ sheetId }: { sheetId: string }) {
  const { state } = useWorkspace();
  const mapping = state.mappedSheets.find((candidate) => candidate.id === sheetId);
  if (!mapping?.imageUrl) {
    return (
      <div
        role="img"
        aria-label="Thumbnail unavailable"
        style={{ display: 'grid', placeItems: 'center', height: 92, background: 'var(--di-paper)', color: 'var(--di-text3)', fontSize: 10 }}
      >
        Thumbnail unavailable
      </div>
    );
  }
  return (
    <img
      src={mapping.imageUrl}
      alt="Sheet thumbnail"
      loading="lazy"
      decoding="async"
      style={{ display: 'block', width: '100%', height: 92, objectFit: 'contain', background: 'var(--di-paper)' }}
    />
  );
}

export function FileSheetNavigator() {
  const { state, dispatch } = useWorkspace();
  const views = state.analysis.packageIntelligence?.sheet_views;
  const search = state.navigator.search.trim().toLowerCase();
  const groups = useMemo(() => {
    const derived = buildSheetNavigationGroups(views, state.sheets, state.navigator.tab);
    if (!search) return derived;
    return derived
      .map((group) => ({
        ...group,
        rows: group.rows.filter(({ sheet, view }) =>
          [sheet.code, sheet.title, String(sheet.pageNumber), view.level_key, view.classification_key]
            .some((value) => String(value).toLowerCase().includes(search))),
      }))
      .filter((group) => group.rows.length > 0);
  }, [search, state.navigator.tab, state.sheets, views]);

  if (state.navigator.collapsed) {
    return (
      <aside style={{ width: 42, borderRight: '1px solid var(--di-border)', display: 'flex', justifyContent: 'center', paddingTop: 8 }}>
        <button
          className="di-icon-btn"
          aria-label="Open sheet navigation"
          onClick={() => dispatch({ type: 'navigator', patch: { collapsed: false } })}
        >
          <PanelLeftOpen size={16} />
        </button>
      </aside>
    );
  }

  return (
    <aside style={{ width: 310, minWidth: 280, borderRight: '1px solid var(--di-border)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: 10, borderBottom: '1px solid var(--di-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <strong style={{ fontSize: 12.5 }}>Sheet navigation</strong>
          <span className="di-pill" style={{ marginLeft: 'auto' }}>{state.sheets.length}</span>
          <button
            className="di-icon-btn"
            aria-label="Close sheet navigation"
            onClick={() => dispatch({ type: 'navigator', patch: { collapsed: true } })}
          >
            <PanelLeftClose size={15} />
          </button>
        </div>

        <div role="tablist" aria-label="Sheet view mode" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 4 }}>
          {MODES.map((mode) => {
            const selected = state.navigator.tab === mode.id;
            return (
              <button
                key={mode.id}
                role="tab"
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                className={selected ? 'di-btn di-btn-primary' : 'di-btn di-btn-ghost'}
                style={{ minWidth: 0, justifyContent: 'center', padding: '0 6px', fontSize: 10.5, height: 30 }}
                onClick={() => dispatch({ type: 'navigator', patch: { tab: mode.id } })}
              >
                {mode.label}
              </button>
            );
          })}
        </div>

        <label style={{ position: 'relative', display: 'block', marginTop: 8 }}>
          <Search size={13} style={{ position: 'absolute', left: 8, top: 8, color: 'var(--di-text3)' }} />
          <input
            aria-label="Search sheets"
            value={state.navigator.search}
            onChange={(event) => dispatch({ type: 'navigator', patch: { search: event.target.value } })}
            placeholder="Search title, page, level…"
            style={{ width: '100%', height: 30, paddingLeft: 28 }}
          />
        </label>
      </div>

      <div style={{ overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {!views && groups.length === 0 && (
          <div className="di-panel" style={{ padding: 10, fontSize: 11.5, color: 'var(--di-text2)' }}>
            Sheet indexes are not ready. Complete deterministic package synthesis first; no placeholder grouping is shown.
          </div>
        )}
        {views && groups.length === 0 && (
          <div style={{ padding: 8, color: 'var(--di-text3)', fontSize: 11.5 }}>No matching sheets.</div>
        )}
        {groups.map((group) => (
          <section key={group.key} aria-label={group.label}>
            <div className="di-section-title" style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
              <span>{group.label}</span><span className="di-pill" style={{ marginLeft: 'auto' }}>{group.rows.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {group.rows.map(({ sheet, view }) => {
                const active = state.activeSheetId === sheet.id;
                const needsReview = view.status === 'needs_review';
                return (
                  <article
                    key={`${view.page_index}-${sheet.id}`}
                    className="di-panel"
                    style={{ overflow: 'hidden', borderColor: active ? 'var(--di-accent)' : undefined, cursor: 'pointer' }}
                    onClick={() => dispatch({ type: 'set-active-sheet', sheetId: sheet.id })}
                  >
                    <SheetThumbnail sheetId={sheet.id} />
                    <div style={{ padding: 8 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                        <span className="di-mono" style={{ fontWeight: 700 }}>p.{view.page_number}</span>
                        <span className="di-mono" style={{ color: 'var(--di-text3)', fontSize: 10 }}>{sheet.code}</span>
                        <span className="di-pill" data-tone={needsReview ? 'warn' : 'ok'} style={{ marginLeft: 'auto' }}>
                          {needsReview ? 'Needs review' : 'Classified'}
                        </span>
                      </div>
                      <div style={{ fontSize: 11.5, marginTop: 3 }}>{sheet.title}</div>
                      <div style={{ color: 'var(--di-text3)', fontSize: 10.5, marginTop: 3 }}>
                        {displayClassification(view.classification_key)} · {view.level_key}
                      </div>
                      {needsReview && (
                        <div style={{ marginTop: 7 }}>
                          <div style={{ fontSize: 10.5, color: 'var(--di-warn)' }}>
                            {view.review_reason ?? 'Classification requires manual confirmation.'}
                          </div>
                          <button
                            className="di-btn di-btn-ghost"
                            style={{ marginTop: 5, height: 26, fontSize: 10.5 }}
                            onClick={(event) => {
                              event.stopPropagation();
                              dispatch({ type: 'set-active-sheet', sheetId: sheet.id });
                              dispatch({ type: 'set-mode', mode: 'review' });
                              dispatch({ type: 'dock', patch: { expanded: true, tab: 'review-queue' } });
                              dispatch({ type: 'set-status', message: `Review classification for p.${view.page_number}` });
                            }}
                          >
                            Review classification
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <div style={{ padding: 10, borderTop: '1px solid var(--di-border)' }}>
        <button className="di-btn" style={{ width: '100%', justifyContent: 'center' }} onClick={() => dispatch({ type: 'upload', patch: { modalOpen: true } })}>
          <UploadCloud size={14} /> Upload drawing files
        </button>
      </div>
    </aside>
  );
}
