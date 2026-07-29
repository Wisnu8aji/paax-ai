import type { Sheet, SheetClassificationKey, SheetViewEntry, SheetViews } from '../di-types';
import type { NavigatorTab } from '../workspace-store';

export interface NavigableSheet {
  sheet: Sheet;
  view: SheetViewEntry;
}

export interface SheetNavigationGroup {
  key: string;
  label: string;
  rows: NavigableSheet[];
}

const CLASSIFICATION_LABELS: Record<string, string> = {
  cover: 'Cover',
  drawing_list: 'Drawing list',
  site_plan: 'Site plan',
  plan: 'Plan',
  elevation: 'Elevation',
  section: 'Section',
  detail: 'Detail',
  schedule: 'Schedule / table',
  diagram: 'Diagram',
  technical_note: 'Technical note',
  unknown: 'Needs classification',
};

const LEVEL_LABELS: Record<string, string> = {
  document: 'Document',
  site: 'Site',
  alignment: 'Alignment',
  foundation: 'Foundation',
  substructure: 'Substructure',
  ground: 'Ground floor',
  mezzanine: 'Mezzanine',
  roof: 'Roof',
  superstructure: 'Superstructure',
  detail: 'Detail',
  section: 'Section',
  elevation: 'Elevation',
  schedule: 'Schedule / table',
  unknown: 'Level needs review',
};

export function displayLevel(levelKey: string): string {
  if (LEVEL_LABELS[levelKey]) return LEVEL_LABELS[levelKey];
  const floor = levelKey.match(/^L(\d+)$/i);
  if (floor) return `Floor ${Number(floor[1])}`;
  const basement = levelKey.match(/^B(\d+)$/i);
  if (basement) return `Basement ${Number(basement[1])}`;
  return levelKey.replace(/[-_]+/g, ' ').replace(/\b\w/g, (value) => value.toUpperCase());
}

export function displayClassification(key: string): string {
  return CLASSIFICATION_LABELS[key] ?? key.replace(/[-_]+/g, ' ').replace(/\b\w/g, (value) => value.toUpperCase());
}

export function viewEntriesForMode(views: SheetViews | null | undefined, mode: NavigatorTab, sheets?: Sheet[]): SheetViewEntry[] {
  if (views) {
    if (mode === 'level') return views.level;
    if (mode === 'classification') return views.classification;
    return views.source;
  }
  if (!sheets || sheets.length === 0) return [];
  return sheets.map((sheet) => ({
    page_index: sheet.pageIndex ?? sheet.pageNumber - 1,
    page_number: sheet.pageNumber,
    level_key: (sheet.floorId || 'unknown').toLowerCase(),
    classification_key: (sheet.drawingType || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '_') as SheetClassificationKey,
    evidence_refs: [],
    status: 'classified',
    review_reason: null,
  }));
}

export function buildSheetNavigationGroups(
  views: SheetViews | null | undefined,
  sheets: Sheet[],
  mode: NavigatorTab,
): SheetNavigationGroup[] {
  const entries = viewEntriesForMode(views, mode, sheets);
  const byPage = new Map(sheets.map((sheet) => [sheet.pageIndex ?? sheet.pageNumber - 1, sheet]));
  const rows = entries.flatMap((view) => {
    const sheet = byPage.get(view.page_index);
    return sheet ? [{ sheet, view }] : [];
  });

  if (mode === 'source') {
    return [{ key: 'source', label: 'Original PDF order', rows }];
  }

  const groups = new Map<string, SheetNavigationGroup>();
  for (const row of rows) {
    const key = mode === 'level' ? row.view.level_key : row.view.classification_key;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: mode === 'level' ? displayLevel(key) : displayClassification(key),
        rows: [],
      });
    }
    groups.get(key)!.rows.push(row);
  }
  return [...groups.values()];
}

// ── Phase 06 additions ────────────────────────────────────────────────────

/**
 * Canonical three-mode navigator definition. Exported so components and tests
 * share a single source of truth for mode IDs and labels.
 */
export const SHEET_VIEW_MODES: Array<{ id: NavigatorTab; label: string }> = [
  { id: 'level', label: 'Level' },
  { id: 'classification', label: 'Classification' },
  { id: 'source', label: 'Original order' },
];

