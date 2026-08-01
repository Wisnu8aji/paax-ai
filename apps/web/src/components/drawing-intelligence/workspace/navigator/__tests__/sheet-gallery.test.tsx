// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Sheet } from '../../di-types';
import { WorkspaceProvider, useWorkspace } from '../../workspace-store';
import { SheetGallery } from '../sheet-gallery';

const testSheets: Sheet[] = [
  {
    id: 'run-1-page-0', fileId: 'run-1', runId: 'run-1', pageIndex: 0,
    code: 'A-01', title: 'Ground Floor Plan', originalPageName: 'Page 1', pageNumber: 1,
    floorId: 'L1', floorLabel: 'Lantai 1', disciplines: ['ARC'], drawingType: 'Floor Plan',
    scale: '1:100', scaleConfirmed: true, revision: null, status: 'analyzed', reviewIssueCount: 0,
    sheetSize: 'source', analyzedOn: null, aiConfidence: 95,
    geometry: { widthMm: 600, heightMm: 800, gridX: [], gridY: [], rooms: [] },
    imageUrl: '/api/document-intelligence/drawings/dem/run-1/pages/0/thumbnail?width=320',
  },
  {
    id: 'run-1-page-1', fileId: 'run-1', runId: 'run-1', pageIndex: 1,
    code: 'A-02', title: 'Second Floor Plan', originalPageName: 'Page 2', pageNumber: 2,
    floorId: 'L2', floorLabel: 'Lantai 2', disciplines: ['ARC'], drawingType: 'Floor Plan',
    scale: '1:100', scaleConfirmed: true, revision: null, status: 'needs-review', reviewIssueCount: 1,
    sheetSize: 'source', analyzedOn: null, aiConfidence: 70,
    geometry: { widthMm: 600, heightMm: 800, gridX: [], gridY: [], rooms: [] },
    imageUrl: '/api/document-intelligence/drawings/dem/run-1/pages/1/thumbnail?width=320',
  },
];

function Bootstrap() {
  const { dispatch } = useWorkspace();
  React.useEffect(() => {
    dispatch({ type: 'replace-sheets', sheets: testSheets });
  }, [dispatch]);
  return null;
}

describe('SheetGallery real thumbnail rendering', () => {
  afterEach(cleanup);

  it('renders real img tags with lazy loading and thumbnail URLs', () => {
    render(
      <WorkspaceProvider withMockData={false}>
        <Bootstrap />
        <SheetGallery />
      </WorkspaceProvider>,
    );

    const images = screen.getAllByRole('img', { name: /Floor Plan|A-01|A-02/i }) as HTMLImageElement[];
    expect(images.length).toBe(2);
    expect(images[0].getAttribute('src')).toBe('/api/document-intelligence/drawings/dem/run-1/pages/0/thumbnail?width=320');
    expect(images[0].getAttribute('loading')).toBe('lazy');
    expect(images[1].getAttribute('src')).toBe('/api/document-intelligence/drawings/dem/run-1/pages/1/thumbnail?width=320');
  });

  it('shows explicit error state and retry button when thumbnail loading fails', () => {
    render(
      <WorkspaceProvider withMockData={false}>
        <Bootstrap />
        <SheetGallery />
      </WorkspaceProvider>,
    );

    const images = screen.getAllByRole('img', { name: /Floor Plan|A-01|A-02/i }) as HTMLImageElement[];
    // Simulate image error on first card
    fireEvent.error(images[0]);

    expect(Boolean(screen.getByText('Gambar sheet tidak dapat dimuat'))).toBe(true);
    const retryBtn = screen.getByRole('button', { name: /Coba lagi/i });
    expect(Boolean(retryBtn)).toBe(true);

    // Click retry
    fireEvent.click(retryBtn);
    // After retry, img tag is re-mounted with retry key query param
    const retriedImage = screen.getByRole('img', { name: /Ground Floor Plan|A-01/i }) as HTMLImageElement;
    expect(retriedImage.getAttribute('src')).toContain('_r=1');
  });
});
