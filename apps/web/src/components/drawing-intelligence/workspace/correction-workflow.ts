export const CORRECTION_TYPES = [
  'rename', 'reclassify', 'relocate', 'change-dimension', 'merge', 'split',
  'reject-candidate', 'verify-physical', 'add-relation', 'mark-superseded',
] as const;
export type CorrectionType = typeof CORRECTION_TYPES[number];

export function isCorrectionType(value: string): value is CorrectionType {
  return (CORRECTION_TYPES as readonly string[]).includes(value);
}

export function createCorrectionProposal(input: {
  queueItem: { id: string; target_type: string; target_id: string };
  snapshotId: string;
  correctionType: CorrectionType;
  proposedValue: Record<string, unknown>;
  rationale: string;
  createId: () => string;
}) {
  return {
    id: input.createId(),
    snapshot_id: input.snapshotId,
    target_type: input.queueItem.target_type,
    target_id: input.queueItem.target_id,
    correction_type: input.correctionType,
    proposed_value: input.proposedValue,
    rationale: input.rationale,
  };
}
