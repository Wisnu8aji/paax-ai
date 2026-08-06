import { describe, expect, it } from 'vitest';

import {
  BUDGET_HIGH_MAX_MB,
  BUDGET_HIGH_MIN_MB,
  BUDGET_LOW_MAX_MB,
  BUDGET_LOW_MIN_MB,
  BUDGET_MID_MAX_MB,
  BUDGET_MID_MIN_MB,
  cropCacheBudgetBytes,
  deviceMemoryGB,
  estimatedBytes,
  mbToBytes,
  memoryBudgetFor,
  memoryClassFor,
} from './pdf-memory-budget';

describe('memoryClassFor', () => {
  it('classifies device memory into the Master Plan classes', () => {
    expect(memoryClassFor(2)).toBe('low');
    expect(memoryClassFor(4)).toBe('low');
    expect(memoryClassFor(8)).toBe('mid');
    expect(memoryClassFor(15)).toBe('mid');
    expect(memoryClassFor(16)).toBe('high');
    expect(memoryClassFor(32)).toBe('high');
  });

  it('returns unknown for missing or invalid memory', () => {
    expect(memoryClassFor(undefined)).toBe('unknown');
    expect(memoryClassFor(0)).toBe('unknown');
    expect(memoryClassFor(-1)).toBe('unknown');
    expect(memoryClassFor(Number.NaN)).toBe('unknown');
  });
});

describe('cropCacheBudgetBytes (adaptive budget)', () => {
  it('stays inside 48–64 MB for devices ≤ 4 GB', () => {
    for (const gb of [0.5, 1, 2, 3, 4]) {
      const mb = cropCacheBudgetBytes(gb) / mbToBytes(1);
      expect(mb).toBeGreaterThanOrEqual(BUDGET_LOW_MIN_MB);
      expect(mb).toBeLessThanOrEqual(BUDGET_LOW_MAX_MB);
    }
  });

  it('stays inside 96–128 MB for ~8 GB devices', () => {
    for (const gb of [4.5, 6, 8, 10, 12, 15]) {
      const mb = cropCacheBudgetBytes(gb) / mbToBytes(1);
      expect(mb).toBeGreaterThanOrEqual(BUDGET_MID_MIN_MB);
      expect(mb).toBeLessThanOrEqual(BUDGET_MID_MAX_MB);
    }
  });

  it('stays inside 192–256 MB for ≥ 16 GB devices', () => {
    for (const gb of [16, 20, 24, 32, 64]) {
      const mb = cropCacheBudgetBytes(gb) / mbToBytes(1);
      expect(mb).toBeGreaterThanOrEqual(BUDGET_HIGH_MIN_MB);
      expect(mb).toBeLessThanOrEqual(BUDGET_HIGH_MAX_MB);
    }
  });

  it('is monotonic non-decreasing with device memory', () => {
    let prev = 0;
    for (const gb of [0.5, 1, 2, 4, 6, 8, 12, 16, 24, 32, 64]) {
      const budget = cropCacheBudgetBytes(gb);
      expect(budget).toBeGreaterThanOrEqual(prev);
      prev = budget;
    }
  });

  it('falls back to the conservative 96 MB when memory is unknown', () => {
    expect(cropCacheBudgetBytes(undefined)).toBe(mbToBytes(96));
    expect(cropCacheBudgetBytes(0)).toBe(mbToBytes(96));
  });

  it('is byte-exact (not a soft cap)', () => {
    // 8 GB class → ~107 MB; must be a concrete integer byte count.
    const budget = cropCacheBudgetBytes(8);
    expect(Number.isInteger(budget)).toBe(true);
    expect(budget % 1).toBe(0);
  });
});

describe('memoryBudgetFor', () => {
  it('builds a descriptor with class, bytes, and memory', () => {
    expect(memoryBudgetFor(8)).toMatchObject({ deviceMemoryGB: 8, class: 'mid' });
    expect(memoryBudgetFor(32)).toMatchObject({ class: 'high' });
    expect(memoryBudgetFor(undefined)).toMatchObject({ class: 'unknown' });
  });
});

describe('estimatedBytes (byte meter)', () => {
  it('computes widthPx × heightPx × 4', () => {
    expect(estimatedBytes(100, 50)).toBe(100 * 50 * 4);
    expect(estimatedBytes(1920, 1080)).toBe(1920 * 1080 * 4);
  });

  it('returns 0 for non-positive dimensions', () => {
    expect(estimatedBytes(0, 100)).toBe(0);
    expect(estimatedBytes(100, -1)).toBe(0);
  });
});

describe('deviceMemoryGB', () => {
  it('returns undefined in a non-browser environment', () => {
    // Node test env has no navigator.deviceMemory.
    expect(deviceMemoryGB()).toBeUndefined();
  });
});
