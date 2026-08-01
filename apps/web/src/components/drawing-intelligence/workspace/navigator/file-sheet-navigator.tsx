'use client';

import { PanelLeftClose, PanelLeftOpen, Search, UploadCloud, AlertTriangle } from 'lucide-react';
import { useMemo } from 'react';
import { useWorkspace } from '../workspace-store';
import type { NavigatorTab } from '../workspace-store';
import {
  buildSheetNavigationGroups,
  displayClassification,
  buildGroupsFromIndex,
  SHEET_VIEW_MODES,
  type IndexFilter,
} from './sheet-navigation';

import { CanonicalSheetThumbnail } from './canonical-sheet-thumbnail';

function SheetThumbnail({ sheetId }: { sheetId: string }) {
  const { state } = useWorkspace();
  const mapping = state.mappedSheets.find((candidate) => candidate.id === sheetId);
  const sheet = state.sheets.find((candidate) => candidate.id === sheetId);

  return (
    <CanonicalSheetThumbnail
      runId={sheet?.runId ?? mapping?.runId}
      pageIndex={sheet?.pageIndex ?? mapping?.pageIndex}
      rawUrl={sheet?.imageUrl || mapping?.imageUrl}
      alt="Sheet thumbnail"
      height={92}
    />
  );
}

/** Filter chip that dispatches a single axis filter. */
function FilterPill({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      className={active ? 'di-btn di-btn-primary' : 'di-btn di-btn-ghost'}
      style={{ height: 22, fontSize: 10, padding: '0 8px' }}
      onClick={onToggle}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}

export function FileSheetNavigator() {
  const { state, dispatch } = useWorkspace();
  const views = state.analysis.packageIntelligence?.sheet_views;
  const packageIndex = state.drawingPackageIndex;
  const indexError = state.drawingPackageIndexError;
  const filters = state.indexFilters;
  const search = state.navigator.search.trim().toLowerCase();

  // Build the active filter object for index-based rendering
  const activeFilter: IndexFilter = useMemo(() => ({
    view: filters.view ?? undefined,
    revision: filters.revision ?? undefined,
    zone: filters.zone ?? undefined,
    status: filters.status ?? undefined,
    level: filters.level ?? undefined,
    classification: filters.classification ?? undefined,
    search: search || undefined,
  }), [filters, search]);

  const hasActiveFilters = Object.values(filters).some(v => v !== null) || Boolean(search);

  // Derive unique available option values for view, revision, zone from validated DrawingPackageIndex
  const availableViews = useMemo(() => {
    if (!packageIndex) return [];
    return Array.from(new Set(packageIndex.entries.map((e: any) => String(e.view.value)))).sort();
  }, [packageIndex]);

  const availableRevisions = useMemo(() => {
    if (!packageIndex) return [];
    return Array.from(new Set(packageIndex.entries.map((e: any) => String(e.revision.value)))).sort();
  }, [packageIndex]);

  const availableZones = useMemo(() => {
    if (!packageIndex) return [];
    return Array.from(new Set(packageIndex.entries.map((e: any) => String(e.zone.value)))).sort();
  }, [packageIndex]);

  // Index-based groups: use DrawingPackageIndex when available for the active run
  const indexGroups = useMemo(() => {
    if (!packageIndex) return null;
    return buildGroupsFromIndex(packageIndex, state.sheets, state.navigator.tab, activeFilter);
  }, [packageIndex, state.sheets, state.navigator.tab, activeFilter]);

  // Fallback: legacy SheetViews-based groups
  const legacyGroups = useMemo(() => {
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

        {/* Three-mode tab selector — canonical SHEET_VIEW_MODES */}
        <div role="tablist" aria-label="Sheet view mode" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 4 }}>
          {SHEET_VIEW_MODES.map((mode) => {
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

        {/* Independent optional filters — applied client-side, no refetch */}
        {packageIndex && (
          <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
            {/* Status filter */}
            <FilterPill
              label="Needs review"
              active={filters.status === 'needs_review'}
              onToggle={() => dispatch({
                type: 'set-index-filters',
                patch: { status: filters.status === 'needs_review' ? null : 'needs_review' },
              })}
            />

            {/* View filter */}
            {availableViews.length > 0 && (
              <select
                aria-label="Filter by view"
                className="di-select"
                style={{ height: 22, fontSize: 10, padding: '0 4px', borderRadius: 4, border: '1px solid var(--di-border)', background: 'var(--di-paper)', color: 'var(--di-text)' }}
                value={filters.view ?? ''}
                onChange={(e) => dispatch({
                  type: 'set-index-filters',
                  patch: { view: e.target.value || null },
                })}
              >
                <option value="">All views</option>
                {availableViews.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            )}

            {/* Revision filter */}
            {availableRevisions.length > 0 && (
              <select
                aria-label="Filter by revision"
                className="di-select"
                style={{ height: 22, fontSize: 10, padding: '0 4px', borderRadius: 4, border: '1px solid var(--di-border)', background: 'var(--di-paper)', color: 'var(--di-text)' }}
                value={filters.revision ?? ''}
                onChange={(e) => dispatch({
                  type: 'set-index-filters',
                  patch: { revision: e.target.value || null },
                })}
              >
                <option value="">All revisions</option>
                {availableRevisions.map((r) => (
                  <option key={r} value={r}>Rev {r}</option>
                ))}
              </select>
            )}

            {/* Zone filter */}
            {availableZones.length > 0 && (
              <select
                aria-label="Filter by zone"
                className="di-select"
                style={{ height: 22, fontSize: 10, padding: '0 4px', borderRadius: 4, border: '1px solid var(--di-border)', background: 'var(--di-paper)', color: 'var(--di-text)' }}
                value={filters.zone ?? ''}
                onChange={(e) => dispatch({
                  type: 'set-index-filters',
                  patch: { zone: e.target.value || null },
                })}
              >
                <option value="">All zones</option>
                {availableZones.map((z) => (
                  <option key={z} value={z}>Zone {z}</option>
                ))}
              </select>
            )}

            {/* Clear all filters */}
            {hasActiveFilters && (
              <button
                className="di-btn di-btn-ghost"
                style={{ height: 22, fontSize: 10, padding: '0 8px', color: 'var(--di-warn)' }}
                onClick={() => {
                  dispatch({ type: 'clear-index-filters' });
                  if (search) dispatch({ type: 'navigator', patch: { search: '' } });
                }}
                aria-label="Clear all filters"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* Index error banner */}
        {indexError && (
          <div
            role="alert"
            style={{ marginTop: 6, padding: '6px 8px', borderRadius: 6, background: 'var(--di-warn-bg, rgba(255,180,0,0.1))', fontSize: 10.5, color: 'var(--di-warn)', display: 'flex', gap: 6 }}
          >
            <AlertTriangle size={13} style={{ flexShrink: 0 }} />
            <span>Index load issue: {indexError}. Previous index retained.</span>
          </div>
        )}

        <label style={{ position: 'relative', display: 'block', marginTop: 8 }}>
          <Search size={13} style={{ position: 'absolute', left: 8, top: 8, color: 'var(--di-text3)' }} />
          <input
            aria-label="Search sheets"
            value={state.navigator.search}
            onChange={(event) => dispatch({ type: 'navigator', patch: { search: event.target.value } })}
            placeholder="Search title, page, levelâ€¦"
            style={{ width: '100%', height: 30, paddingLeft: 28 }}
          />
        </label>
      </div>

      <div style={{ overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Index-based rendering (Phase 06) */}
        {indexGroups !== null && indexGroups.map((group) => (
          <section key={group.key} aria-label={group.label}>
            <div className="di-section-title" style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
              <span>{group.label}</span><span className="di-pill" style={{ marginLeft: 'auto' }}>{group.rows.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {group.rows.map(({ sheet: rowSheet, entry }) => {
                const active = rowSheet ? state.activeSheetId === rowSheet.id : false;
                const needsReview = entry.needs_review;
                const sheetId = rowSheet?.id ?? null;
                // Thumbnail: look up from mappedSheets by run_id + page_index
                const mappingId = `${packageIndex!.run_id}-page-${entry.page_index}`;
                const mapping = state.mappedSheets.find(m => m.id === mappingId);

                return (
                  <article
                    key={`idx-${entry.page_index}`}
                    className="di-panel"
                    style={{ overflow: 'hidden', borderColor: active ? 'var(--di-accent)' : undefined, cursor: sheetId ? 'pointer' : 'default', opacity: rowSheet ? 1 : 0.6 }}
                    onClick={() => sheetId && dispatch({ type: 'set-active-sheet', sheetId })}
                  >
                    <CanonicalSheetThumbnail
                      runId={packageIndex?.run_id}
                      pageIndex={entry.page_index}
                      rawUrl={mapping?.imageUrl}
                      alt={`Thumbnail page ${entry.page_number}`}
                      height={92}
                    />
                    <div style={{ padding: 8 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                        <span className="di-mono" style={{ fontWeight: 700 }}>p.{entry.page_number}</span>
                        <span className="di-mono" style={{ color: 'var(--di-text3)', fontSize: 10 }}>{entry.sheet_code}</span>
                        <span className="di-pill" data-tone={needsReview ? 'warn' : 'ok'} style={{ marginLeft: 'auto' }}>
                          {needsReview ? 'Needs review' : 'Classified'}
                        </span>
                      </div>
                      <div style={{ fontSize: 11.5, marginTop: 3 }}>{entry.sheet_title}</div>
                      <div style={{ color: 'var(--di-text3)', fontSize: 10.5, marginTop: 3 }}>
                        {displayClassification(entry.classification.value)} Â· {entry.level.value}
                      </div>
                      {/* Unknown axis / review reasons â€” displayed verbatim, no auto-commit */}
                      {needsReview && entry.review_reasons.length > 0 && (
                        <div style={{ marginTop: 7 }}>
                          <div style={{ fontSize: 10.5, color: 'var(--di-warn)' }}>
                            {entry.review_reasons.join(' Â· ')}
                          </div>
                          <button
                            className="di-btn di-btn-ghost"
                            style={{ marginTop: 5, height: 26, fontSize: 10.5 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (sheetId) dispatch({ type: 'set-active-sheet', sheetId });
                              dispatch({ type: 'set-mode', mode: 'review' });
                              dispatch({ type: 'dock', patch: { expanded: true, tab: 'review-queue' } });
                              dispatch({ type: 'set-status', message: `Review classification for p.${entry.page_number}` });
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

        {/* Fallback: legacy SheetViews-based rendering when no index available */}
        {indexGroups === null && (
          <>
            {!views && legacyGroups.length === 0 && (
              <div className="di-panel" style={{ padding: 10, fontSize: 11.5, color: 'var(--di-text2)' }}>
                Sheet indexes are not ready. Complete deterministic package synthesis first; no placeholder grouping is shown.
              </div>
            )}
            {views && legacyGroups.length === 0 && (
              <div style={{ padding: 8, color: 'var(--di-text3)', fontSize: 11.5 }}>No matching sheets.</div>
            )}
            {legacyGroups.map((group) => (
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
                            {displayClassification(view.classification_key)} Â· {view.level_key}
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
          </>
        )}

        {/* Empty state when index is loaded but filters produce no results */}
        {indexGroups !== null && indexGroups.length === 0 && (
          <div style={{ padding: 8, color: 'var(--di-text3)', fontSize: 11.5 }}>
            {hasActiveFilters ? 'No sheets match the active filters.' : 'No sheets in this view.'}
          </div>
        )}
      </div>

      <div style={{ padding: 10, borderTop: '1px solid var(--di-border)' }}>
        <button className="di-btn" style={{ width: '100%', justifyContent: 'center' }} onClick={() => dispatch({ type: 'upload', patch: { modalOpen: true } })}>
          <UploadCloud size={14} /> Upload drawing files
        </button>
      </div>
    </aside>
  );
}
