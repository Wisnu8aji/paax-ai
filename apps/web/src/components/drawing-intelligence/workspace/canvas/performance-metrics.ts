export interface ViewerPerformanceSample {
  fixture_sha256: string;
  run_kind: 'cold' | 'warm';
  first_contentful_page_ms: number;
  pan_frame_intervals_ms: number[];
  long_tasks_ms: number[];
  tile_cache_bytes: number;
  js_heap_delta_bytes: number;
  browser: string;
  viewport: { width: number; height: number };
  dpr: number;
}

export interface ViewerPerformanceThresholds {
  coldMedianRatio: number;
  warmMedianRatio: number;
  panP95Ms: number;
  maxLongTaskMs: number;
  maxTileCacheBytes: number;
  maxHeapDeltaBytes: number;
}

export const FEEDBACK1_VIEWER_THRESHOLDS: ViewerPerformanceThresholds = {
  coldMedianRatio: 0.70,
  warmMedianRatio: 0.50,
  panP95Ms: 16.7,
  maxLongTaskMs: 50,
  maxTileCacheBytes: 96 * 1024 * 1024,
  maxHeapDeltaBytes: 96 * 1024 * 1024,
};

function median(values: number[]): number {
  if (!values.length) throw new Error('at least one performance sample is required');
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function percentile95(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
}

export function evaluateViewerPerformance(input: {
  baseline: ViewerPerformanceSample[];
  current: ViewerPerformanceSample[];
  thresholds?: ViewerPerformanceThresholds;
}): { passed: boolean; failures: string[]; metrics: Record<string, number> } {
  const thresholds = input.thresholds ?? FEEDBACK1_VIEWER_THRESHOLDS;
  if (!input.baseline.length || !input.current.length) throw new Error('baseline and current samples are required');
  const provenance = input.baseline[0];
  for (const sample of [...input.baseline, ...input.current]) {
    if (!sample.fixture_sha256 || !sample.browser || sample.dpr <= 0 || sample.viewport.width <= 0 || sample.viewport.height <= 0) {
      throw new Error('performance provenance is incomplete');
    }
    if (sample.fixture_sha256 !== provenance.fixture_sha256 || sample.browser !== provenance.browser || sample.dpr !== provenance.dpr || sample.viewport.width !== provenance.viewport.width || sample.viewport.height !== provenance.viewport.height) {
      throw new Error('baseline and current provenance do not match');
    }
  }
  const byKind = (rows: ViewerPerformanceSample[], kind: 'cold' | 'warm') => rows.filter((row) => row.run_kind === kind);
  const baselineCold = median(byKind(input.baseline, 'cold').map((row) => row.first_contentful_page_ms));
  const baselineWarm = median(byKind(input.baseline, 'warm').map((row) => row.first_contentful_page_ms));
  const currentCold = median(byKind(input.current, 'cold').map((row) => row.first_contentful_page_ms));
  const currentWarm = median(byKind(input.current, 'warm').map((row) => row.first_contentful_page_ms));
  const panP95 = percentile95(input.current.flatMap((row) => row.pan_frame_intervals_ms));
  const maxLongTask = Math.max(0, ...input.current.flatMap((row) => row.long_tasks_ms));
  const maxCache = Math.max(...input.current.map((row) => row.tile_cache_bytes));
  const maxHeap = Math.max(...input.current.map((row) => row.js_heap_delta_bytes));
  const failures: string[] = [];
  if (currentCold > baselineCold * thresholds.coldMedianRatio) failures.push('cold first-page median exceeds threshold');
  if (currentWarm > baselineWarm * thresholds.warmMedianRatio) failures.push('warm first-page median exceeds threshold');
  if (panP95 > thresholds.panP95Ms) failures.push('pan p95 frame interval exceeds threshold');
  if (maxLongTask > thresholds.maxLongTaskMs) failures.push('pan long task exceeds threshold');
  if (maxCache > thresholds.maxTileCacheBytes) failures.push('tile cache exceeds 96 MiB');
  if (maxHeap > thresholds.maxHeapDeltaBytes) failures.push('JS heap delta exceeds 96 MiB');
  return { passed: failures.length === 0, failures, metrics: { baselineCold, baselineWarm, currentCold, currentWarm, panP95, maxLongTask, maxCache, maxHeap } };
}
