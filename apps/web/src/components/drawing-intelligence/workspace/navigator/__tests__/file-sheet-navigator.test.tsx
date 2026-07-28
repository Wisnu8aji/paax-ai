// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Sheet, SheetViews } from '../../di-types';
import { WorkspaceProvider, useWorkspace } from '../../workspace-store';
import { FileSheetNavigator } from '../file-sheet-navigator';

const sheets: Sheet[] = [
  {
    id: 'run-1-page-1', fileId: 'run-1', runId: 'run-1', pageIndex: 1,
    code: 'A-02', title: 'Second Floor Plan', originalPageName: 'Page 2', pageNumber: 2,
    floorId: 'L2', floorLabel: 'Lantai 2', disciplines: ['ARC'], drawingType: 'Floor Plan',
    scale: '1:100', scaleConfirmed: true, revision: null, status: 'needs-review', reviewIssueCount: 1,
    sheetSize: 'source', analyzedOn: null, aiConfidence: 70,
    geometry: { widthMm: 600, heightMm: 800, gridX: [], gridY: [], rooms: [] },
  },
  {
    id: 'run-1-page-0', fileId: 'run-1', runId: 'run-1', pageIndex: 0,
    code: 'A-01', title: 'Cover', originalPageName: 'Page 1', pageNumber: 1,
    floorId: 'DOCUMENT', floorLabel: 'Document', disciplines: ['ARC'], drawingType: 'Cover / Index',
    scale: null, scaleConfirmed: false, revision: null, status: 'analyzed', reviewIssueCount: 0,
    sheetSize: 'source', analyzedOn: null, aiConfidence: 99,
    geometry: { widthMm: 600, heightMm: 800, gridX: [], gridY: [], rooms: [] },
  },
];

const source = [
  { page_index: 0, page_number: 1, level_key: 'document', classification_key: 'cover', evidence_refs: ['ev-0'], status: 'classified', review_reason: null },
  { page_index: 1, page_number: 2, level_key: 'L2', classification_key: 'plan', evidence_refs: ['ev-1'], status: 'needs_review', review_reason: 'level_requires_confirmation' },
] as SheetViews['source'];
const views: SheetViews = {
  source,
  level: [source[0], source[1]],
  classification: [source[0], source[1]],
};

function Bootstrap() {
  const { dispatch } = useWorkspace();
  React.useEffect(() => {
    dispatch({ type: 'replace-sheets', sheets });
    dispatch({ type: 'replace-mapped-sheets', sheets: [
      { id: 'run-1-page-0', runId: 'run-1', pageIndex: 0, number: 'A-01', title: 'Cover', discipline: 'architecture', level: 'document', scale: null, revision: null, confidence: 0.99, widthPx: 600, heightPx: 800, status: 'complete', imageUrl: '/thumb/0' },
      { id: 'run-1-page-1', runId: 'run-1', pageIndex: 1, number: 'A-02', title: 'Second Floor Plan', discipline: 'architecture', level: 'L2', scale: '1:100', revision: null, confidence: 0.7, widthPx: 600, heightPx: 800, status: 'complete', imageUrl: '/thumb/1' },
    ] });
    dispatch({ type: 'analysis', patch: { packageIntelligence: { sheet_views: views } as any } });
  }, [dispatch]);
  return null;
}

function renderNavigator() {
  return render(
    <WorkspaceProvider withMockData={false}>
      <Bootstrap />
      <FileSheetNavigator />
    </WorkspaceProvider>,
  );
}

describe('canonical sheet navigator', () => {
  afterEach(cleanup);

  it('shows exactly Level, Classification, and Original order', async () => {
    renderNavigator();
    const tabs = await screen.findAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Level', 'Classification', 'Original order']);
    expect(screen.getByRole('tab', { name: 'Level' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByText(/^Analyzed$/i)).toBeNull();
    expect(screen.queryByText(/Level Tree/i)).toBeNull();
  });

  it('keeps original PDF page order and uses real thumbnail URLs', async () => {
    renderNavigator();
    fireEvent.click(await screen.findByRole('tab', { name: 'Original order' }));
    const pages = await screen.findAllByText(/^p\.[12]$/);
    expect(pages.map((node) => node.textContent)).toEqual(['p.1', 'p.2']);
    const images = screen.getAllByRole('img');
    expect(images.map((image) => image.getAttribute('src'))).toEqual(['/thumb/0', '/thumb/1']);
  });

  it('explains unknown/review state and opens manual review path', async () => {
    renderNavigator();
    expect(await screen.findByText('level_requires_confirmation')).toBeTruthy();
    const btn = screen.getByRole('button', { name: 'Review classification' });
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
  });
});
