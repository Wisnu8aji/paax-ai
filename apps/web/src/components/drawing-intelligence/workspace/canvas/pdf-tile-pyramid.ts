/*
 * Tile-pyramid/LRU architecture informed by OpenTakeoff's Apache-2.0 tile
 * modules. This is an independently written PAAX implementation; pdf.js is
 * consumed as the Apache-2.0 `pdfjs-dist` dependency declared in package.json.
 */
export const PDF_TILE_SIZE = 512;
export const DEFAULT_TILE_CACHE_BYTES = 96 * 1024 * 1024;
const MIN_TILE_DENSITY = 0.25;
const MAX_TILE_DENSITY = 4;
const MAX_DETAIL_TILE_DENSITY = 32;
const PYRAMID_DENSITIES = [0.25, 0.5, 1, 2, 4] as const;

export interface PdfPageDimensions {
  pageKey: string;
  width: number;
  height: number;
}

export interface NormalizedViewport {
  x: number;
  y: number;
  width: number;
  height: number;
  zoom: number;
  dpr: number;
}

export interface PdfLogicalViewport {
  x: number;
  y: number;
  width: number;
  height: number;
  zoom: number;
  dpr: number;
}

export type TileViewport = PdfLogicalViewport;

export function toLogicalViewport(
  normalized: NormalizedViewport,
  metrics: { width: number; height: number },
): PdfLogicalViewport {
  return {
    x: normalized.x * metrics.width,
    y: normalized.y * metrics.height,
    width: normalized.width * metrics.width,
    height: normalized.height * metrics.height,
    zoom: normalized.zoom,
    dpr: normalized.dpr,
  };
}

export interface PdfTileRequest {
  key: string;
  tx: number;
  ty: number;
  x: number;
  y: number;
  width: number;
  height: number;
  density: number;
}

export function chooseTileDensity({ zoom, dpr }: Pick<TileViewport, 'zoom' | 'dpr'>): number {
  const requested = (Number.isFinite(zoom) ? zoom : 1) * (Number.isFinite(dpr) ? dpr : 1);
  const bounded = Math.min(MAX_TILE_DENSITY, Math.max(MIN_TILE_DENSITY, requested));
  return PYRAMID_DENSITIES.find((density) => density >= bounded) ?? MAX_TILE_DENSITY;
}

/**
 * Exact density for a settled visible crop. This intentionally is not used as
 * a pyramid-cache key: Task 2b should paint the small settled crop directly,
 * while interactive pan/zoom continues to reuse only quantized LRU levels.
 * Thirty-two device px per logical px covers the current 8x maximum UI zoom
 * at DPR 3 while still bounding render work. It avoids silently capping deep
 * zoom to the 4x interactive pyramid.
 */
export function chooseDetailTileDensity({ zoom, dpr }: Pick<TileViewport, 'zoom' | 'dpr'>): number {
  const requested = (Number.isFinite(zoom) ? zoom : 1) * (Number.isFinite(dpr) ? dpr : 1);
  return Math.min(MAX_DETAIL_TILE_DENSITY, Math.max(MIN_TILE_DENSITY, requested));
}

/**
 * Maps a page's logical coordinate system to bounded 512px raster tiles.
 * It contains no rendering, network, or DOM state so callers can calculate
 * the visible working set before asking the worker pool to paint it.
 */
export class PdfTilePyramid {
  private readonly dimensions: PdfPageDimensions;

  constructor(dimensions: PdfPageDimensions) {
    if (dimensions.width <= 0 || dimensions.height <= 0) throw new Error('PDF page dimensions must be positive');
    this.dimensions = dimensions;
  }

  visibleTiles(viewport: TileViewport): PdfTileRequest[] {
    const density = chooseTileDensity(viewport);
    return this.tilesForDensity(viewport, density);
  }

  visibleDetailTiles(viewport: TileViewport): PdfTileRequest[] {
    return this.tilesForDensity(viewport, chooseDetailTileDensity(viewport));
  }

