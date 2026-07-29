'use client';

/**
 * AI Proposal Review Panel — Drawing Intelligence Bounded Fallback UI.
 *
 * Enforces:
 * - Hidden prior to valid deterministic abstention/ambiguity trigger.
 * - Hides AI proposal from engine calculation; sourceAuthority is never `core_engine`.
 * - Mandatory human review & approval controls before any state mutation.
 */

import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Edit3,
  FileText,
  Info,
  ShieldAlert,
  XCircle,
} from 'lucide-react';

export type AssistTrigger = 'abstain' | 'ambiguous';
export type ApprovalState = 'unapproved' | 'approved' | 'rejected' | 'edited';
export type UserRole = 'estimator' | 'pm' | 'admin' | 'viewer';

export interface AiProposalData {
  trigger: AssistTrigger;
  deterministic_reason: string;
  model: string;
  prompt_version: string;
  allowed_fields: string[];
  evidence_refs: string[];
  confidence: number; // 0..100
  proposal: Record<string, unknown>;
  validation: {
    valid: boolean;
    reason: string;
    fields?: string[];
  };
  approval_state?: ApprovalState;
  error?: string | null;
}

export interface AiProposalReviewProps {
  proposalData: AiProposalData | null;
  userRole?: UserRole;
  onApprove?: (proposal: Record<string, unknown>) => void;
  onReject?: (reason: string) => void;
  onManualCorrection?: (corrected: Record<string, unknown>) => void;
  onNavigateToEvidence?: (ref: string) => void;
}

