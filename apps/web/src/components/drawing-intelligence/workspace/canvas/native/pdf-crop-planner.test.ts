import { describe, expect, it } from 'vitest';

import {
  BASE_OVERSCAN_DEFAULT,
  BASE_OVERSCAN_MAX,
  BASE_OVERSCAN_MIN,
  DIRECTIONAL_OVERSCAN_DEFAULT,
  DIRECTIONAL_OVERSCAN_MAX,
  DIRECTIONAL_OVERSCAN_MIN,
  MAX_NEIGHBOR_PREFETCH,
  planCrop,
  planNeighborPrefetch,
} from './pdf-crop-planner';
import { containsRegion } from './pdf-render-geometry';

const PAGE = { width: 2482, height: 1747 };
const VIEWPORT = { x: 700, y: 400, width: 800, height: 600 };

describe('planCrop — base overscan', () => {
  it('expands the viewport by the default 25% base overscan on every side', () => {
    const plan = planCrop({ viewport: VIEWPORT, pageBounds: PAGE, density: 2 });
    expect(plan).not.toBeNull();
    expect(plan!.kind).toBe('base');
    expect(plan!.baseOverscan).toBeCloseTo(BASE_OVERSCAN_DEFAULT);
    // 800×1.5 wide, 600×1.5 tall, centered on the viewport.
    expect(plan!.region.width).toBeCloseTo(1200);
    expect(plan!.region.height).toBeCloseTo(900);
    expect(plan!.region.x).toBeCloseTo(700 - 800 * 0.25);
    expect(plan!.region.y).toBeCloseTo(400 - 600 * 0.25);
    expect(containsRegion(plan!.region, VIEWPORT)).toBe(true);
  });

  it('clamps overscan into the 20–25% band regardless of input', () => {
    const tooSmall = planCrop({ viewport: VIEWPORT, pageBounds: PAGE, density: 2, baseOverscan: 0.05 });
    const tooBig = planCrop({ viewport: VIEWPORT, pageBounds: PAGE, density: 2, baseOverscan: 0.9 });
    expect(tooSmall!.baseOverscan).toBeCloseTo(BASE_OVERSCAN_MIN);
    expect(tooBig!.baseOverscan).toBeCloseTo(BASE_OVERSCAN_MAX);
    // Overscan must cover the viewport in both cases.
    expect(containsRegion(tooSmall!.region, VIEWPORT)).toBe(true);
    expect(containsRegion(tooBig!.region, VIEWPORT)).toBe(true);
  });

  it('clamps the region to page bounds and reports clamped=true', () => {
    // Viewport fully inside the page (right edge 2450 ≤ 2482) but its 25%
    // overscan (right 2487.5) overflows and is trimmed.
    const nearEdge = { x: 2300, y: 1600, width: 150, height: 100 };
    const plan = planCrop({ viewport: nearEdge, pageBounds: PAGE, density: 2 });
    expect(plan).not.toBeNull();
    expect(plan!.clamped).toBe(true);
    expect(plan!.region.x + plan!.region.width).toBeLessThanOrEqual(PAGE.width);
    expect(plan!.region.y + plan!.region.height).toBeLessThanOrEqual(PAGE.height);
    expect(plan!.region.x).toBeGreaterThanOrEqual(0);
    expect(plan!.region.y).toBeGreaterThanOrEqual(0);
    expect(containsRegion(plan!.region, nearEdge)).toBe(true);
  });

  it('keeps the viewport covered when page clamp trims the overscan', () => {
    const corner = { x: 2300, y: 1600, width: 100, height: 100 };
    const plan = planCrop({ viewport: corner, pageBounds: PAGE, density: 2 });
    expect(plan).not.toBeNull();
    expect(containsRegion(plan!.region, corner)).toBe(true);
  });

  it('returns null for a degenerate viewport or invalid density', () => {
    expect(planCrop({ viewport: { x: 0, y: 0, width: 0, height: 100 }, pageBounds: PAGE, density: 2 })).toBeNull();
    expect(planCrop({ viewport: VIEWPORT, pageBounds: PAGE, density: 0 })).toBeNull();
    expect(planCrop({ viewport: VIEWPORT, pageBounds: PAGE, density: Number.NaN })).toBeNull();
    expect(planCrop({ viewport: VIEWPORT, pageBounds: { width: 0, height: 100 }, density: 2 })).toBeNull();
  });
});