  private tilesForDensity(viewport: TileViewport, density: number): PdfTileRequest[] {
    const pageWidth = Math.ceil(this.dimensions.width * density);
    const pageHeight = Math.ceil(this.dimensions.height * density);
    const left = Math.max(0, Math.floor(viewport.x * density));
    const top = Math.max(0, Math.floor(viewport.y * density));
    const right = Math.min(pageWidth, Math.ceil((viewport.x + viewport.width) * density));
    const bottom = Math.min(pageHeight, Math.ceil((viewport.y + viewport.height) * density));
    if (right <= left || bottom <= top) return [];

    const txStart = Math.floor(left / PDF_TILE_SIZE);
    const txEnd = Math.floor((right - 1) / PDF_TILE_SIZE);
    const tyStart = Math.floor(top / PDF_TILE_SIZE);
    const tyEnd = Math.floor((bottom - 1) / PDF_TILE_SIZE);
    const centreX = (viewport.x + viewport.width / 2) * density;
    const centreY = (viewport.y + viewport.height / 2) * density;
    const tiles: PdfTileRequest[] = [];

    for (let ty = tyStart; ty <= tyEnd; ty += 1) {
      for (let tx = txStart; tx <= txEnd; tx += 1) {
        const x = tx * PDF_TILE_SIZE;
        const y = ty * PDF_TILE_SIZE;
        const width = Math.min(PDF_TILE_SIZE, pageWidth - x);
        const height = Math.min(PDF_TILE_SIZE, pageHeight - y);
        tiles.push({
          key: `${this.dimensions.pageKey}:${density}:${tx}:${ty}`,
          tx,
          ty,
          x,
          y,
          width,
          height,
          density,
        });
      }
    }

    return tiles.sort((a, b) => {
      const aDistance = (a.x + a.width / 2 - centreX) ** 2 + (a.y + a.height / 2 - centreY) ** 2;
      const bDistance = (b.x + b.width / 2 - centreX) ** 2 + (b.y + b.height / 2 - centreY) ** 2;
      return aDistance - bDistance || a.ty - b.ty || a.tx - b.tx;
    });
  }
}

interface CacheEntry {
  bitmap: ImageBitmap;
  bytes: number;
}

function closeBitmap(bitmap: ImageBitmap): void {
  try {
    bitmap.close();
  } catch {
    // A transferred/previously closed bitmap is already released.
  }
}

/** Byte-bounded LRU that owns cached ImageBitmaps and always releases them. */
export class TileLru {
  private readonly entries = new Map<string, CacheEntry>();
  private totalBytes = 0;
  readonly maxBytes: number;

  constructor(maxBytes = DEFAULT_TILE_CACHE_BYTES) {
    this.maxBytes = Math.max(0, Math.min(DEFAULT_TILE_CACHE_BYTES, maxBytes));
  }

  get bytes(): number {
    return this.totalBytes;
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  get(key: string): ImageBitmap | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.bitmap;
  }

  peek(key: string): ImageBitmap | undefined {
    return this.entries.get(key)?.bitmap;
  }

  set(key: string, bitmap: ImageBitmap, bytes: number, protectedKeys: ReadonlySet<string> = new Set()): boolean {
    if (!Number.isFinite(bytes) || bytes < 0 || bytes > this.maxBytes) {
      closeBitmap(bitmap);
      return false;
    }
    const previous = this.entries.get(key);
    if (previous?.bitmap === bitmap) {
      this.totalBytes += bytes - previous.bytes;
      this.entries.delete(key);
      this.entries.set(key, { bitmap, bytes });
    } else {
      if (previous) this.remove(key);
      this.entries.set(key, { bitmap, bytes });
      this.totalBytes += bytes;
    }

    while (this.totalBytes > this.maxBytes) {
      const replaceable = [...this.entries.keys()].find((candidate) => !protectedKeys.has(candidate));
      if (!replaceable) {
        this.remove(key);
        return false;
      }
      this.remove(replaceable);
    }
    return this.entries.has(key);
  }

  dispose(): void {
    for (const entry of this.entries.values()) closeBitmap(entry.bitmap);
    this.entries.clear();
    this.totalBytes = 0;
  }

  private remove(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    this.totalBytes -= entry.bytes;
    closeBitmap(entry.bitmap);
  }
}
