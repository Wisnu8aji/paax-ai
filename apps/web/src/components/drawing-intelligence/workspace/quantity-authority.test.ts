import { describe, expect, it } from 'vitest';

import { canDisplayFinalQuantity, canHandoffQuantity, honestStateMessage } from './quantity-authority';

describe('workspace quantity authority guard', () => {
  it('refuses non-engine authority states as final quantity', () => {
    expect(canDisplayFinalQuantity({ sourceAuthority: 'none' })).toBe(false);
    expect(canDisplayFinalQuantity({ sourceAuthority: 'measurement_fact' })).toBe(false);
    expect(canDisplayFinalQuantity({ sourceAuthority: 'proposal' })).toBe(false);
    expect(canDisplayFinalQuantity({ sourceAuthority: 'review' })).toBe(false);
    expect(canDisplayFinalQuantity({ sourceAuthority: null as any })).toBe(false);
    expect(canDisplayFinalQuantity({ sourceAuthority: undefined as any })).toBe(false);
    expect(canDisplayFinalQuantity({ sourceAuthority: 'unknown_authority' as any })).toBe(false);

    // ONLY core_engine is accepted
    expect(canDisplayFinalQuantity({ sourceAuthority: 'core_engine' })).toBe(true);
  });

  it('enforces strict handoff validation', () => {
    expect(canHandoffQuantity({ sourceAuthority: 'core_engine', status: 'verified', unit: 'm3' })).toBe(true);
    expect(canHandoffQuantity({ sourceAuthority: 'core_engine', status: 'verified', unit: 'ref' })).toBe(false);
    expect(canHandoffQuantity({ sourceAuthority: 'proposal', status: 'verified', unit: 'm3' })).toBe(false);
    expect(canHandoffQuantity({ sourceAuthority: 'core_engine', status: 'unverified', unit: 'm3' })).toBe(false);
  });

  it.each([
    'extraction-pending', 'synthesis-pending', 'graph-not-ready', 'evidence-incomplete',
    'revision-conflict', 'quantity-blocked', 'core-engine-required',
  ] as const)('labels the honest %s state', (state: Parameters<typeof honestStateMessage>[0]) => {
    expect(honestStateMessage(state)).toBeTruthy();
  });
});
