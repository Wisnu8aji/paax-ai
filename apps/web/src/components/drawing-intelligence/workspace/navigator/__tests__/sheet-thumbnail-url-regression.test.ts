import { describe, expect, it } from 'vitest';
import { mapRawDemSheetToSheet } from '../../sheet-view-mapping';
import { mapProjectDemSheet } from '../../sheet-mapping';

describe('Phase A Regression — Thumbnail URL Normalization', () => {
  it('mapRawDemSheetToSheet MUST normalize raw /drawings/ backend URLs to /api/document-intelligence/drawings/', () => {
    const backendRawItem = {
      run_id: '514fb7f2-26fd-5816-9f22-a4a2412688bf',
      page_index: 0,
      sheet_number: 'A-101',
      sheet_title: 'DENAH LANTAI DASAR',
      thumbnail_url: '/drawings/dem/514fb7f2-26fd-5816-9f22-a4a2412688bf/pages/0/thumbnail?width=320',
    };

    const sheet = mapRawDemSheetToSheet(backendRawItem);

    // FAILURE EXPECTED ON UNFIXED CODE: sheet.imageUrl will be raw '/drawings/dem/...'
    expect(sheet.imageUrl).toBe(
      '/api/document-intelligence/drawings/dem/514fb7f2-26fd-5816-9f22-a4a2412688bf/pages/0/thumbnail?width=320'
    );
  });

  it('both mapRawDemSheetToSheet and mapProjectDemSheet MUST produce identical canonical proxy URLs', () => {
    const rawBackendItem = {
      run_id: '514fb7f2-26fd-5816-9f22-a4a2412688bf',
      page_index: 0,
      sheet_number: 'A-101',
      sheet_title: 'DENAH LANTAI DASAR',
      thumbnail_url: '/drawings/dem/514fb7f2-26fd-5816-9f22-a4a2412688bf/pages/0/thumbnail?width=320',
    };

    const mappedDem = mapProjectDemSheet(rawBackendItem as any);
    const mappedSheet = mapRawDemSheetToSheet(rawBackendItem);

    expect(mappedSheet.imageUrl).toBe(mappedDem.imageUrl);
  });
});
