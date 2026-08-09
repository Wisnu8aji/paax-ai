/**
 * Drawing Intelligence — PDF Render Constants (PAAX F2/F4 canvas constants).
 */

/** Engagement threshold zoom * dpr for detail overlay (1.15). */
export const DETAIL_ENGAGE_PAAX = 1.15;

/** Extra visible viewport margin expansion fraction per side (0.25). */
export const DETAIL_MARGIN_PAAX = 0.25;

/** Backstop stall delay (ms) for wedged detail overlay renders (25000ms). */
export const DETAIL_STALL_MS_PAAX = 25000;

/** Quiet window duration (ms) for gesture settling before crop re-eval (140ms). */
export const GESTURE_MS_PAAX = 140;

/** Maximum canvas dimension bound (16384px). */
export const MAX_CANVAS_DIM_PAAX = 16384;

/** Maximum quality ceiling multiplier for rendering density (4.0). */
export const QUALITY_CEILING_PAAX = 4.0;

/** Default base render scale multiplier (1.5). */
export const RENDER_SCALE_PAAX = 1.5;
