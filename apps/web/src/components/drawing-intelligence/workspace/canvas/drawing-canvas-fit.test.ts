import { describe, expect, it } from 'vitest';
import {
  aspectForRender,
  documentKeyFor,
  nextCoverageState,
  shouldApplyFit,
  underlayVisibility,
  type CoverageEvent,
  type FitRecord,
} from './drawing-canvas-fit';

const sheetFallback = (documentKey: string, aspect = 1.4): FitRecord => ({ documentKey, aspect, source: 'sheet-dimensions' });
const exactMetrics = (documentKey: string, aspect = 1.414): FitRecord => ({ documentKey, aspect, source: 'pdf-metrics' });
const cachedMetrics = (documentKey: string, aspect = 1.414): FitRecord => ({ documentKey, aspect, source: 'pdf-cache' });

describe('documentKeyFor', () => {
  it('differs by page and by run', () => {
    expect(documentKeyFor('run-a', 0)).toBe('run-a:0');
    expect(documentKeyFor('run-a', 0)).not.toBe(documentKeyFor('run-a', 1));
    expect(documentKeyFor('run-a', 0)).not.toBe(documentKeyFor('run-b', 0));
    expect(documentKeyFor('run-b', 3)).toBe('run-b:3');
  });
});

describe('shouldApplyFit', () => {
  it('fits on first visit (no previous record)', () => {
    expect(shouldApplyFit(null, sheetFallback('run-a:0'))).toBe(true);
    expect(shouldApplyFit(null, exactMetrics('run-a:0'))).toBe(true);
  });

  it('never treats previous-sheet PDF metrics as the new sheet fallback', () => {
    expect(documentKeyFor('run-a', 0)).not.toBe(documentKeyFor('run-a', 1));
    expect(shouldApplyFit(exactMetrics('run-a:0', 0.7), sheetFallback('run-a:1', 1.4))).toBe(true);
  });

  it('does not refit the same document for equivalent exact metrics', () => {
    const record = exactMetrics('run-a:1');
    expect(shouldApplyFit(record, { ...record, aspect: 1.4141 }, 0.005)).toBe(false);
  });

  it('refits the same document when exact metrics materially change', () => {
    expect(shouldApplyFit(exactMetrics('run-a:0', 1.4), exactMetrics('run-a:0', 1.7))).toBe(true);
  });

  it('replaces sheet fallback with exact metrics for the same document', () => {
    expect(shouldApplyFit(sheetFallback('run-a:0'), exactMetrics('run-a:0', 1.414))).toBe(true);
  });

  it('never downgrades exact metrics back to the sheet fallback', () => {
    expect(shouldApplyFit(exactMetrics('run-a:0'), sheetFallback('run-a:0'))).toBe(false);
  });

  it('does not refit cached exact metrics when fresh metrics arrive equivalent', () => {
    expect(shouldApplyFit(cachedMetrics('run-a:0'), exactMetrics('run-a:0', 1.41401), 0.005)).toBe(false);
  });

  it('does not refit the same document for two equivalent provisional fits', () => {
    expect(shouldApplyFit(sheetFallback('run-a:0', 1.4), sheetFallback('run-a:0', 1.40001), 0.005)).toBe(false);
  });

  it('ignores a NaN aspect rather than refitting forever', () => {
    expect(shouldApplyFit(exactMetrics('run-a:0', 1.4), { documentKey: 'run-a:0', aspect: Number.NaN, source: 'pdf-metrics' })).toBe(false);
  });
});

describe('nextCoverageState', () => {
  const event = (documentKey: string, generation: number, ready: boolean): CoverageEvent => ({ documentKey, generation, ready });

  it('accepts the first event for a document', () => {
    expect(nextCoverageState(null, event('run-a:0', 1, false))).toEqual({ documentKey: 'run-a:0', generation: 1, ready: false });
  });

  it('ignores events from a different document', () => {
    const current = { documentKey: 'run-a:0', generation: 2, ready: true };
    expect(nextCoverageState(current, event('run-b:1', 3, false))).toBe(current);
  });

  it('ignores older-generation events for the same document', () => {
    const current = { documentKey: 'run-a:0', generation: 2, ready: true };
    expect(nextCoverageState(current, event('run-a:0', 1, false))).toBe(current);
  });

  it('reveals on ready:false for the current or newer generation', () => {
    const current = { documentKey: 'run-a:0', generation: 2, ready: true };
    expect(nextCoverageState(current, event('run-a:0', 2, false))).toEqual({ documentKey: 'run-a:0', generation: 2, ready: false });
    expect(nextCoverageState(current, event('run-a:0', 3, false))).toEqual({ documentKey: 'run-a:0', generation: 3, ready: false });
  });

  it('hides on matching or newer ready:true', () => {
    const current = { documentKey: 'run-a:0', generation: 1, ready: false };
    expect(nextCoverageState(current, event('run-a:0', 1, true))).toEqual({ documentKey: 'run-a:0', generation: 1, ready: true });
    expect(nextCoverageState(current, event('run-a:0', 2, true))).toEqual({ documentKey: 'run-a:0', generation: 2, ready: true });
  });

  it('accepts the first event for a document and never switches to a later unrelated document', () => {
    const first = nextCoverageState(null, event('run-a:0', 1, false));
    expect(nextCoverageState(first, event('run-b:1', 1, true))).toBe(first);
  });
});

describe('aspectForRender (render-time document gate)', () => {
  it('uses PDF metrics only when their document key equals the active document key', () => {
    expect(aspectForRender({ width: 1000, height: 700 }, 'run-a:0', 'run-a:0', 1.4)).toBeCloseTo(0.7, 9);
    expect(aspectForRender({ width: 1000, height: 700 }, 'run-a:0', 'run-a:1', 1.4)).toBe(1.4);
    expect(aspectForRender({ width: 1000, height: 700 }, 'run-a:0', null, 1.4)).toBe(1.4);
  });

  it('never lets previous-document metrics control a frame while no document is active', () => {
    expect(aspectForRender({ width: 1000, height: 700 }, 'run-a:0', null, 1.4)).toBe(1.4);
    expect(aspectForRender({ width: 1000, height: 700 }, null, 'run-b:1', 1.4)).toBe(1.4);
  });

  it('falls back when metrics are absent even if the keys match', () => {
    expect(aspectForRender(null, 'run-a:0', 'run-a:0', 1.4)).toBe(1.4);
  });
});

describe('underlayVisibility (render-time document gate)', () => {
  it('hides only when the active document itself is coverage-ready', () => {
    expect(underlayVisibility(null, 'run-a:0')).toBe('visible');
    expect(underlayVisibility({ documentKey: 'run-a:0', generation: 1, ready: true }, 'run-a:0')).toBe('hidden');
    expect(underlayVisibility({ documentKey: 'run-a:0', generation: 1, ready: false }, 'run-a:0')).toBe('visible');
  });

  it('reveals immediately when the previous coverage belongs to another document', () => {
    expect(underlayVisibility({ documentKey: 'run-a:0', generation: 7, ready: true }, 'run-b:1')).toBe('visible');
    expect(underlayVisibility({ documentKey: 'run-a:0', generation: 7, ready: true }, null)).toBe('visible');
  });
});
