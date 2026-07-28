const assert = { equal(actual: unknown, expected: unknown, message?: string) { if (actual !== expected) throw new Error(message ?? `expected ${String(expected)}, got ${String(actual)}`); }, deepEqual(actual: unknown, expected: unknown, message?: string) { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(message ?? `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); } };
import { buildSheetNavigationGroups } from '../../apps/web/src/components/drawing-intelligence/workspace/navigator/sheet-navigation';
import { canDisplayFinalQuantity, canHandoffQuantity } from '../../apps/web/src/components/drawing-intelligence/workspace/quantity-authority';
import { evaluateViewerPerformance } from '../../apps/web/src/components/drawing-intelligence/workspace/canvas/performance-metrics';

const sheets = [
  { id: 'S1', fileId: 'F1', pageNumber: 1, pageIndex: 0, name: 'Cover', discipline: 'A', level: 'document', status: 'ready' },
  { id: 'S2', fileId: 'F1', pageNumber: 2, pageIndex: 1, name: 'L1 plan', discipline: 'A', level: 'L1', status: 'ready' },
] as any;
const entry = (page_index: number, page_number: number, level_key: string, classification_key: string) => ({
  page_index, page_number, level_key, classification_key, evidence_refs: [`EV-${page_number}`], status: 'classified',
});
const views = {
  level: [entry(0, 1, 'document', 'cover'), entry(1, 2, 'L1', 'plan')],
  classification: [entry(0, 1, 'document', 'cover'), entry(1, 2, 'L1', 'plan')],
  source: [entry(0, 1, 'document', 'cover'), entry(1, 2, 'L1', 'plan')],
};
assert.deepEqual(buildSheetNavigationGroups(views as any, sheets, 'source')[0].rows.map((row) => row.sheet.pageNumber), [1, 2]);
assert.equal(buildSheetNavigationGroups(views as any, sheets, 'level')[1].label, 'Floor 1');
assert.equal(canDisplayFinalQuantity({ sourceAuthority: 'measurement_fact' }), false);
assert.equal(canDisplayFinalQuantity({ sourceAuthority: 'core_engine' }), true);
assert.equal(canHandoffQuantity({ sourceAuthority: 'core_engine', status: 'verified', unit: 'm³' }), true);
assert.equal(canHandoffQuantity({ sourceAuthority: 'core_engine', status: 'needs_review', unit: 'm³' }), false);
assert.equal(canHandoffQuantity({ sourceAuthority: 'measurement_fact', status: 'verified', unit: 'm³' }), false);

const sample = (kind: 'cold' | 'warm', ms: number) => ({
  fixture_sha256: 'abc', run_kind: kind, first_contentful_page_ms: ms,
  pan_frame_intervals_ms: [8, 10, 12], long_tasks_ms: [], tile_cache_bytes: 1024,
  js_heap_delta_bytes: 1024, browser: 'chromium-1', viewport: { width: 1440, height: 900 }, dpr: 1,
});
const evaluation = evaluateViewerPerformance({
  baseline: [sample('cold', 1000), sample('warm', 500)],
  current: [sample('cold', 650), sample('warm', 240)],
});
assert.equal(evaluation.passed, true);
console.log('Feedback 1 TypeScript contract verification passed.');
