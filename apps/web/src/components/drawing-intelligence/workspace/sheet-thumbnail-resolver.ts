/**
 * Canonical Thumbnail URL Resolver & Identity Helper.
 * Single source of truth for thumbnail proxy URLs across Navigation & Gallery.
 */

export interface ThumbnailResolutionInput {
  runId?: string | null;
  pageIndex?: number | null;
  rawUrl?: string | null;
  width?: number;
  fallback?: boolean;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Returns a canonical, proxy-prefixed Next.js thumbnail URL.
 * Raw backend paths starting with `/drawings/` are ALWAYS mapped to `/api/document-intelligence/drawings/...`.
 * Raw backend paths starting with `/projects/` are ALWAYS mapped to `/api/drawing-intelligence/projects/...`.
 */
export function resolveCanonicalThumbnailUrl(input: ThumbnailResolutionInput): string | null {
  const width = input.width ?? 800;
  const raw = optionalString(input.rawUrl);

  // Normalize thumbnail width to the sharp default (800px) even when the
  // persisted raw URL carries a legacy width (e.g. ?width=320 from the
  // 30-Jul analysis). The backend cap is le=800, so 800 is always served.
  const sharpenWidth = (url: string): string => {
    if (!url.includes('thumbnail')) return url;
    const parsed = new URL(url, 'http://127.0.0.1');
    if (parsed.searchParams.has('width')) {
      parsed.searchParams.set('width', String(width));
    }
    return `${parsed.pathname}${parsed.search}`;
  };

  if (raw) {
    if (raw.startsWith('/drawings/')) {
      return sharpenWidth(`/api/document-intelligence${raw}`);
    }
    if (raw.startsWith('/projects/')) {
      return sharpenWidth(`/api/drawing-intelligence${raw}`);
    }
    if (
      raw.startsWith('/api/document-intelligence') ||
      raw.startsWith('/api/drawing-intelligence') ||
      raw.startsWith('http://') ||
      raw.startsWith('https://') ||
      raw.startsWith('/')
    ) {
      return sharpenWidth(raw);
    }
  }

  if (input.fallback === false) {
    return null;
  }

  const runId = optionalString(input.runId);
  const pageIndex = typeof input.pageIndex === 'number' && Number.isFinite(input.pageIndex) && input.pageIndex >= 0 ? input.pageIndex : null;

  if (runId && pageIndex !== null) {
    return `/api/document-intelligence/drawings/dem/${runId}/pages/${pageIndex}/thumbnail?width=${width}`;
  }

  return null;
}

/**
 * Derives the canonical sheet identity key for matching across data layers.
 */
export function deriveCanonicalSheetId(runId: string, pageIndex: number): string {
  return `${runId}-page-${pageIndex}`;
}
