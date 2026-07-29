export type QuantitySourceAuthority = 'none' | 'measurement_fact' | 'proposal' | 'review' | 'core_engine';
export type HonestWorkspaceState =
  | 'ready'
  | 'extraction-pending'
  | 'synthesis-pending'
  | 'graph-not-ready'
  | 'evidence-incomplete'
  | 'revision-conflict'
  | 'quantity-blocked'
  | 'core-engine-required';

export function canDisplayFinalQuantity(input: { sourceAuthority: QuantitySourceAuthority }): boolean {
  return input.sourceAuthority === 'core_engine';
}

const MESSAGES: Record<HonestWorkspaceState, string> = {
  ready: 'Quantity authority is available.',
  'extraction-pending': 'Extraction is pending; only source references can be shown.',
  'synthesis-pending': 'Synthesis is pending; project facts are not ready.',
  'graph-not-ready': 'Project graph is not ready.',
  'evidence-incomplete': 'Evidence is incomplete; verify the source drawing before quantity work.',
  'revision-conflict': 'Drawing revisions conflict; select the approved revision before quantity work.',
  'quantity-blocked': 'Quantity is blocked: detected references are not physical quantities.',
  'core-engine-required': 'Core Engine calculation is required for a final quantity.',
};

export function honestStateMessage(state: HonestWorkspaceState): string {
  return MESSAGES[state];
}

export function canHandoffQuantity(input: {
  sourceAuthority: QuantitySourceAuthority;
  status: string;
  unit: string;
}): boolean {
  return input.sourceAuthority === 'core_engine' && input.status === 'verified' && input.unit !== 'ref';
}
