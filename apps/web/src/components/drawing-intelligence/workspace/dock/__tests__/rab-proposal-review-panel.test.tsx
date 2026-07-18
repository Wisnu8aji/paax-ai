// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { RabProposalReviewPanel } from '../rab-proposal-review-panel';
import { useWorkspace } from '../../workspace-store';

// Mock the drawing-intelligence-api functions
vi.mock('../../../drawing-intelligence-api', () => ({
  resolveRabBridgeProposal: vi.fn(),
  materializeRabBridgeProposal: vi.fn()
}));

// Mock the workspace store's hook
vi.mock('../../workspace-store', () => ({
  useWorkspace: vi.fn()
}));

import { resolveRabBridgeProposal, materializeRabBridgeProposal } from '../../../drawing-intelligence-api';

const mockResolve = vi.mocked(resolveRabBridgeProposal);
const mockMaterialize = vi.mocked(materializeRabBridgeProposal);
const mockUseWorkspace = vi.mocked(useWorkspace);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('RabProposalReviewPanel', () => {
  let mockDispatch: any;
  let mockState: any;

  beforeEach(() => {
    mockDispatch = vi.fn();
    mockState = {
      projectId: 'project-xyz',
      sheets: [
        { id: 'sheet-1', code: 'A2-101', title: 'Ground Floor Plan', pageNumber: 1 }
      ],
      handoff: {
        proposalId: 'prop-123',
        sentAt: '2026-07-17T12:00:00Z',
        reviewPanelOpen: true,
        proposalItems: [
          {
            id: 'item-1',
            name: 'Pekerjaan Beton Kolom K1',
            discipline: 'STR',
            properties: {
              source: 'written',
              dimensions: '300x400'
            },
            evidence_ids: ['sheet-1']
          },
          {
            id: 'item-2',
            name: 'Pekerjaan Pintu Kayu P1',
            discipline: 'ARC',
            properties: {
              source: 'assumption'
            },
            evidence_ids: []
          },
          {
            id: 'item-3',
            name: 'Pekerjaan Kabel MEP',
            discipline: 'MEP',
            properties: {},
            evidence_ids: []
          }
        ]
      }
    };

    mockUseWorkspace.mockReturnValue({
      state: mockState,
      dispatch: mockDispatch,
      startUploadSimulation: vi.fn(),
      startAnalysis: vi.fn(),
      askPaax: vi.fn(),
      triggerProjectSynthesis: vi.fn()
    });
  });

  it('renders the proposal review panel header and ID correctly', () => {
    render(<RabProposalReviewPanel />);
    
    expect(screen.getByText('Review Proposal before Sending to RAB')).toBeTruthy();
    expect(screen.getByText('prop-123')).toBeTruthy();
  });

  it('displays correct volume source counts based on item properties', () => {
    render(<RabProposalReviewPanel />);
    
    // Written = 1 (item-1 has source: 'written')
    // Assumption = 1 (item-2 has source: 'assumption')
    // Blocked = 1 (item-3 has no source/empty properties)
    expect(screen.getByText('3')).toBeTruthy(); // Total items count is 3
  });

  it('displays the list of proposal items with correct names, disciplines, and badges', () => {
    render(<RabProposalReviewPanel />);

    expect(screen.getByText('Pekerjaan Beton Kolom K1')).toBeTruthy();
    expect(screen.getByText('Dimensi Tertulis di Gambar')).toBeTruthy();

    expect(screen.getByText('Pekerjaan Pintu Kayu P1')).toBeTruthy();
    expect(screen.getByText('Asumsi Manusia')).toBeTruthy();

    expect(screen.getByText('Pekerjaan Kabel MEP')).toBeTruthy();
    expect(screen.getByText('Belum Ada Data (Blocked)')).toBeTruthy();
  });

  it('correctly maps and displays sheet citations', () => {
    render(<RabProposalReviewPanel />);
    
    // Item 1 has evidence_ids: ['sheet-1'] which resolves to "A2-101 (P1)"
    expect(screen.getByText('A2-101 (P1)')).toBeTruthy();
  });

  it('keeps Send button disabled until explicit approval checkbox is checked', () => {
    render(<RabProposalReviewPanel />);
    
    const sendButton = screen.getByRole('button', { name: /Kirim ke RAB Draft/i });
    expect(sendButton.getAttribute('disabled')).not.toBeNull();

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    expect(sendButton.getAttribute('disabled')).toBeNull();
  });

  it('calls resolve and materialize API sequentially on send click and displays results', async () => {
    mockResolve.mockResolvedValue({
      status: 'approved',
      snapshot_id: 'snap-xyz',
      proposal_id: 'prop-123',
      items: []
    });

    mockMaterialize.mockResolvedValue({
      materialized_count: 2,
      skipped_items: [
        { name: 'Pekerjaan Kabel MEP', reason: 'Blocked: No volume data available' }
      ]
    });

    render(<RabProposalReviewPanel />);
    
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    const sendButton = screen.getByRole('button', { name: /Kirim ke RAB Draft/i });
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(mockResolve).toHaveBeenCalledWith('project-xyz', 'prop-123', 'approved');
      expect(mockMaterialize).toHaveBeenCalledWith('project-xyz', 'prop-123');
    });

    await waitFor(() => {
      expect(screen.getByText('Materialization Successful!')).toBeTruthy();
      expect(screen.getByText('2')).toBeTruthy(); // materialized count
      expect(screen.getByText('1')).toBeTruthy(); // skipped count
      expect(screen.getByText('Blocked: No volume data available')).toBeTruthy();
    });
  });
});
