import type { PdfTileRequest } from './pdf-tile-pyramid';

export interface LogicalRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GenerationCoverageInput {
  viewport: LogicalRect;
  page: LogicalRect;
  desiredVisibleTiles: readonly PdfTileRequest[];
  readyKeys: ReadonlySet<string>;
}

const DEFAULT_READY_THRESHOLD = 0.99;

function emptyRect(): LogicalRect {
  return { x: 0, y: 0, width: 0, height: 0 };
}

function isPositiveFiniteRect(rect: LogicalRect): boolean {
  return (
    Number.isFinite(rect.x) &&
    Number.isFinite(rect.y) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height) &&
    rect.width > 0 &&
    rect.height > 0
  );
}

function intersection(a: LogicalRect, b: LogicalRect): LogicalRect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  if (x2 <= x || y2 <= y) return null;
  return { x, y, width: x2 - x, height: y2 - y };
}

export function tileLogicalRect(tile: PdfTileRequest): LogicalRect {
  if (!Number.isFinite(tile.density) || tile.density <= 0) return emptyRect();
  const x = tile.x / tile.density;
  const y = tile.y / tile.density;
  const width = tile.width / tile.density;
  const height = tile.height / tile.density;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
    return emptyRect();
  }
  return { x, y, width, height };
}

export function clippedUnionCoverage(viewport: LogicalRect, page: LogicalRect, rects: readonly LogicalRect[]): number {
  if (!isPositiveFiniteRect(viewport) || !isPositiveFiniteRect(page)) return 0;
  const clipped = intersection(viewport, page);
  if (!clipped) return 0;
  const clippedArea = clipped.width * clipped.height;

  const clippedRects: LogicalRect[] = [];
  for (const rect of rects) {
    if (!isPositiveFiniteRect(rect)) continue;
    const clippedRect = intersection(rect, clipped);
    if (clippedRect) clippedRects.push(clippedRect);
  }
  if (clippedRects.length === 0) return 0;

  const xBoundaries = new Set<number>();
  for (const rect of clippedRects) {
    xBoundaries.add(rect.x);
    xBoundaries.add(rect.x + rect.width);
  }
  const xs = [...xBoundaries].sort((a, b) => a - b);

  let coveredArea = 0;
  for (let i = 0; i < xs.length - 1; i += 1) {
    const left = xs[i];
    const right = xs[i + 1];
    if (right <= left) continue;
    const intervals: Array<[number, number]> = [];
    for (const rect of clippedRects) {
      if (rect.x <= left && rect.x + rect.width >= right) {
        intervals.push([rect.y, rect.y + rect.height]);
      }
    }
    intervals.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let mergedBottom = Number.NEGATIVE_INFINITY;
    let stripLength = 0;
    for (const [top, bottom] of intervals) {
      if (top > mergedBottom) {
        stripLength += bottom - top;
        mergedBottom = bottom;
      } else if (bottom > mergedBottom) {
        stripLength += bottom - mergedBottom;
        mergedBottom = bottom;
      }
    }
    coveredArea += (right - left) * stripLength;
  }

  const coverage = coveredArea / clippedArea;
  return Math.min(1, Math.max(0, coverage));
}

export function generationCoverage(input: GenerationCoverageInput): number {
  const rects: LogicalRect[] = [];
  for (const tile of input.desiredVisibleTiles) {
    if (!input.readyKeys.has(tile.key)) continue;
    rects.push(tileLogicalRect(tile));
  }
  return clippedUnionCoverage(input.viewport, input.page, rects);
}

function sanitizedThreshold(threshold: number): number {
  if (!Number.isFinite(threshold)) return DEFAULT_READY_THRESHOLD;
  return Math.min(1, Math.max(0, threshold));
}

export function isGenerationReady(input: GenerationCoverageInput, threshold = DEFAULT_READY_THRESHOLD): boolean {
  return generationCoverage(input) >= sanitizedThreshold(threshold);
}
