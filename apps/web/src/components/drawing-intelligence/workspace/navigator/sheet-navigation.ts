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
