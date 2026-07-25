import { describe, expect, it } from 'vitest';

import { createCorrectionProposal, isCorrectionType } from './correction-workflow';

describe('persistent review correction workflow', () => {
  it('creates a new durable correction ID from a queue target, never the queue ID', () => {
    const proposal = createCorrectionProposal({
      queueItem: { id: 'queue:node:node-1', target_type: 'node', target_id: 'node-1' },
      snapshotId: 'snap-1', correctionType: 'rename', proposedValue: { name: 'Kolom K1' }, rationale: 'evidence reviewed',
      createId: () => 'corr-1',
    });
    expect(proposal.id).toBe('corr-1');
    expect(proposal.id).not.toBe('queue:node:node-1');
    expect(proposal.target_id).toBe('node-1');
  });

  it('allows only explicit correction types', () => {
    expect(isCorrectionType('merge')).toBe(true);
    expect(isCorrectionType('override')).toBe(false);
  });
});
