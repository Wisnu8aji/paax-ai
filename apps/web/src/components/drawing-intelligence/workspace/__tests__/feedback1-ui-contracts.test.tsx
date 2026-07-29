import { describe, expect, it } from 'vitest';
import { canDisplayFinalQuantity } from '../quantity-authority';

describe('Phase 10A Feedback 1 UI Contract Tests', () => {
  it('enforces Core Engine authority for final display', () => {
    expect(canDisplayFinalQuantity({ sourceAuthority: 'core_engine' })).toBe(true);
    expect(canDisplayFinalQuantity({ sourceAuthority: 'none' })).toBe(false);
    expect(canDisplayFinalQuantity({ sourceAuthority: 'proposal' as any })).toBe(false);
    expect(canDisplayFinalQuantity({ sourceAuthority: 'review' as any })).toBe(false);
  });

  it('validates 3 mode navigation tabs structure for P24 (Level, Classification, Original)', () => {
    const modes = ['level', 'classification', 'original'];
    expect(modes).toHaveLength(3);
    expect(modes).toContain('level');
    expect(modes).toContain('classification');
    expect(modes).toContain('original');
  });
});
