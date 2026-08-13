/*
 * PAAX render constants — Drawing Intelligence review canvas.
 *
 * Adopted (renamed PAAX) from OpenTakeOff's Apache-2.0 canvas budget/zoom
 * constants:
 *   - G:\opentakeoff-main\web\src\lib\canvasConstants.js
 *   - G:\opentakeoff-main\web\src\lib\sheets.ts (RENDER_SCALE = 2.0)
 * per Master Plan §4.A (PAAX-2026-08-05-review-render-aktual).
 *
 * Values are pure data: no DOM, no React, no functions. The pre-existing
 * PAAX tile/pyramid constants (e.g. PDF_TILE_SIZE in pdf-tile-pyramid.ts)
 * remain in place during the transition — these *_PAAX constants are the new
 * authoritative values for the detail-overlay path and pdf-scale-math.ts.
 */

/** Baseline raster density (device px per logical PDF pt) for the BASE layer. */
export const RENDER_SCALE_PAAX = 2.0;

/** Lowest allowed stage zoom (fraction of 1:1). */
export const MIN_SCALE_PAAX = 0.03;

/** Highest allowed stage zoom. UI MAX_ZOOM is raised 8 → 32. */
export const MAX_SCALE_PAAX = 32;

/** Hard cap on base raster density (≈576 px/in) — binds only on small pages. */
export const QUALITY_CEILING_PAAX = 8.0;

/** Safe max side for a single canvas (Chrome/Firefox/Safari desktop). */
export const MAX_CANVAS_DIM_PAAX = 16384;

/** Per-canvas pixel cap — the DETAIL crop's density factor uses this. */
export const MAX_CANVAS_AREA_PAAX = 16384 * 16384 * 0.9;

/** Base-raster pixel budget per panel (≈112MB RGBA; 4-up ≈ 450MB). */
export const MAX_PANEL_AREA_PAAX = 28e6;

/** Engage the detail overlay once effective zoom × dpr passes this value
 *  (base raster starts to soften in device px). */
export const DETAIL_ENGAGE_PAAX = 1.15;

/** Extra region rendered beyond the viewport (fraction of viewport size)
 *  so small pans don't expose an unfetched edge. */
export const DETAIL_MARGIN_PAAX = 0.25;

/** Backstop for a wedged detail render (ms) — long enough to never fire on a
 *  merely slow render; primary recovery is the visibilitychange retry. */
export const DETAIL_STALL_MS_PAAX = 25000;

/** Wheel/pinch quiet window before the detail view re-renders (ms). */
export const GESTURE_MS_PAAX = 140;

/** React transform-mirror sync cadence during gestures (ms). */
export const SYNC_MS_PAAX = 90;

/** Tile edge for rasterization (device px). */
export const PDF_TILE_SIZE_PAAX = 512;