export function AiProposalReview({
  proposalData,
  userRole = 'estimator',
  onApprove,
  onReject,
  onManualCorrection,
  onNavigateToEvidence,
}: AiProposalReviewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [correctionText, setCorrectionText] = useState('');
  const [approvalState, setApprovalState] = useState<ApprovalState>(
    proposalData?.approval_state ?? 'unapproved'
  );
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);

  // Hidden prior to valid abstention/ambiguity trigger
  if (!proposalData) return null;
  if (proposalData.trigger !== 'abstain' && proposalData.trigger !== 'ambiguous') {
    return null;
  }

  const canReview = userRole === 'estimator' || userRole === 'pm' || userRole === 'admin';

  const handleApprove = () => {
    if (!canReview) return;
    setApprovalState('approved');
    onApprove?.(proposalData.proposal);
  };

  const handleReject = () => {
    if (!canReview) return;
    setApprovalState('rejected');
    setShowRejectForm(false);
    onReject?.(rejectReason || 'User rejected proposal');
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canReview || !correctionText.trim()) return;
    setApprovalState('edited');
    setIsEditing(false);
    onManualCorrection?.({ manual_entry: correctionText.trim() });
  };

  return (
    <div
      className="ai-proposal-review-panel"
      data-testid="ai-proposal-review-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: 12,
        borderRadius: 8,
        background: 'var(--di-panel2, #181b21)',
        border: '1px solid var(--di-border, #2a2e39)',
        marginTop: 8,
      }}
    >
      {/* Header & Trigger Badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Info size={15} style={{ color: 'var(--di-accent, #3b82f6)' }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--di-text, #f3f4f6)' }}>
            AI Fallback Proposal
          </span>
        </div>
        <span
          className="di-pill"
          data-testid="trigger-badge"
          data-tone={proposalData.trigger === 'abstain' ? 'warn' : 'info'}
          style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, textTransform: 'uppercase' }}
        >
          {proposalData.trigger}
        </span>
      </div>

      {/* Deterministic Abstention Reason */}
      <div
        style={{
          padding: '8px 10px',
          borderRadius: 6,
          background: 'rgba(234, 179, 8, 0.1)',
          border: '1px solid rgba(234, 179, 8, 0.25)',
          fontSize: 11,
          color: 'var(--di-text2, #d1d5db)',
          lineHeight: 1.4,
        }}
        data-testid="abstention-reason"
      >
        <strong style={{ color: '#eab308' }}>Fast-path Abstention: </strong>
        {proposalData.deterministic_reason}
      </div>

      {/* Metadata & Model Info */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 11 }}>
        <div>
          <span style={{ color: 'var(--di-text3, #9ca3af)' }}>Model: </span>
          <span className="di-mono" data-testid="proposal-model" style={{ color: 'var(--di-text, #f3f4f6)' }}>
            {proposalData.model}
          </span>
        </div>
        <div>
          <span style={{ color: 'var(--di-text3, #9ca3af)' }}>Prompt Version: </span>
          <span className="di-mono" data-testid="prompt-version" style={{ color: 'var(--di-text, #f3f4f6)' }}>
            {proposalData.prompt_version}
          </span>
        </div>
        <div>
          <span style={{ color: 'var(--di-text3, #9ca3af)' }}>Confidence: </span>
          <span
            className="di-mono"
            data-testid="proposal-confidence"
            style={{
              fontWeight: 700,
              color: proposalData.confidence >= 80 ? 'var(--di-ok, #22c55e)' : '#eab308',
            }}
          >
            {proposalData.confidence}%
          </span>
        </div>
        <div>
          <span style={{ color: 'var(--di-text3, #9ca3af)' }}>Authority: </span>
          <span
            className="di-mono"
            data-testid="source-authority"
            style={{ fontStyle: 'italic', color: '#3b82f6' }}
          >
            proposal (review-only)
          </span>
        </div>
      </div>

      {/* Allowed Fields & Evidence Refs */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
        <div>
          <span style={{ color: 'var(--di-text3, #9ca3af)' }}>Allowed Fields: </span>
          <span className="di-mono" data-testid="allowed-fields" style={{ color: 'var(--di-text2, #d1d5db)' }}>
            {proposalData.allowed_fields.join(', ')}
          </span>
        </div>
        <div>
          <span style={{ color: 'var(--di-text3, #9ca3af)' }}>Evidence References: </span>
          <span data-testid="evidence-refs">
            {proposalData.evidence_refs.map((ref, idx) => (
              <button
                key={ref + idx}
                type="button"
                className="di-btn-ghost"
                style={{
                  fontSize: 10,
                  padding: '1px 5px',
                  marginLeft: 4,
                  color: 'var(--di-action, #60a5fa)',
                  textDecoration: 'underline',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
                onClick={() => onNavigateToEvidence?.(ref)}
              >
                {ref}
              </button>
            ))}
          </span>
        </div>
      </div>

      {/* Validation Status */}
      <div
        style={{
          padding: '6px 8px',
          borderRadius: 6,
          background: proposalData.validation.valid
            ? 'rgba(34, 197, 94, 0.1)'
            : 'rgba(239, 68, 68, 0.1)',
          border: `1px solid ${
            proposalData.validation.valid ? 'rgba(34, 197, 94, 0.25)' : 'rgba(239, 68, 68, 0.25)'
          }`,
          fontSize: 11,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
        data-testid="validation-status"
      >
        {proposalData.validation.valid ? (
          <>
            <CheckCircle2 size={14} style={{ color: '#22c55e' }} />
            <span style={{ color: '#22c55e' }}>
              Deterministic Validation: {proposalData.validation.reason}
            </span>
          </>
        ) : (
          <>
            <AlertTriangle size={14} style={{ color: '#ef4444' }} />
            <span style={{ color: '#ef4444' }}>
              Validation Failed: {proposalData.validation.reason}
            </span>
          </>
        )}
      </div>

      {/* Provider Error Alert if any */}
      {proposalData.error && (
        <div
          style={{
            padding: '6px 8px',
            borderRadius: 6,
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            fontSize: 11,
            color: '#ef4444',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
          data-testid="provider-error-alert"
        >
          <ShieldAlert size={14} />
          <span>Provider Error: {proposalData.error}</span>
        </div>
      )}

      {/* Proposal Payload Content */}
      <div
        style={{
          padding: 8,
          borderRadius: 6,
          background: 'var(--di-paper, #0f1115)',
          border: '1px solid var(--di-border, #2a2e39)',
          fontSize: 11,
        }}
        data-testid="proposal-content"
      >
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--di-text3, #9ca3af)', marginBottom: 4 }}>
          PROPOSED CLASSIFICATION / BINDING:
        </div>
        <pre
          className="di-mono"
          style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--di-text, #f3f4f6)' }}
        >
          {JSON.stringify(proposalData.proposal, null, 2)}
        </pre>
      </div>

      {/* RBAC Notice if user role lacks permission */}
      {!canReview && (
        <div
          style={{ fontSize: 10.5, color: '#ef4444', fontStyle: 'italic' }}
          data-testid="rbac-denial-notice"
        >
          Role '{userRole}' does not have permission to approve or reject proposals.
        </div>
      )}

      {/* Approval Status Badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--di-text3, #9ca3af)' }}>Approval State:</span>
        <span
          className="di-pill"
          data-testid="approval-state-badge"
          data-tone={
            approvalState === 'approved'
              ? 'ok'
              : approvalState === 'rejected'
              ? 'err'
              : approvalState === 'edited'
              ? 'accent'
              : 'warn'
          }
          style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, textTransform: 'uppercase' }}
        >
          {approvalState}
        </span>
      </div>

      {/* Manual Correction Form */}
      {isEditing && (
        <form onSubmit={handleManualSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 6 }} data-testid="manual-edit-form">
          <input
            className="di-input"
            style={{ fontSize: 11, padding: '4px 8px' }}
            placeholder="Enter manual classification / correction..."
            value={correctionText}
            onChange={(e) => setCorrectionText(e.target.value)}
            data-testid="manual-edit-input"
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="submit"
              className="di-btn di-btn-primary"
              style={{ fontSize: 10, padding: '4px 8px' }}
              data-testid="save-manual-edit-btn"
            >
              Save Correction
            </button>
            <button
              type="button"
              className="di-btn-ghost"
              style={{ fontSize: 10, padding: '4px 8px' }}
              onClick={() => setIsEditing(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Reject Reason Form */}
      {showRejectForm && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} data-testid="reject-reason-form">
          <input
            className="di-input"
            style={{ fontSize: 11, padding: '4px 8px' }}
            placeholder="Reason for rejection..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            data-testid="reject-reason-input"
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className="di-btn"
              style={{ fontSize: 10, padding: '4px 8px', color: '#ef4444', borderColor: '#ef4444' }}
              onClick={handleReject}
              data-testid="confirm-reject-btn"
            >
              Confirm Reject
            </button>
            <button
              type="button"
              className="di-btn-ghost"
              style={{ fontSize: 10, padding: '4px 8px' }}
              onClick={() => setShowRejectForm(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Action Controls */}
      {canReview && approvalState === 'unapproved' && !isEditing && !showRejectForm && (
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }} data-testid="proposal-action-controls">
          <button
            type="button"
            className="di-btn di-btn-ok"
            style={{ flex: 1, fontSize: 10.5, padding: '5px 8px', gap: 4 }}
            disabled={!proposalData.validation.valid}
            onClick={handleApprove}
            data-testid="approve-proposal-btn"
          >
            <CheckCircle2 size={13} /> Approve
          </button>
          <button
            type="button"
            className="di-btn"
            style={{ fontSize: 10.5, padding: '5px 8px', gap: 4 }}
            onClick={() => setIsEditing(true)}
            data-testid="manual-edit-btn"
          >
            <Edit3 size={13} /> Manual Edit
          </button>
          <button
            type="button"
            className="di-btn"
            style={{ fontSize: 10.5, padding: '5px 8px', gap: 4, color: '#ef4444', borderColor: '#ef4444' }}
            onClick={() => setShowRejectForm(true)}
            data-testid="reject-proposal-btn"
          >
            <XCircle size={13} /> Reject
          </button>
        </div>
      )}
    </div>
  );
}
