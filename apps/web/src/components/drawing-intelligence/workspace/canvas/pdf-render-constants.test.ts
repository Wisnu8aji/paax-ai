import { describe, expect, it } from 'vitest';

import {
  DETAIL_ENGAGE_PAAX,
  DETAIL_MARGIN_PAAX,
  DETAIL_STALL_MS_PAAX,
  GESTURE_MS_PAAX,
  MAX_CANVAS_AREA_PAAX,
  MAX_CANVAS_DIM_PAAX,
  MAX_PANEL_AREA_PAAX,
  MAX_SCALE_PAAX,
  MIN_SCALE_PAAX,
  PDF_TILE_SIZE_PAAX,
  QUALITY_CEILING_PAAX,
  RENDER_SCALE_PAAX,
  SYNC_MS_PAAX,
} from './pdf-render-constants';

describe('pdf-render-constants (PAAX)', () => {
  it('carries the OpenTakeOff-adopted baseline and zoom bounds', () => {
    expect(RENDER_SCALE_PAAX).toBe(2.0);
    expect(MIN_SCALE_PAAX).toBe(0.03);
    expect(MAX_SCALE_PAAX).toBe(32);
    expect(QUALITY_CEILING_PAAX).toBe(8.0);
  });

  it('carries the canvas budget caps', () => {
    expect(MAX_CANVAS_DIM_PAAX).toBe(16384);
    expect(MAX_CANVAS_AREA_PAAX).toBeCloseTo(16384 * 16384 * 0.9, 6);
    expect(MAX_CANVAS_AREA_PAAX).toBe(241_591_910.4);
    expect(MAX_PANEL_AREA_PAAX).toBe(28e6);
  });

  it('carries the detail overlay tuning values', () => {
    expect(DETAIL_ENGAGE_PAAX).toBe(1.15);
    expect(DETAIL_MARGIN_PAAX).toBe(0.25);
    expect(DETAIL_STALL_MS_PAAX).toBe(25000);
    expect(GESTURE_MS_PAAX).toBe(140);
    expect(SYNC_MS_PAAX).toBe(90);
  });

  it('carries the PAAX tile size', () => {
    expect(PDF_TILE_SIZE_PAAX).toBe(512);
  });

  it('keeps the legacy pyramid tile size constant untouched (transition guard)', () => {
    // The pre-existing PDF_TILE_SIZE lives in pdf-tile-pyramid.ts and must
    // keep working during the transition; the PAAX constant mirrors it.
    expect(PDF_TILE_SIZE_PAAX).toBe(512);
  });
});
