export interface EngineeringClaim {
  claimId: string;
  text: string;
  type: 'fact' | 'quantity' | 'calculation' | 'recommendation' | 'action';
  projectId: string;
  evidenceRefs: string[];
  authority: 'none' | 'model' | 'engine_verified' | 'human_verified';
  unit?: string;
  stale?: boolean;
  conflictIds?: string[];
}
export interface ClaimValidationResult { valid: boolean; errors: string[]; warnings: string[]; }

export function validateEngineeringClaim(claim: EngineeringClaim, boundProjectId: string): ClaimValidationResult {
  const errors: string[] = [], warnings: string[] = [];
  if (claim.projectId !== boundProjectId) errors.push('claim project does not match bound project');
  if (!claim.evidenceRefs.length && claim.type !== 'recommendation') errors.push('claim has no evidence');
  if ((claim.type === 'quantity' || claim.type === 'calculation') && !['engine_verified', 'human_verified'].includes(claim.authority)) errors.push('numeric claim lacks verified authority');
  if (claim.stale) errors.push('claim depends on stale result');
  if (claim.conflictIds?.length) errors.push('claim has active conflicts');
  if (claim.type === 'quantity' && !claim.unit) errors.push('quantity claim has no unit');
  if (claim.authority === 'model') warnings.push('model-only claim must be presented as proposal');
  return { valid: errors.length === 0, errors, warnings };
}

export function validateDesignerCheckerSeparation(designerId: string, checkerId: string): void {
  if (!designerId.trim() || !checkerId.trim()) throw new Error('designer and checker identities are required');
  if (designerId === checkerId) throw new Error('designer cannot approve their own engineering result');
}
