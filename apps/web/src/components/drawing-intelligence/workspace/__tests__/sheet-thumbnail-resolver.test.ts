import { describe, expect, it } from 'vitest';
import { resolveCanonicalThumbnailUrl, deriveCanonicalSheetId } from '../sheet-thumbnail-resolver';

describe('sheet-thumbnail-resolver', () => {
  it('normalizes raw /drawings/... URL to /api/document-intelligence/drawings/...', () => {
    const result = resolveCanonicalThumbnailUrl({
      rawUrl: '/drawings/dem/run-123/pages/0/thumbnail?width=320',
    });
    expect(result).toBe('/api/document-intelligence/drawings/dem/run-123/pages/0/thumbnail?width=800');
  });

  it('normalizes persisted legacy thumbnail width to 800px', () => {
    const result = resolveCanonicalThumbnailUrl({
      rawUrl: '/api/document-intelligence/drawings/dem/run-123/pages/0/thumbnail?width=320',
    });
    expect(result).toBe('/api/document-intelligence/drawings/dem/run-123/pages/0/thumbnail?width=800');
  });

  it('normalizes raw /projects/... URL to /api/drawing-intelligence/projects/...', () => {
    const result = resolveCanonicalThumbnailUrl({
      rawUrl: '/projects/proj-456/pages/0/thumbnail',
    });
    expect(result).toBe('/api/drawing-intelligence/projects/proj-456/pages/0/thumbnail');
  });

  it('preserves already proxy-prefixed URLs (width normalized to 800)', () => {
    const result = resolveCanonicalThumbnailUrl({
      rawUrl: '/api/document-intelligence/drawings/dem/run-123/pages/0/thumbnail?width=320',
    });
    expect(result).toBe('/api/document-intelligence/drawings/dem/run-123/pages/0/thumbnail?width=800');
  });

  it('generates canonical proxy URL from runId and pageIndex when rawUrl is missing', () => {
    const result = resolveCanonicalThumbnailUrl({
      runId: 'run-789',
      pageIndex: 5,
      width: 320,
    });
    expect(result).toBe('/api/document-intelligence/drawings/dem/run-789/pages/5/thumbnail?width=320');
  });

  it('defaults to 800px width (sharp thumbnails) when width is omitted', () => {
    const result = resolveCanonicalThumbnailUrl({
      runId: 'run-789',
      pageIndex: 5,
    });
    expect(result).toBe('/api/document-intelligence/drawings/dem/run-789/pages/5/thumbnail?width=800');
  });

  it('returns null when neither rawUrl nor (runId + pageIndex) are provided', () => {
    const result = resolveCanonicalThumbnailUrl({});
    expect(result).toBeNull();
  });

  it('derives canonical sheet ID correctly', () => {
    expect(deriveCanonicalSheetId('run-xyz', 3)).toBe('run-xyz-page-3');
  });
});
