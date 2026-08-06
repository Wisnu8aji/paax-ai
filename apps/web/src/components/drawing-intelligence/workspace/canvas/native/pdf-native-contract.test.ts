import { describe, expect, it } from 'vitest';

import {
  PRIORITY_BASE_FIRST,
  PRIORITY_BASE_UPGRADE,
  PRIORITY_FOREGROUND,
  PRIORITY_NEIGHBOR_PREFETCH,
  canCommit,
  estimatedBytesFor,
  isBaseRequest,
  isCropRequest,
  pageKeyOf,
  priorityLevelOf,
  type RenderBaseRequest,
  type RenderCropRequest,
} from './pdf-native-contract';

const baseRequest: RenderBaseRequest = {
  requestId: 'base-1',
  generation: 1,
  runId: 'run-1',
  pageIndex: 0,
  density: 2,
  darkMode: false,
  priority: 'base-first',
};

const cropRequest: RenderCropRequest = {
  requestId: 'crop-1',
  generation: 1,
  runId: 'run-1',
  pageIndex: 0,
  region: { x: 10, y: 20, width: 100, height: 200 },
  density: 4,
  darkMode: true,
  priority: 'foreground',
};

describe('estimatedBytesFor', () => {
  it('computes RGBA baseline width×height×4', () => {
    expect(estimatedBytesFor(100, 50)).toBe(100 * 50 * 4);
  });

  it('never returns negative for degenerate input', () => {
    expect(estimatedBytesFor(-5, 10)).toBe(0);
  });
});

describe('priorityLevelOf', () => {
  it('maps the four contract priorities to P0..P3', () => {
    expect(priorityLevelOf({ ...cropRequest, priority: 'foreground' })).toBe(PRIORITY_FOREGROUND);
    expect(priorityLevelOf({ ...baseRequest, priority: 'base-first' })).toBe(PRIORITY_BASE_FIRST);
    expect(priorityLevelOf({ ...cropRequest, priority: 'neighbor-prefetch' })).toBe(PRIORITY_NEIGHBOR_PREFETCH);
    expect(priorityLevelOf({ ...baseRequest, priority: 'base-upgrade' })).toBe(PRIORITY_BASE_UPGRADE);
  });
});

describe('isCropRequest / isBaseRequest', () => {
  it('discriminates crop from base by the presence of region', () => {
    expect(isCropRequest(cropRequest)).toBe(true);
    expect(isBaseRequest(cropRequest)).toBe(false);
    expect(isCropRequest(baseRequest)).toBe(false);
    expect(isBaseRequest(baseRequest)).toBe(true);
  });
});

describe('pageKeyOf', () => {
  it('joins runId and pageIndex with a colon', () => {
    expect(pageKeyOf('run-1', 3)).toBe('run-1:3');
  });
});

describe('canCommit (frozen commit rule)', () => {
  const registered = new Set(['crop-1', 'base-1']);

  it('commits when generation matches, requestId registered, page active', () => {
    expect(
      canCommit(
        { generation: 1, requestId: 'crop-1', pageIndex: 0 },
        1,
        registered,
        0,
      ),
    ).toBe(true);
  });

  it('rejects when the generation differs from activeGeneration', () => {
    expect(
      canCommit(
        { generation: 1, requestId: 'crop-1', pageIndex: 0 },
        2,
        registered,
        0,
      ),
    ).toBe(false);
  });

  it('rejects when the requestId is no longer registered', () => {
    expect(
      canCommit(
        { generation: 1, requestId: 'gone', pageIndex: 0 },
        1,
        registered,
        0,
      ),
    ).toBe(false);
  });

  it('rejects when the page is no longer active', () => {
    expect(
      canCommit(
        { generation: 1, requestId: 'crop-1', pageIndex: 0 },
        1,
        registered,
        1,
      ),
    ).toBe(false);
  });

  it('treats an undefined active page as no gate (mock adapter default)', () => {
    expect(
      canCommit(
        { generation: 1, requestId: 'crop-1', pageIndex: 0 },
        1,
        registered,
        undefined,
      ),
    ).toBe(true);
  });
});
