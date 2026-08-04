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

  if (raw) {
    if (raw.startsWith('/drawings/')) {
      return `/api/document-intelligence${raw}`;
    }
    if (raw.startsWith('/projects/')) {
      return `/api/drawing-intelligence${raw}`;
    }
    if (
      raw.startsWith('/api/document-intelligence') ||
      raw.startsWith('/api/drawing-intelligence') ||
      raw.startsWith('http://') ||
      raw.startsWith('https://') ||
      raw.startsWith('/')
    ) {
      return raw;
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
