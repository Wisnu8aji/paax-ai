import { describe, expect, it } from 'vitest';

import { canDisplayFinalQuantity, honestStateMessage } from './quantity-authority';

describe('workspace quantity authority', () => {
  it('refuses detected references without a typed Measurement Fact or Core Engine result', () => {
    expect(canDisplayFinalQuantity({ sourceAuthority: 'none' })).toBe(false);
    expect(canDisplayFinalQuantity({ sourceAuthority: 'measurement_fact' })).toBe(false);
    expect(canDisplayFinalQuantity({ sourceAuthority: 'core_engine' })).toBe(true);
  });

  it.each([
    'extraction-pending', 'synthesis-pending', 'graph-not-ready', 'evidence-incomplete',
    'revision-conflict', 'quantity-blocked', 'core-engine-required',
  ] as const)('labels the honest %s state', (state: Parameters<typeof honestStateMessage>[0]) => {
    expect(honestStateMessage(state)).toBeTruthy();
  });
});
