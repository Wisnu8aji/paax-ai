import { describe, expect, it } from 'vitest';
import {
  canDisplayFinalQuantity,
  canHandoffQuantity,
  honestStateMessage,
  QuantitySourceAuthority,
} from '../quantity-authority';
import type { QuantityItem } from '../di-types';

describe('Phase 09E Handoff Safety & Coverage Unit Tests', () => {
  const verifiedItem: QuantityItem = {
    id: 'Q-01',
    itemCode: 'K-1',
    workItem: 'Kolom Beton K1 (40x40 cm)',
    category: 'column',
    qty: '6.40',
    unit: 'm3',
    status: 'verified',
    sourceAuthority: 'core_engine',
    confidence: 0.98,
    source: 'p. 4, Gbr S-02',
    wbsGroup: 'Superstructure',
  } as any;

  const unverifiedItem: QuantityItem = {
    id: 'Q-02',
    itemCode: 'B-1',
    workItem: 'Balok Beton B1 (25x50 cm)',
    category: 'beam',
    qty: '4.80',
    unit: 'm3',
    status: 'needs-review',
    sourceAuthority: 'proposal' as any,
    confidence: 0.70,
    source: 'p. 5, Gbr S-03',
    wbsGroup: 'Superstructure',
  } as any;

  const blockedItem: QuantityItem = {
    id: 'Q-03',
    itemCode: 'W-1',
    workItem: 'Dinding Bata Merah',
    category: 'wall',
    qty: '120.00',
    unit: 'm2',
    status: 'conflict',
    sourceAuthority: 'none',
    confidence: 0.50,
    source: 'p. 2, Gbr A-01',
    wbsGroup: 'Architecture',
  } as any;

  it('1. canDisplayFinalQuantity requires sourceAuthority === "core_engine"', () => {
    expect(canDisplayFinalQuantity({ sourceAuthority: 'core_engine' })).toBe(true);
    expect(canDisplayFinalQuantity({ sourceAuthority: 'none' })).toBe(false);
    expect(canDisplayFinalQuantity({ sourceAuthority: 'proposal' })).toBe(false);
    expect(canDisplayFinalQuantity({ sourceAuthority: 'review' })).toBe(false);
    expect(canDisplayFinalQuantity({ sourceAuthority: 'measurement_fact' })).toBe(false);
  });

  it('2. canHandoffQuantity requires core_engine authority, verified status, and physical unit', () => {
    expect(
      canHandoffQuantity({
        sourceAuthority: verifiedItem.sourceAuthority as QuantitySourceAuthority,
        status: verifiedItem.status,
        unit: verifiedItem.unit,
      })
    ).toBe(true);

    expect(
      canHandoffQuantity({
        sourceAuthority: unverifiedItem.sourceAuthority as QuantitySourceAuthority,
        status: unverifiedItem.status,
        unit: unverifiedItem.unit,
      })
    ).toBe(false);

    expect(
      canHandoffQuantity({
        sourceAuthority: blockedItem.sourceAuthority as QuantitySourceAuthority,
        status: blockedItem.status,
        unit: blockedItem.unit,
      })
    ).toBe(false);

    // Reference occurrence items (unit = 'ref') cannot be handed off to RAB
    expect(
      canHandoffQuantity({
        sourceAuthority: 'core_engine',
        status: 'verified',
        unit: 'ref',
      })
    ).toBe(false);
  });

  it('3. Bulk selection filter includes ONLY currently eligible rows', () => {
    const items = [verifiedItem, unverifiedItem, blockedItem];
    const eligible = items.filter((item) =>
      canHandoffQuantity({
        sourceAuthority: item.sourceAuthority ?? 'none',
        status: item.status,
        unit: item.unit,
      })
    );

    expect(eligible).toHaveLength(1);
    expect(eligible[0].id).toBe('Q-01');
  });

  it('4. Truthful honest state messages explain workspace blocked/ready status', () => {
    expect(honestStateMessage('ready')).toContain('available');
    expect(honestStateMessage('core-engine-required')).toContain('Core Engine calculation is required');
    expect(honestStateMessage('quantity-blocked')).toContain('blocked');
    expect(honestStateMessage('evidence-incomplete')).toContain('incomplete');
    expect(honestStateMessage('revision-conflict')).toContain('conflict');
  });
});
