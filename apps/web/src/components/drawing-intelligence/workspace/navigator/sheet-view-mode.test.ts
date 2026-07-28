import { describe, expect, it } from 'vitest';
import type { Sheet, SheetViews } from '../di-types';
import { buildSheetNavigationGroups, viewEntriesForMode } from './sheet-navigation';

const sheet = (pageIndex: number): Sheet => ({
  id: `run-page-${pageIndex}`, fileId: 'run', runId: 'run', pageIndex,
  code: `P-${pageIndex + 1}`, title: `Page ${pageIndex + 1}`, originalPageName: `Page ${pageIndex + 1}`,
  pageNumber: pageIndex + 1, floorId: 'X', floorLabel: 'X', disciplines: ['OTH'], drawingType: 'Other / Unclassified',
  scale: null, scaleConfirmed: false, revision: null, status: 'analyzed', reviewIssueCount: 0,
  sheetSize: 'source', analyzedOn: null, aiConfidence: null,
  geometry: { widthMm: 1, heightMm: 1, gridX: [], gridY: [], rooms: [] },
});

const entries = [
  { page_index: 2, page_number: 3, level_key: 'L2', classification_key: 'plan', evidence_refs: [], status: 'classified', review_reason: null },
  { page_index: 0, page_number: 1, level_key: 'document', classification_key: 'cover', evidence_refs: [], status: 'classified', review_reason: null },
  { page_index: 1, page_number: 2, level_key: 'L1', classification_key: 'plan', evidence_refs: [], status: 'classified', review_reason: null },
] as SheetViews['source'];
const views: SheetViews = {
  source: [entries[1], entries[2], entries[0]],
  level: [entries[1], entries[2], entries[0]],
  classification: [entries[1], entries[2], entries[0]],
};

it('selects immutable source order without sorting in the browser', () => {
  expect(viewEntriesForMode(views, 'source').map((row) => row.page_number)).toEqual([1, 2, 3]);
});

it('groups classification rows while retaining backend ordering within each group', () => {
  const groups = buildSheetNavigationGroups(views, [sheet(0), sheet(1), sheet(2)], 'classification');
  expect(groups.map((group) => group.key)).toEqual(['cover', 'plan']);
  expect(groups[1].rows.map((row) => row.view.page_number)).toEqual([2, 3]);
});
