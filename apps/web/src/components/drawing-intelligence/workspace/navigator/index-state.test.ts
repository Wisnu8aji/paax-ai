/**
 * index-state.test.ts — ORION-F1 Fase 0: index state selectors and
 * validateAndMergeIndex behavior (stale rejection, malformed rejection,
 * previous-index retention).
 *
 * The hook (use-backend-sync) and the proxy decide *when* to fetch; this
 * module is the pure decision layer that guarantees a bad or stale response
 * can never overwrite a good index the user is already looking at.
 */
import { describe, expect, it } from 'vitest';
import type { DrawingPackageIndex } from '@paax/schemas';
import {
  isIndexStale,
  selectActiveRunIndex,
  validateAndMergeIndex,
  type IndexState,
} from './index-state';

function makeEntry(pageIndex: number) {
  return {
    page_index: pageIndex,
    page_number: pageIndex + 1,
    sheet_code: `S-${pageIndex + 1}`,
    sheet_title: `Sheet ${pageIndex + 1}`,
    level: { value: 'ground', status: 'confirmed' as const },
    view: { value: 'plan', status: 'confirmed' as const },
    classification: { value: 'plan', status: 'confirmed' as const },
    revision: { value: 'unknown', status: 'unknown' as const },
    zone: { value: 'unknown', status: 'unknown' as const },
    needs_review: false,
    review_reasons: [],
  };
}

function makeIndex(runId: string, entries: ReturnType<typeof makeEntry>[]): DrawingPackageIndex {
  return {
    package_id: `pkg-${runId}`,
    run_id: runId,
    document_name: 'test.pdf',
    document_sha256: 'sha256:abc',
    total_pages: entries.length,
    created_at: '2026-08-06T00:00:00Z',
    version: 1,
    entries,
    unknown_axis_count: entries.filter((e) => e.needs_review).length,
    needs_review_count: entries.filter((e) => e.needs_review).length,
  };
}

describe('selectActiveRunIndex', () => {
  it('returns null when no index is stored', () => {
    const state: IndexState = { activeRunId: 'run-1', index: null, indexError: null };
    expect(selectActiveRunIndex(state)).toBeNull();
  });

  it('returns the index only when run_id matches the active run', () => {
    const idx = makeIndex('run-1', [makeEntry(0)]);
    const state: IndexState = { activeRunId: 'run-1', index: idx, indexError: null };
    expect(selectActiveRunIndex(state)).toBe(idx);
  });

  it('returns null when the stored index belongs to a previous run', () => {
    const idx = makeIndex('run-2', [makeEntry(0)]);
    const state: IndexState = { activeRunId: 'run-1', index: idx, indexError: null };
    expect(selectActiveRunIndex(state)).toBeNull();
  });
});

describe('isIndexStale', () => {
  it('flags a run_id mismatch as stale', () => {
    expect(isIndexStale('run-1', 'run-2')).toBe(true);
  });

  it('accepts matching run ids', () => {
    expect(isIndexStale('run-1', 'run-1')).toBe(false);
  });
});

describe('validateAndMergeIndex', () => {
  const prev = makeIndex('run-1', [makeEntry(0)]);

  it('accepts a valid payload for the active run and clears the error', () => {
    const incoming = makeIndex('run-1', [makeEntry(0), makeEntry(1)]);
    const result = validateAndMergeIndex({ activeRunId: 'run-1', prev, incoming });
    expect(result.error).toBeNull();
    expect(result.index?.run_id).toBe('run-1');
    expect(result.index?.entries.length).toBe(2);
  });

  it('rejects a stale response and keeps the previous index', () => {
    const stale = makeIndex('run-9', [makeEntry(0)]);
    const result = validateAndMergeIndex({ activeRunId: 'run-1', prev, incoming: stale });
    expect(result.index).toBe(prev);
    expect(result.error).toContain('stale');
  });

  it('rejects a malformed payload and keeps the previous index', () => {
    const malformed = { run_id: 'run-1', total_pages: 'two', entries: 'nope' };
    const result = validateAndMergeIndex({ activeRunId: 'run-1', prev, incoming: malformed });
    expect(result.index).toBe(prev);
    expect(result.error).toContain('malformed');
  });

  it('rejects a payload with no run_id and keeps the previous index', () => {
    const result = validateAndMergeIndex({ activeRunId: 'run-1', prev, incoming: { package_id: 'x' } });
    expect(result.index).toBe(prev);
    expect(result.error).toBeTruthy();
  });

  it('rejects null/non-object payloads', () => {
    expect(validateAndMergeIndex({ activeRunId: 'run-1', prev, incoming: null }).index).toBe(prev);
    expect(validateAndMergeIndex({ activeRunId: 'run-1', prev, incoming: undefined }).index).toBe(prev);
    expect(validateAndMergeIndex({ activeRunId: 'run-1', prev, incoming: 42 }).index).toBe(prev);
  });

  it('normalizes the run- prefix so run-1 and 1 are the same run', () => {
    const incoming = makeIndex('run-1', [makeEntry(0)]);
    const result = validateAndMergeIndex({ activeRunId: '1', prev, incoming });
    expect(result.error).toBeNull();
    expect(result.index?.run_id).toBe('run-1');
  });

  it('retains the previous index when validation fails even if prev is null', () => {
    const result = validateAndMergeIndex({ activeRunId: 'run-1', prev: null, incoming: { run_id: 'run-2' } });
    expect(result.index).toBeNull();
    expect(result.error).toContain('stale');
  });
});
