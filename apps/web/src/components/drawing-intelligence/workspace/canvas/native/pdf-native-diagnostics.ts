/**
 * PAAX Native PDF Viewer — Diagnostics contract.
 *
 * This module defines the *observability surface* of the native viewer
 * so that verification, benchmark harnesses and E2E specs read ONE stable
 * contract regardless of implementation changes.
 *
 * ## DOM contract (data attributes)
 *
 * The native layer root (`[data-testid="pdf-native-page-layer"]`) MUST expose
 * the following attributes. They are the single source of truth for runtime
 * verification. All counters are monotonic within a document lifecycle
 * unless noted.
 *
 * | Attribute | Type | Meaning |
 * |---|---|---|
 * | `data-native-active-generation` | number | latest scheduler generation |
 * | `data-native-committed-generation` | number | generation committed to screen |
 * | `data-native-foreground-pending` | number | foreground crop renders in flight (0 or 1) |
 * | `data-native-worker-requests` | number | total worker render requests issued |
 * | `data-native-worker-calls` | number | total worker postMessage calls (all types) |
 * | `data-native-cache-exact-hits` | number | exact render-key cache hits |
 * | `data-native-cache-coverage-hits` | number | coverage-aware cache hits |
 * | `data-native-cache-misses` | number | cache misses (new renders needed) |
 * | `data-native-cache-bytes` | number | current crop cache bytes |
 * | `data-native-base-first-ms` | number | base-first render duration (ms) |
 * | `data-native-base-upgrade-ms` | number | base-upgrade render duration (ms) |
 * | `data-native-crop-render-ms` | number | last foreground crop render duration (ms) |
 * | `data-native-frame-interval-p95` | number | measured p95 frame interval (ms) |
 * | `data-native-render-during-gesture` | number | render requests issued while a gesture was active (MUST stay 0) |
 * | `data-native-crops-per-settle` | number | max foreground crops in one settle window (MUST be ≤ 1) |
 * | `data-native-revisit-worker-calls` | number | worker calls during a revisit of a covered region (MUST be 0) |
 * | `data-native-pixels-pinned` | "true"\|"false" | old crop remained visible during last swap |
 * | `data-native-stale-commit` | "true"\|"false" | a stale generation attempted to commit (MUST be false) |
 * | `data-native-document-key` | string | active document key |
 * | `data-native-page-index` | number | active page index |
 * | `data-native-base-ready` | "true"\|"false" | progressive base present |
 * | `data-native-crop-ready` | "true"\|"false" | a detail crop is displayed |
 *
 * ## Pure helpers
 *
 * `percentile`, `p95`, `median` are pure and unit-tested so benchmark and E2E
 * specs share identical statistics with the metrics evaluator.
 */
export const NATIVE_LAYER_TESTID = 'pdf-native-page-layer';

export const NATIVE_DIAGNOSTIC_ATTRIBUTES = [
  'data-native-active-generation',
  'data-native-committed-generation',
  'data-native-foreground-pending',
  'data-native-worker-requests',
  'data-native-worker-calls',
  'data-native-cache-exact-hits',
  'data-native-cache-coverage-hits',
  'data-native-cache-misses',
  'data-native-cache-bytes',
  'data-native-base-first-ms',
  'data-native-base-upgrade-ms',
  'data-native-crop-render-ms',
  'data-native-frame-interval-p95',
  'data-native-render-during-gesture',
  'data-native-crops-per-settle',
  'data-native-revisit-worker-calls',
  'data-native-pixels-pinned',
  'data-native-stale-commit',
  'data-native-document-key',
  'data-native-page-index',
  'data-native-base-ready',
  'data-native-crop-ready',
] as const;

/** Snapshot of the native viewer diagnostics attributes. */
export interface NativeViewerDiagnostics {
  activeGeneration: number | null;
  committedGeneration: number | null;
  foregroundPending: number;
  workerRequests: number;
  workerCalls: number;
  cacheExactHits: number;
  cacheCoverageHits: number;
  cacheMisses: number;
  cacheBytes: number;
  baseFirstMs: number | null;
  baseUpgradeMs: number | null;
  cropRenderMs: number | null;
  frameIntervalP95: number | null;
  renderDuringGesture: number;
  cropsPerSettle: number;
  revisitWorkerCalls: number;
  pixelsPinned: boolean;
  staleCommit: boolean;
  documentKey: string | null;
  pageIndex: number | null;
  baseReady: boolean;
  cropReady: boolean;
}

