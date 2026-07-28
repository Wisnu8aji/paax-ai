import { describe, expect, it } from 'vitest';
import { canDisplayFinalQuantity, canHandoffQuantity } from '../quantity-authority';
import { normalizeStatusMessage } from '../status-bar';

describe('Feedback 1 UI authority contracts', () => {
  it('never presents evidence-only rows as final or handoff-ready', () => {
    expect(canDisplayFinalQuantity({ sourceAuthority: 'measurement_fact' })).toBe(false);
    expect(canHandoffQuantity({ sourceAuthority: 'none', status: 'verified', unit: 'm³' })).toBe(false);
  });
  it('normalizes malformed runtime status payloads', () => {
    expect(normalizeStatusMessage({ status: 'broken' })).toBe('Workspace ready');
  });
});
