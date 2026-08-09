import { MAX_CANVAS_DIM_PAAX } from './pdf-render-constants';

/** Minimum scale (zoom floor = 0.08). */
export const MIN_SCALE_PAAX = 0.08;

/** Maximum scale (zoom ceiling = 32). */
export const MAX_SCALE_PAAX = 32;

/**
 * Clamps a zoom level to [MIN_SCALE_PAAX, MAX_SCALE_PAAX] (0.08..32).
 */
export function clampZoomPAAX(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1.0;
  return Math.max(MIN_SCALE_PAAX, Math.min(MAX_SCALE_PAAX, zoom));
}

/**
 * Computes the maximum allowed raster density (device px / logical pt) for a
 * crop region of size `width` x `height` (in pt).
 *
 * Bounds density such that neither canvas width nor canvas height exceeds
 * MAX_CANVAS_DIM_PAAX (16384px).
 */
export function cropDensityCapPAAX(width: number, height: number): number {
  const w = Math.max(1e-6, width);
  const h = Math.max(1e-6, height);
  return Math.min(MAX_CANVAS_DIM_PAAX / w, MAX_CANVAS_DIM_PAAX / h);
}