export const EMPTY_NATIVE_DIAGNOSTICS: NativeViewerDiagnostics = {
  activeGeneration: null,
  committedGeneration: null,
  foregroundPending: 0,
  workerRequests: 0,
  workerCalls: 0,
  cacheExactHits: 0,
  cacheCoverageHits: 0,
  cacheMisses: 0,
  cacheBytes: 0,
  baseFirstMs: null,
  baseUpgradeMs: null,
  cropRenderMs: null,
  frameIntervalP95: null,
  renderDuringGesture: 0,
  cropsPerSettle: 0,
  revisitWorkerCalls: 0,
  pixelsPinned: true,
  staleCommit: false,
  documentKey: null,
  pageIndex: null,
  baseReady: false,
  cropReady: false,
};

function toNumber(value: string | null): number | null {
  if (value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Reads the native diagnostics from the layer element. Returns null when the
 * native layer is not mounted (callers fall back to legacy diagnostics or
 * treat the scenario as native-not-active).
 */
export function readNativeDiagnostics(element: Element | null): NativeViewerDiagnostics | null {
  if (!element) return null;
  if (element.getAttribute('data-testid') !== NATIVE_LAYER_TESTID) return null;

  const attr = (name: string): string | null => element.getAttribute(name);

  return {
    activeGeneration: toNumber(attr('data-native-active-generation')),
    committedGeneration: toNumber(attr('data-native-committed-generation')),
    foregroundPending: toNumber(attr('data-native-foreground-pending')) ?? 0,
    workerRequests: toNumber(attr('data-native-worker-requests')) ?? 0,
    workerCalls: toNumber(attr('data-native-worker-calls')) ?? 0,
    cacheExactHits: toNumber(attr('data-native-cache-exact-hits')) ?? 0,
    cacheCoverageHits: toNumber(attr('data-native-cache-coverage-hits')) ?? 0,
    cacheMisses: toNumber(attr('data-native-cache-misses')) ?? 0,
    cacheBytes: toNumber(attr('data-native-cache-bytes')) ?? 0,
    baseFirstMs: toNumber(attr('data-native-base-first-ms')),
    baseUpgradeMs: toNumber(attr('data-native-base-upgrade-ms')),
    cropRenderMs: toNumber(attr('data-native-crop-render-ms')),
    frameIntervalP95: toNumber(attr('data-native-frame-interval-p95')),
    renderDuringGesture: toNumber(attr('data-native-render-during-gesture')) ?? 0,
    cropsPerSettle: toNumber(attr('data-native-crops-per-settle')) ?? 0,
    revisitWorkerCalls: toNumber(attr('data-native-revisit-worker-calls')) ?? 0,
    pixelsPinned: attr('data-native-pixels-pinned') !== 'false',
    staleCommit: attr('data-native-stale-commit') === 'true',
    documentKey: attr('data-native-document-key'),
    pageIndex: toNumber(attr('data-native-page-index')),
    baseReady: attr('data-native-base-ready') === 'true',
    cropReady: attr('data-native-crop-ready') === 'true',
  };
}

/** Finds the native layer inside a root element (document or container). */
export function queryNativeLayer(root: ParentNode = document): Element | null {
  return root.querySelector(`[data-testid="${NATIVE_LAYER_TESTID}"]`);
}

/**
 * Sorted ascending copy.
 */
export function sorted(values: number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

/**
 * Nearest-rank percentile on an unsorted sample set.
 * - empty input → null
 * - p in [0, 100]
 */
export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  if (p < 0 || p > 100) throw new Error(`percentile p must be in [0,100], got ${p}`);
  const sortedValues = sorted(values);
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil((p / 100) * sortedValues.length) - 1));
  return sortedValues[index];
}

/** 95th percentile helper (null-safe for empty input). */
export function p95(values: number[]): number | null {
  return percentile(values, 95);
}

/** Median helper (null-safe for empty input). */
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sortedValues = sorted(values);
  const middle = Math.floor(sortedValues.length / 2);
  return sortedValues.length % 2
    ? sortedValues[middle]
    : (sortedValues[middle - 1] + sortedValues[middle]) / 2;
}

/**
 * Performs a delta read of the counters on an element between two snapshots.
 * Returns the number of worker render requests issued between the snapshots.
 */
export function workerRequestsBetween(
  before: NativeViewerDiagnostics | null,
  after: NativeViewerDiagnostics | null,
): number {
  if (!before || !after) return 0;
  return Math.max(0, after.workerRequests - before.workerRequests);
}
