import { describe, expect, it } from 'vitest';
import { canHandoffQuantity } from './quantity-authority';

describe('handoff authority', () => {
  it('allows only verified physical quantities from Core Engine', () => {
    expect(canHandoffQuantity({ sourceAuthority: 'core_engine', status: 'verified', unit: 'm³' })).toBe(true);
    expect(canHandoffQuantity({ sourceAuthority: 'measurement_fact', status: 'verified', unit: 'm³' })).toBe(false);
    expect(canHandoffQuantity({ sourceAuthority: 'none', status: 'verified', unit: 'm³' })).toBe(false);
    expect(canHandoffQuantity({ sourceAuthority: 'core_engine', status: 'needs-review', unit: 'm³' })).toBe(false);
    expect(canHandoffQuantity({ sourceAuthority: 'core_engine', status: 'verified', unit: 'ref' })).toBe(false);
  });
});
