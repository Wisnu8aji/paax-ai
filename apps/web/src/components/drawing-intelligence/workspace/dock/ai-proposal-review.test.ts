import { describe, expect, it } from 'vitest';
import { isReviewableAiProposal, type AiProposalReviewData } from './ai-proposal-review';

const valid: AiProposalReviewData = {
  trigger: 'abstain',
  deterministicReason: 'No canonical title match',
  model: 'qwen-3.7-plus',
  promptVersion: 'sheet-classification-v1',
  evidenceRefs: ['ev-title'],
  proposal: { classification_key: 'plan' },
  validation: { valid: true },
};

describe('bounded AI proposal review', () => {
  it('allows review only with trigger, evidence, and deterministic validation', () => {
    expect(isReviewableAiProposal(valid)).toBe(true);
    expect(isReviewableAiProposal({ ...valid, evidenceRefs: [] })).toBe(false);
    expect(isReviewableAiProposal({ ...valid, validation: { valid: false } })).toBe(false);
  });
});