describe('planCrop — directional overscan', () => {
  it('biases the leading edge toward the pan direction (right)', () => {
    const plan = planCrop({ viewport: VIEWPORT, pageBounds: PAGE, density: 2, panDirection: 'right' });
    expect(plan).not.toBeNull();
    expect(plan!.kind).toBe('directional');
    expect(plan!.directionalOverscan).toBeCloseTo(DIRECTIONAL_OVERSCAN_DEFAULT);
    // Right edge extends by directional overscan (50%), left edge by base (25%).
    const rightEdge = plan!.region.x + plan!.region.width;
    expect(rightEdge).toBeCloseTo(700 + 800 + 800 * DIRECTIONAL_OVERSCAN_DEFAULT);
    expect(plan!.region.x).toBeCloseTo(700 - 800 * BASE_OVERSCAN_DEFAULT);
    expect(containsRegion(plan!.region, VIEWPORT)).toBe(true);
  });

  it('biases toward the left pan direction', () => {
    const plan = planCrop({ viewport: VIEWPORT, pageBounds: PAGE, density: 2, panDirection: 'left' });
    expect(plan!.region.x).toBeCloseTo(700 - 800 * DIRECTIONAL_OVERSCAN_DEFAULT);
    const rightEdge = plan!.region.x + plan!.region.width;
    expect(rightEdge).toBeCloseTo(700 + 800 + 800 * BASE_OVERSCAN_DEFAULT);
  });

  it('biases toward the down pan direction', () => {
    const plan = planCrop({ viewport: VIEWPORT, pageBounds: PAGE, density: 2, panDirection: 'down' });
    expect(plan!.region.y + plan!.region.height).toBeCloseTo(400 + 600 + 600 * DIRECTIONAL_OVERSCAN_DEFAULT);
    expect(plan!.region.y).toBeCloseTo(400 - 600 * BASE_OVERSCAN_DEFAULT);
  });

  it('clamps directional overscan into the 40–60% band', () => {
    const tooSmall = planCrop({ viewport: VIEWPORT, pageBounds: PAGE, density: 2, panDirection: 'right', directionalOverscan: 0.1 });
    const tooBig = planCrop({ viewport: VIEWPORT, pageBounds: PAGE, density: 2, panDirection: 'right', directionalOverscan: 0.95 });
    expect(tooSmall!.directionalOverscan).toBeCloseTo(DIRECTIONAL_OVERSCAN_MIN);
    expect(tooBig!.directionalOverscan).toBeCloseTo(DIRECTIONAL_OVERSCAN_MAX);
  });

  it('still covers the viewport at the page edge', () => {
    const nearRight = { x: 2100, y: 400, width: 200, height: 100 };
    const plan = planCrop({ viewport: nearRight, pageBounds: PAGE, density: 2, panDirection: 'right' });
    expect(containsRegion(plan!.region, nearRight)).toBe(true);
    expect(plan!.region.x + plan!.region.width).toBeLessThanOrEqual(PAGE.width);
  });
});

describe('planNeighborPrefetch — max one neighbor', () => {
  it('returns null when the prefetch budget is already consumed', () => {
    const plan = planNeighborPrefetch({
      viewport: VIEWPORT,
      pageBounds: PAGE,
      density: 2,
      activePrefetches: MAX_NEIGHBOR_PREFETCH,
      panDirection: 'right',
    });
    expect(plan).toBeNull();
  });

  it('emits at most one plan per call (never a grid)', () => {
    const plan = planNeighborPrefetch({
      viewport: VIEWPORT,
      pageBounds: PAGE,
      density: 2,
      activePrefetches: 0,
      panDirection: 'right',
    });
    expect(plan).not.toBeNull();
    // A single plan object — no array, no 3×3 grid.
    expect('region' in plan!).toBe(true);
    expect(plan!.direction).toBe('right');
  });

  it('extends toward the preferred pan direction when space exists', () => {
    const plan = planNeighborPrefetch({
      viewport: { x: 700, y: 400, width: 800, height: 600 },
      pageBounds: PAGE,
      density: 2,
      activePrefetches: 0,
      panDirection: 'right',
    });
    expect(plan!.direction).toBe('right');
    expect(plan!.region.x + plan!.region.width).toBeGreaterThan(700 + 800);
  });

  it('falls back to the largest free side when no pan direction is given', () => {
    // Viewport on the left → most free space on the right.
    const plan = planNeighborPrefetch({
      viewport: { x: 0, y: 400, width: 800, height: 600 },
      pageBounds: PAGE,
      density: 2,
      activePrefetches: 0,
    });
    expect(plan!.direction).toBe('right');
  });

  it('returns null when the viewport already touches the page edge in the pan direction', () => {
    const plan = planNeighborPrefetch({
      viewport: { x: 2300, y: 400, width: 800, height: 600 },
      pageBounds: PAGE,
      density: 2,
      activePrefetches: 0,
      panDirection: 'right',
    });
    expect(plan).toBeNull();
  });

  it('returns null for a degenerate viewport or invalid density', () => {
    expect(
      planNeighborPrefetch({ viewport: { x: 0, y: 0, width: 0, height: 100 }, pageBounds: PAGE, density: 2, activePrefetches: 0 }),
    ).toBeNull();
    expect(planNeighborPrefetch({ viewport: VIEWPORT, pageBounds: PAGE, density: 0, activePrefetches: 0 })).toBeNull();
  });

  it('clamps the prefetch region to the page', () => {
    const plan = planNeighborPrefetch({
      viewport: { x: 2000, y: 400, width: 400, height: 600 },
      pageBounds: PAGE,
      density: 2,
      activePrefetches: 0,
      panDirection: 'right',
    });
    expect(plan).not.toBeNull();
    expect(plan!.region.x + plan!.region.width).toBeLessThanOrEqual(PAGE.width);
    expect(plan!.region.x).toBeGreaterThanOrEqual(0);
  });

  it('respects the overscan hint for how far to extend', () => {
    const small = planNeighborPrefetch({
      viewport: VIEWPORT,
      pageBounds: PAGE,
      density: 2,
      activePrefetches: 0,
      panDirection: 'right',
      overscan: 0.25,
    });
    const large = planNeighborPrefetch({
      viewport: VIEWPORT,
      pageBounds: PAGE,
      density: 2,
      activePrefetches: 0,
      panDirection: 'right',
      overscan: 0.75,
    });
    expect(small!.region.width).toBeLessThan(large!.region.width);
  });
});
