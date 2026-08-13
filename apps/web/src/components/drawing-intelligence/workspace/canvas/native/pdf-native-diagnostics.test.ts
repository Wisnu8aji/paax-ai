/**
 * Unit tests for the native viewer diagnostics contract.
 *
 * The diagnostics module is pure (no DOM required for statistics) so it is
 * fully testable in vitest. DOM attribute reading is exercised with jsdom.
 */
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  EMPTY_NATIVE_DIAGNOSTICS,
  NATIVE_LAYER_TESTID,
  median,
  p95,
  percentile,
  queryNativeLayer,
  readNativeDiagnostics,
  sorted,
  workerRequestsBetween,
} from './pdf-native-diagnostics';

describe('percentile / p95 / median (pure statistics)', () => {
  it('returns null for empty samples', () => {
    expect(percentile([], 95)).toBeNull();
    expect(p95([])).toBeNull();
    expect(median([])).toBeNull();
  });

  it('computes nearest-rank percentiles', () => {
    // 1..100 sorted ascending: p95 = 95, p50 = 50, p0 = 1, p100 = 100
    const samples = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(samples, 95)).toBe(95);
    expect(percentile(samples, 50)).toBe(50);
    expect(percentile(samples, 0)).toBe(1);
    expect(percentile(samples, 100)).toBe(100);
  });

  it('p95 matches percentile(95)', () => {
    const samples = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
    expect(p95(samples)).toBe(percentile(samples, 95));
  });

  it('computes median for odd and even lengths', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('does not mutate the input', () => {
    const samples = [5, 3, 1, 4, 2];
    const copy = [...samples];
    sorted(samples);
    expect(samples).toEqual(copy);
  });

  it('throws for out-of-range percentile', () => {
    expect(() => percentile([1], -1)).toThrow();
    expect(() => percentile([1], 101)).toThrow();
  });
});

describe('readNativeDiagnostics (DOM contract)', () => {
  function fakeLayer(attrs: Record<string, string>): Element {
    const element = document.createElement('div');
    element.setAttribute('data-testid', NATIVE_LAYER_TESTID);
    for (const [name, value] of Object.entries(attrs)) {
      element.setAttribute(name, value);
    }
    return element;
  }

  it('returns null when element is missing or not the native layer', () => {
    expect(readNativeDiagnostics(null)).toBeNull();
    const other = document.createElement('div');
    other.setAttribute('data-testid', 'pdf-page-layer');
    expect(readNativeDiagnostics(other)).toBeNull();
  });

  it('parses numeric attributes and booleans', () => {
    const layer = fakeLayer({
      'data-native-active-generation': '7',
      'data-native-committed-generation': '7',
      'data-native-foreground-pending': '1',
      'data-native-worker-requests': '42',
      'data-native-worker-calls': '57',
      'data-native-cache-exact-hits': '3',
      'data-native-cache-coverage-hits': '4',
      'data-native-cache-misses': '2',
      'data-native-cache-bytes': '1048576',
      'data-native-base-first-ms': '812',
      'data-native-base-upgrade-ms': '2103',
      'data-native-crop-render-ms': '96',
      'data-native-frame-interval-p95': '16.2',
      'data-native-render-during-gesture': '0',
      'data-native-crops-per-settle': '1',
      'data-native-revisit-worker-calls': '0',
      'data-native-pixels-pinned': 'true',
      'data-native-stale-commit': 'false',
      'data-native-document-key': 'run-abc:0',
      'data-native-page-index': '0',
      'data-native-base-ready': 'true',
      'data-native-crop-ready': 'true',
    });
    const diagnostics = readNativeDiagnostics(layer);
    expect(diagnostics).not.toBeNull();
    expect(diagnostics?.activeGeneration).toBe(7);
    expect(diagnostics?.foregroundPending).toBe(1);
    expect(diagnostics?.workerRequests).toBe(42);
    expect(diagnostics?.cacheExactHits).toBe(3);
    expect(diagnostics?.cacheCoverageHits).toBe(4);
    expect(diagnostics?.cacheMisses).toBe(2);
    expect(diagnostics?.cacheBytes).toBe(1048576);
    expect(diagnostics?.baseFirstMs).toBe(812);
    expect(diagnostics?.baseUpgradeMs).toBe(2103);
    expect(diagnostics?.cropRenderMs).toBe(96);
    expect(diagnostics?.frameIntervalP95).toBe(16.2);
    expect(diagnostics?.pixelsPinned).toBe(true);
    expect(diagnostics?.staleCommit).toBe(false);
    expect(diagnostics?.documentKey).toBe('run-abc:0');
    expect(diagnostics?.baseReady).toBe(true);
    expect(diagnostics?.cropReady).toBe(true);
  });

  it('defaults missing attributes to zero / false / null safely', () => {
    const layer = fakeLayer({ 'data-native-base-ready': 'true' });
    const diagnostics = readNativeDiagnostics(layer);
    expect(diagnostics).not.toBeNull();
    expect(diagnostics?.workerRequests).toBe(0);
    expect(diagnostics?.foregroundPending).toBe(0);
    expect(diagnostics?.activeGeneration).toBeNull();
    expect(diagnostics?.pixelsPinned).toBe(true); // absent → pinned (safe default)
    expect(diagnostics?.staleCommit).toBe(false);
  });

  it('treats non-numeric attribute values as null/0 without throwing', () => {
    const layer = fakeLayer({
      'data-native-active-generation': 'not-a-number',
      'data-native-worker-requests': 'abc',
    });
    const diagnostics = readNativeDiagnostics(layer);
    expect(diagnostics?.activeGeneration).toBeNull();
    expect(diagnostics?.workerRequests).toBe(0);
  });

  it('queryNativeLayer finds the layer under a container', () => {
    const container = document.createElement('div');
    const layer = fakeLayer({ 'data-native-base-ready': 'true' });
    container.appendChild(layer);
    expect(queryNativeLayer(container)).toBe(layer);
    expect(queryNativeLayer(document.createElement('div'))).toBeNull();
  });
});

describe('workerRequestsBetween', () => {
  it('computes the delta of worker render requests', () => {
    const before = { ...EMPTY_NATIVE_DIAGNOSTICS, workerRequests: 10 };
    const after = { ...EMPTY_NATIVE_DIAGNOSTICS, workerRequests: 13 };
    expect(workerRequestsBetween(before, after)).toBe(3);
  });

  it('returns 0 when a snapshot is missing or the counter went backwards', () => {
    expect(workerRequestsBetween(null, EMPTY_NATIVE_DIAGNOSTICS)).toBe(0);
    expect(workerRequestsBetween(EMPTY_NATIVE_DIAGNOSTICS, null)).toBe(0);
    const before = { ...EMPTY_NATIVE_DIAGNOSTICS, workerRequests: 5 };
    const after = { ...EMPTY_NATIVE_DIAGNOSTICS, workerRequests: 2 };
    expect(workerRequestsBetween(before, after)).toBe(0);
  });
});
