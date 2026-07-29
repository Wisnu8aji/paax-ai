// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { AiProposalReview, type AiProposalData } from './ai-proposal-review';

afterEach(() => {
  cleanup();
});

const validProposal: AiProposalData = {
  trigger: 'abstain',
  deterministic_reason: 'Title block unclassified by deterministic regex',
  model: 'deepseek-v4-pro',
  prompt_version: 'di-assist-v1.0',
  allowed_fields: ['classification_key', 'evidence_refs', 'source_texts'],
  evidence_refs: ['ev-title-01'],
  confidence: 85,
  proposal: { classification_key: 'plan', evidence_refs: ['ev-title-01'] },
  validation: { valid: true, reason: 'bounded proposal is reviewable' },
  approval_state: 'unapproved',
};

describe('AiProposalReview Component', () => {
  it('renders nothing when proposalData is null or trigger is invalid', () => {
    const { container: nullContainer } = render(<AiProposalReview proposalData={null} />);
    expect(nullContainer.firstChild).toBeNull();
    cleanup();

    const invalidTriggerProposal: any = { ...validProposal, trigger: 'invalid_trigger' };
    const { container: invalidContainer } = render(
      <AiProposalReview proposalData={invalidTriggerProposal} />
    );
    expect(invalidContainer.firstChild).toBeNull();
  });

  it('renders abstention reason, model, prompt version, confidence, and validation details', () => {
    render(<AiProposalReview proposalData={validProposal} />);

    expect(screen.getByTestId('trigger-badge').textContent).toContain('abstain');
    expect(screen.getByTestId('abstention-reason').textContent).toContain(
      'Title block unclassified by deterministic regex'
    );
    expect(screen.getByTestId('proposal-model').textContent).toContain('deepseek-v4-pro');
    expect(screen.getByTestId('prompt-version').textContent).toContain('di-assist-v1.0');
    expect(screen.getByTestId('proposal-confidence').textContent).toContain('85%');
    expect(screen.getByTestId('allowed-fields').textContent).toContain('classification_key, evidence_refs, source_texts');
    expect(screen.getByTestId('evidence-refs').textContent).toContain('ev-title-01');
    expect(screen.getByTestId('validation-status').textContent).toContain('Deterministic Validation: bounded proposal is reviewable');
  });

  it('never displays proposal as core_engine authority or final numeric quantity', () => {
    render(<AiProposalReview proposalData={validProposal} />);

    const authority = screen.getByTestId('source-authority');
    expect(authority.textContent).toContain('proposal (review-only)');
    expect(authority.textContent).not.toContain('core_engine');
  });

  it('allows estimator or PM to approve a valid proposal', () => {
    const onApprove = vi.fn();
    render(<AiProposalReview proposalData={validProposal} userRole="estimator" onApprove={onApprove} />);

    const approveBtn = screen.getByTestId('approve-proposal-btn');
    fireEvent.click(approveBtn);

    expect(onApprove).toHaveBeenCalledWith(validProposal.proposal);
    expect(screen.getByTestId('approval-state-badge').textContent).toContain('approved');
  });

  it('allows user to reject proposal with a reason', () => {
    const onReject = vi.fn();
    render(<AiProposalReview proposalData={validProposal} userRole="pm" onReject={onReject} />);

    const rejectBtn = screen.getByTestId('reject-proposal-btn');
    fireEvent.click(rejectBtn);

    const reasonInput = screen.getByTestId('reject-reason-input');
    fireEvent.change(reasonInput, { target: { value: 'Invalid classification for detail sheet' } });

    const confirmRejectBtn = screen.getByTestId('confirm-reject-btn');
    fireEvent.click(confirmRejectBtn);

    expect(onReject).toHaveBeenCalledWith('Invalid classification for detail sheet');
    expect(screen.getByTestId('approval-state-badge').textContent).toContain('rejected');
  });

  it('allows user to submit manual correction', () => {
    const onManualCorrection = vi.fn();
    render(<AiProposalReview proposalData={validProposal} userRole="admin" onManualCorrection={onManualCorrection} />);

    const editBtn = screen.getByTestId('manual-edit-btn');
    fireEvent.click(editBtn);

    const editInput = screen.getByTestId('manual-edit-input');
    fireEvent.change(editInput, { target: { value: 'section_drawing' } });

    const saveBtn = screen.getByTestId('save-manual-edit-btn');
    fireEvent.click(saveBtn);

    expect(onManualCorrection).toHaveBeenCalledWith({ manual_entry: 'section_drawing' });
    expect(screen.getByTestId('approval-state-badge').textContent).toContain('edited');
  });

  it('blocks approve/reject controls for unauthorized viewer role', () => {
    render(<AiProposalReview proposalData={validProposal} userRole="viewer" />);

    expect(screen.queryByTestId('approve-proposal-btn')).toBeNull();
    expect(screen.queryByTestId('reject-proposal-btn')).toBeNull();
    expect(screen.getByTestId('rbac-denial-notice').textContent).toContain(
      "Role 'viewer' does not have permission to approve or reject proposals."
    );
  });

  it('displays provider error alert when provider error occurs', () => {
    const errorProposal: AiProposalData = {
      ...validProposal,
      error: 'HTTP 504 Gateway Timeout',
      validation: { valid: false, reason: 'Provider request timed out' },
    };

    render(<AiProposalReview proposalData={errorProposal} />);

    expect(screen.getByTestId('provider-error-alert').textContent).toContain('Provider Error: HTTP 504 Gateway Timeout');
    expect(screen.getByTestId('validation-status').textContent).toContain('Validation Failed: Provider request timed out');
  });
});