/**
 * Independent optional filter set. Filters are applied to already-fetched
 * index entries by deterministic value comparison — no network request.
 */
export interface IndexFilter {
  view?: string;
  revision?: string;
  zone?: string;
  status?: 'classified' | 'needs_review';
  level?: string;
  classification?: string;
  search?: string;
}

/**
 * Apply independent optional filters to a list of MultiAxisSheetEntry-like
 * objects. Returns entries that satisfy ALL provided filters (intersection).
 * Clearing all filters restores the full set.
 *
 * This function is synchronous and performs NO network requests.
 */
export function applyIndexFilters<T extends {
  sheet_code?: string;
  sheet_title?: string;
  page_number?: number;
  level: { value: string };
  view: { value: string };
  classification: { value: string };
  revision: { value: string };
  zone: { value: string };
  needs_review: boolean;
}>(entries: T[], filters: IndexFilter): T[] {
  return entries.filter((entry) => {
    if (filters.level && entry.level.value !== filters.level) return false;
    if (filters.view && entry.view.value !== filters.view) return false;
    if (filters.classification && entry.classification.value !== filters.classification) return false;
    if (filters.revision && entry.revision.value !== filters.revision) return false;
    if (filters.zone && entry.zone.value !== filters.zone) return false;
    if (filters.status === 'needs_review' && !entry.needs_review) return false;
    if (filters.status === 'classified' && entry.needs_review) return false;
    if (filters.search) {
      const q = filters.search.trim().toLowerCase();
      if (q) {
        const matchesSearch = [
          entry.sheet_code,
          entry.sheet_title,
          entry.page_number !== undefined ? String(entry.page_number) : undefined,
          entry.level.value,
          entry.classification.value,
          entry.view.value,
          entry.revision.value,
          entry.zone.value,
        ].some((val) => val && String(val).toLowerCase().includes(q));
        if (!matchesSearch) return false;
      }
    }
    return true;
  });
}

/**
 * Extended NavigableSheet that carries the full MultiAxisSheetEntry so the
 * navigator can display review_reasons and all axis values.
 */
export interface NavigableIndexSheet {
  sheet: Sheet | null; // null = explicit unavailable state (join miss)
  entry: {
    page_index: number;
    page_number: number;
    sheet_code: string;
    sheet_title: string;
    level: { value: string; status: string };
    view: { value: string };
    classification: { value: string };
    revision: { value: string };
    zone: { value: string };
    needs_review: boolean;
    review_reasons: string[];
  };
}

export interface IndexSheetNavigationGroup {
  key: string;
  label: string;
  rows: NavigableIndexSheet[];
}

/**
 * Build navigator groups from a DrawingPackageIndex, joining entries to Sheets
 * strictly by run_id + page_index. A missing join is an explicit unavailable
 * state — never silently dropped.
 *
 * This function is synchronous and performs NO network requests.
 */
export function buildGroupsFromIndex(
  index: { run_id: string; entries: NavigableIndexSheet['entry'][] },
  sheets: Sheet[],
  mode: NavigatorTab,
  filters: IndexFilter,
): IndexSheetNavigationGroup[] {
  const filtered = applyIndexFilters(index.entries, filters);

  const cleanIndexRunId = index.run_id.replace(/^run-/, '');
  const byPage = new Map<number, Sheet>(
    sheets
      .filter((s) => (s.runId ? s.runId.replace(/^run-/, '') === cleanIndexRunId : true))
      .map((s) => [s.pageIndex ?? s.pageNumber - 1, s]),
  );

  const rows: NavigableIndexSheet[] = filtered.map((entry) => ({
    sheet: byPage.get(entry.page_index) ?? null,
    entry,
  }));

  if (mode === 'source') {
    return [{ key: 'source', label: 'Original PDF order', rows }];
  }

  const groups = new Map<string, IndexSheetNavigationGroup>();
  for (const row of rows) {
    const key =
      mode === 'level'
        ? row.entry.level.value
        : row.entry.classification.value;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: mode === 'level' ? displayLevel(key) : displayClassification(key),
        rows: [],
      });
    }
    groups.get(key)!.rows.push(row);
  }
  return [...groups.values()];
}
