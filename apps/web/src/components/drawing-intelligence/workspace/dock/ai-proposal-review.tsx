'use client';

/** Review-only presentation for bounded AI metadata proposals.
 * It never renders a proposal as a quantity and never auto-applies a change.
 */

export interface AiProposalReviewData {
  trigger: 'abstain' | 'ambiguous';
  deterministicReason: string;
  model: string;
  promptVersion: string;
  evidenceRefs: string[];
  proposal: Record<string, unknown>;
  validation: { valid: boolean; reason?: string };
}

export function isReviewableAiProposal(data: AiProposalReviewData): boolean {
  return (
    (data.trigger === 'abstain' || data.trigger === 'ambiguous') &&
    Boolean(data.model.trim()) &&
    Boolean(data.promptVersion.trim()) &&
    data.evidenceRefs.length > 0 &&
    data.validation.valid === true
  );
}

export function AiProposalReview({
  data,
  onApprove,
  onReject,
}: {
  data: AiProposalReviewData;
  onApprove: () => void;
  onReject: () => void;
}) {
  const reviewable = isReviewableAiProposal(data);
  return (
    <section
      aria-label="AI classification proposal"
      className="di-panel"
      style={{ marginTop: 10, padding: 10, borderRadius: 8, background: 'var(--di-panel2)' }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 10px', fontSize: 11.5 }}>
        <strong>Trigger</strong><span>{data.trigger}: {data.deterministicReason}</span>
        <strong>Model</strong><span className="di-mono">{data.model}</span>
        <strong>Prompt</strong><span className="di-mono">{data.promptVersion}</span>
        <strong>Evidence</strong><span className="di-mono">{data.evidenceRefs.join(', ')}</span>
        <strong>Validation</strong><span>{data.validation.valid ? 'Passed deterministic validation' : data.validation.reason || 'Rejected'}</span>
        <strong>Proposal</strong><pre style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(data.proposal, null, 2)}</pre>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <button className="di-btn di-btn-ok" disabled={!reviewable} onClick={onApprove}>Approve metadata</button>
        <button className="di-btn" onClick={onReject}>Reject proposal</button>
      </div>
      {!reviewable && (
        <div style={{ marginTop: 8, color: 'var(--di-warn)', fontSize: 11.5 }}>
          Proposal cannot be approved. Use the manual classification path.
        </div>
      )}
    </section>
  );
}
