import { describe, expect, it } from 'vitest';

import {
  canDisplayFinalQuantity,
  canHandoffQuantity,
  confirmationReasonFor,
  honestStateMessage,
  isNeedsConfirmation,
} from './quantity-authority';

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

describe('workspace "perlu konfirmasi" area (Master Plan §4.5)', () => {
  const base = {
    status: 'needs-review',
    sourceAuthority: 'none' as const,
    technicalCode: null,
    dimensionsDisplay: null,
  };

  it('flags a needs-review item with no code and no dimensions', () => {
    expect(isNeedsConfirmation(base)).toBe(true);
  });

  it('does NOT flag verified engine items', () => {
    expect(
      isNeedsConfirmation({ ...base, status: 'verified', sourceAuthority: 'core_engine', technicalCode: 'K1', dimensionsDisplay: '400 × 600 mm' }),
    ).toBe(false);
  });

  it('does NOT flag coded+dimensioned needs-review items as confirmation', () => {
    expect(
      isNeedsConfirmation({ ...base, technicalCode: 'B2', dimensionsDisplay: '250 × 500 mm' }),
    ).toBe(false);
  });

  it('flags conflict status as confirmation with documented reason', () => {
    const input = { ...base, status: 'conflict', technicalCode: 'B2', dimensionsDisplay: '250 × 500 mm' };
    expect(isNeedsConfirmation(input)).toBe(true);
    expect(confirmationReasonFor(input)).toContain('konflik antar sumber');
  });

  it('flags missing code as confirmation with explicit reason', () => {
    const input = { ...base, dimensionsDisplay: '400 × 600 mm' };
    expect(isNeedsConfirmation(input)).toBe(true);
    const reason = confirmationReasonFor(input);
    expect(reason).toContain('tidak ada kode elemen terdeteksi');
    expect(reason).not.toContain('dimensi tidak tersedia');
  });

  it('flags missing dimensions as confirmation with explicit reason', () => {
    const input = { ...base, technicalCode: 'K1' };
    expect(isNeedsConfirmation(input)).toBe(true);
    expect(confirmationReasonFor(input)).toContain('dimensi tidak tersedia');
  });

  it('treats placeholder dimensions as unavailable', () => {
    expect(
      isNeedsConfirmation({ ...base, technicalCode: 'K1', dimensionsDisplay: 'Belum tersedia' }),
    ).toBe(true);
  });

  it('prefers a backend-provided confirmation reason', () => {
    const input = {
      ...base,
      technicalCode: 'K1',
      dimensionsDisplay: '400 × 600 mm',
      needsConfirmation: true,
      confirmationReason: 'tidak ada kode elemen terdeteksi pada label.',
    };
    expect(isNeedsConfirmation(input)).toBe(true);
    expect(confirmationReasonFor(input)).toBe('tidak ada kode elemen terdeteksi pada label.');
  });

  it('honours an explicit backend needsConfirmation signal', () => {
    expect(isNeedsConfirmation({ ...base, needsConfirmation: true })).toBe(true);
  });

  it('returns null reason for non-confirmation items', () => {
    expect(
      confirmationReasonFor({ ...base, status: 'verified', sourceAuthority: 'core_engine' }),
    ).toBeNull();
    expect(confirmationReasonFor({ ...base, status: 'draft' })).toBeNull();
  });

  it('falls back to abstain reason when no other criterion matches', () => {
    const reason = confirmationReasonFor({ ...base, needsConfirmation: true });
    expect(reason).toBeTruthy();
  });
});
