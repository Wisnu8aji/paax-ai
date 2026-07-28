import { describe, expect, it } from 'vitest';
import { evaluateViewerPerformance, type ViewerPerformanceSample } from './performance-metrics';

const make = (run_kind: 'cold' | 'warm', first: number, overrides: Partial<ViewerPerformanceSample> = {}): ViewerPerformanceSample => ({
  fixture_sha256: 'abc', run_kind, first_contentful_page_ms: first,
  pan_frame_intervals_ms: [10, 12], long_tasks_ms: [], tile_cache_bytes: 10, js_heap_delta_bytes: 10,
  browser: 'chromium-1', viewport: { width: 1440, height: 900 }, dpr: 1, ...overrides,
});

describe('viewer performance gate', () => {
  it('passes measured values within every Feedback 1 threshold', () => {
    const result = evaluateViewerPerformance({
      baseline: [make('cold', 1000), make('warm', 600)],
      current: [make('cold', 600), make('warm', 250)],
    });
    expect(result.passed).toBe(true);
  });
  it('rejects provenance mismatch and each major threshold failure', () => {
    expect(() => evaluateViewerPerformance({ baseline: [make('cold', 1000), make('warm', 600)], current: [make('cold', 600, { fixture_sha256: 'other' }), make('warm', 250)] })).toThrow(/provenance/);
    const result = evaluateViewerPerformance({
      baseline: [make('cold', 1000), make('warm', 600)],
      current: [make('cold', 900, { pan_frame_intervals_ms: [20], long_tasks_ms: [60], tile_cache_bytes: 100 * 1024 * 1024, js_heap_delta_bytes: 100 * 1024 * 1024 }), make('warm', 500)],
    });
    expect(result.passed).toBe(false);
    expect(result.failures.length).toBeGreaterThanOrEqual(6);
  });
});
