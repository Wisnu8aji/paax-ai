'use client';

import { useMemo, useState } from 'react';
import { useWorkspace } from '../workspace-store';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowLeft,
  ChevronRight,
  ShieldCheck,
  Loader2,
  Bookmark,
  FileSpreadsheet
} from 'lucide-react';
import {
  resolveRabBridgeProposal,
  materializeRabBridgeProposal
} from '../../drawing-intelligence-api';

export function RabProposalReviewPanel() {
  const { state, dispatch } = useWorkspace();
  const { proposalId, proposalItems, sentAt } = state.handoff;

  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<{
    materialized_count: number;
    skipped_items: { name: string; reason: string }[];
  } | null>(null);

  // Map sheets by ID to resolve citations quickly
  const sheetsMap = useMemo(() => {
    const map = new Map<string, typeof state.sheets[number]>();
    for (const sheet of state.sheets) {
      map.set(sheet.id, sheet);
    }
    return map;
  }, [state.sheets]);

  // Helper to determine the volume source based on properties
  const getVolumeSourceDetails = (item: any) => {
    const props = item.properties || {};
    const source = props.source || props.volume_source || '';
    
    // Explicitly check for dimensions or measurement facts in the properties
    const hasDimensions = props.dimensions || props.stored_measurement_facts || props.dimension_count;
    
    if (source === 'written' || source === 'dimension' || hasDimensions) {
      return {
        type: 'written' as const,
        label: 'Dimensi Tertulis di Gambar',
        tone: 'ok' as const,
        style: {
          background: 'var(--di-ok-bg)',
          border: '1px solid var(--di-ok-bd)',
          color: 'var(--di-ok)',
        }
      };
    }
    
    if (source === 'assumption' || props.assumptions || props.quantity_assumption_id) {
      return {
        type: 'assumption' as const,
        label: 'Asumsi Manusia',
        tone: 'warn' as const,
        style: {
          background: 'var(--di-warn-bg)',
          border: '1px solid var(--di-warn-bd)',
          color: 'var(--di-warn)',
        }
      };
    }
    
    return {
      type: 'blocked' as const,
      label: 'Belum Ada Data (Blocked)',
      tone: 'err' as const,
      style: {
        background: 'var(--di-err-bg)',
        border: '1px solid var(--di-err-bd)',
        color: 'var(--di-err)',
      }
    };
  };

  // Summarize items sources
  const summary = useMemo(() => {
    let written = 0;
    let assumption = 0;
    let blocked = 0;

    const items = proposalItems || [];
    for (const item of items) {
      const details = getVolumeSourceDetails(item);
      if (details.type === 'written') written++;
      else if (details.type === 'assumption') assumption++;
      else blocked++;
    }

    return { total: items.length, written, assumption, blocked };
  }, [proposalItems]);

  const handleBack = () => {
    dispatch({
      type: 'handoff',
      patch: { reviewPanelOpen: false }
    });
  };

  const handleSendToRabDraft = async () => {
    if (!agreed || !proposalId || !state.projectId) return;

    setLoading(true);
    setErrorMsg(null);
    try {
      // Step 1: POST .../rab-bridge/{proposal_id}/resolve (status: "approved")
      await resolveRabBridgeProposal(state.projectId, proposalId, 'approved');

      // Step 2: POST .../rab-bridge/{proposal_id}/materialize
      const materializeRes = await materializeRabBridgeProposal(state.projectId, proposalId);

      setResult(materializeRes);
      dispatch({
        type: 'push-activity',
        entry: {
          time: 'Now',
          message: `Materialized ${materializeRes.materialized_count} items from Proposal ${proposalId} to RAB Draft`,
          kind: 'handoff'
        }
      });
      dispatch({ type: 'set-status', message: 'Proposal materialized to RAB Draft' });
    } catch (err: any) {
      console.error('Materialize error:', err);
      setErrorMsg(err.message || 'Gagal memproses materialisasi proposal.');
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = () => {
    dispatch({
      type: 'handoff',
      patch: { reviewPanelOpen: false, sent: true }
    });
  };

  const formattedSentAt = useMemo(() => {
    if (!sentAt) return '';
    const d = new Date(sentAt);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }, [sentAt]);

  if (result) {
    return (
      <section style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        <div style={{ flex: 1, overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          
          <div className="di-panel di-rise" style={{ borderRadius: 14, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--di-ok)' }}>
              <CheckCircle2 size={32} />
              <h2 style={{ fontFamily: 'var(--di-font-display)', fontSize: 18, margin: 0 }}>Materialization Successful!</h2>
            </div>
            
            <p style={{ fontSize: 13, color: 'var(--di-text2)', margin: 0 }}>
              Proposal <span className="di-mono" style={{ color: 'var(--di-text)', fontWeight: 600 }}>{proposalId}</span> has been processed. The items have been generated and appended to the RAB Draft.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 4 }}>
              <div className="di-panel" style={{ padding: '16px 20px', borderRadius: 10, background: 'color-mix(in srgb, var(--di-ok) 6%, transparent)' }}>
                <div style={{ fontSize: 11, color: 'var(--di-text2)' }}>Materialized Count</div>
                <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--di-font-mono)', color: 'var(--di-ok)', margin: '4px 0' }}>
                  {result.materialized_count}
                </div>
                <div style={{ fontSize: 11, color: 'var(--di-text3)' }}>Successfully written to RAB Draft</div>
              </div>

              <div className="di-panel" style={{ padding: '16px 20px', borderRadius: 10, background: result.skipped_items?.length ? 'color-mix(in srgb, var(--di-err) 6%, transparent)' : 'var(--di-panel)' }}>
                <div style={{ fontSize: 11, color: 'var(--di-text2)' }}>Skipped Count</div>
                <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--di-font-mono)', color: result.skipped_items?.length ? 'var(--di-err)' : 'var(--di-text3)', margin: '4px 0' }}>
                  {result.skipped_items?.length || 0}
                </div>
                <div style={{ fontSize: 11, color: 'var(--di-text3)' }}>Items skipped during materialization</div>
              </div>
            </div>

            {result.skipped_items && result.skipped_items.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <h3 style={{ fontFamily: 'var(--di-font-display)', fontSize: 13.5, margin: '0 0 8px', color: 'var(--di-err)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertTriangle size={14} /> Skipped Items Detail
                </h3>
                <div className="di-panel" style={{ borderRadius: 10, overflow: 'hidden' }}>
                  <table className="di-table" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th>Item Name</th>
                        <th>Skipped Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.skipped_items.map((item, idx) => (
                        <tr key={idx}>
                          <td style={{ fontWeight: 500, color: 'var(--di-text)' }}>{item.name}</td>
                          <td style={{ color: 'var(--di-err)', fontFamily: 'var(--di-font-mono)', fontSize: 11.5 }}>
                            {item.reason}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="di-btn di-btn-primary" onClick={handleComplete}>
                Close Review
              </button>
            </div>
          </div>

        </div>
      </section>
    );
  }

  return (
    <section style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      
      {/* Top action header */}
      <div
        style={{
          flexShrink: 0,
          padding: '12px 20px',
          borderBottom: '1px solid var(--di-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: 'var(--di-panel)',
        }}
      >
        <button className="di-icon-btn" onClick={handleBack} disabled={loading}>
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 style={{ fontFamily: 'var(--di-font-display)', fontSize: 14.5, margin: 0, fontWeight: 600 }}>
            Review Proposal before Sending to RAB
          </h1>
          <div style={{ fontSize: 11, color: 'var(--di-text3)', display: 'flex', gap: 10, marginTop: 2 }}>
            <span>Proposal ID: <strong className="di-mono" style={{ color: 'var(--di-text2)' }}>{proposalId}</strong></span>
            <span>•</span>
            <span>Sent: {formattedSentAt}</span>
          </div>
        </div>
      </div>

      {/* Main Review Area */}
      <div style={{ flex: 1, overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        
        {/* Transparent Volume Source Info Card */}
        <div className="di-panel" style={{ borderRadius: 10, padding: '14px 18px', background: 'var(--di-panel2)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 style={{ fontFamily: 'var(--di-font-display)', fontSize: 13, margin: 0, color: 'var(--di-text2)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            RAB Bridge Proposal Volume Summary
          </h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 10.5, color: 'var(--di-text3)' }}>Total Items</span>
              <span className="di-mono" style={{ fontSize: 20, fontWeight: 700, color: 'var(--di-text)' }}>{summary.total}</span>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 10.5, color: 'var(--di-text3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--di-ok)' }} /> Written Dimensions
              </span>
              <span className="di-mono" style={{ fontSize: 20, fontWeight: 700, color: 'var(--di-ok)' }}>{summary.written}</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 10.5, color: 'var(--di-text3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--di-warn)' }} /> Human Assumptions
              </span>
              <span className="di-mono" style={{ fontSize: 20, fontWeight: 700, color: 'var(--di-warn)' }}>{summary.assumption}</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 10.5, color: 'var(--di-text3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--di-err)' }} /> Blocked / No Data
              </span>
              <span className="di-mono" style={{ fontSize: 20, fontWeight: 700, color: 'var(--di-err)' }}>{summary.blocked}</span>
            </div>
          </div>
        </div>

        {/* List of Proposal Items */}
        <div>
          <h2 style={{ fontFamily: 'var(--di-font-display)', fontSize: 14, margin: '0 0 10px' }}>
            Proposal Items List
          </h2>
          
          <div className="di-panel" style={{ borderRadius: 10, overflow: 'hidden' }}>
            <table className="di-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Item Name</th>
                  <th>Discipline</th>
                  <th>Suggested AHSP</th>
                  <th>Volume Source Badge</th>
                  <th>Evidence Citation</th>
                </tr>
              </thead>
              <tbody>
                {proposalItems && proposalItems.length > 0 ? (
                  proposalItems.map((item: any) => {
                    const sourceDetails = getVolumeSourceDetails(item);
                    
                    // Suggested AHSP
                    const ahspCode = item.ahsp_code || item.properties?.ahsp_code;
                    const ahspText = ahspCode ? (
                      <span className="di-mono" style={{ color: 'var(--di-text)' }}>{ahspCode}</span>
                    ) : (
                      <span style={{ color: 'var(--di-text3)', fontSize: 11, fontStyle: 'italic' }}>
                        akan disarankan otomatis saat materialize
                      </span>
                    );

                    // Evidence Citations Mapping
                    const citations = item.evidence_ids?.map((evId: string) => {
                      const sheet = sheetsMap.get(evId);
                      if (sheet) {
                        return `${sheet.code} (P${sheet.pageNumber})`;
                      }
                      return evId;
                    }) || [];

                    return (
                      <tr key={item.node_id || item.id}>
                        <td>
                          <div style={{ fontWeight: 500 }}>{item.name}</div>
                          <div className="di-mono" style={{ fontSize: 10, color: 'var(--di-text3)' }}>{item.node_id || item.id}</div>
                        </td>
                        <td>
                          <span className="di-disc" data-d={item.discipline || 'STR'}>
                            {item.discipline || 'STR'}
                          </span>
                        </td>
                        <td>{ahspText}</td>
                        <td>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              padding: '2px 8px',
                              borderRadius: 4,
                              fontSize: 10.5,
                              fontWeight: 600,
                              ...sourceDetails.style
                            }}
                          >
                            {sourceDetails.label}
                          </span>
                        </td>
                        <td>
                          {citations.length > 0 ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {citations.map((c: string, idx: number) => (
                                <span key={idx} className="di-pill" style={{ background: 'var(--di-panel2)', color: 'var(--di-text2)' }}>
                                  <Bookmark size={10} style={{ opacity: 0.6 }} /> {c}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span style={{ color: 'var(--di-text3)', fontSize: 11 }}>No citation</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: 'var(--di-text3)', padding: 24 }}>
                      No items found in this proposal.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Footer controls & Explicit Human Approval Checkbox */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          padding: '16px 20px',
          background: 'var(--di-panel)',
          borderTop: '1px solid var(--di-border)',
        }}
      >
        {errorMsg && (
          <div
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              background: 'var(--di-err-bg)',
              border: '1px solid var(--di-err-bd)',
              color: 'var(--di-err)',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <XCircle size={14} />
            <span>Error: {errorMsg}</span>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <input
            id="explicit-approval-checkbox"
            type="checkbox"
            checked={agreed}
            disabled={loading || !proposalItems || proposalItems.length === 0}
            onChange={(e) => setAgreed(e.target.checked)}
            style={{ marginTop: 3, cursor: 'pointer' }}
          />
          <label
            htmlFor="explicit-approval-checkbox"
            style={{
              fontSize: 12,
              color: agreed ? 'var(--di-text)' : 'var(--di-text2)',
              cursor: 'pointer',
              userSelect: 'none',
              lineHeight: 1.4,
            }}
          >
            <strong style={{ color: 'var(--di-text)' }}>Explicit Approval (D12):</strong> Saya menyatakan bahwa saya telah meneliti usulan item RAB ini beserta sumber volumenya secara sadar dan menyetujui materialisasi item-item ini ke dalam draf RAB proyek.
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
          <button className="di-btn di-btn-ghost" onClick={handleBack} disabled={loading}>
            Back
          </button>
          
          <button
            className="di-btn di-btn-ok"
            style={{
              background: agreed ? 'var(--di-ok)' : 'var(--di-panel2)',
              borderColor: agreed ? 'transparent' : 'var(--di-border)',
              color: agreed ? 'var(--di-bg)' : 'var(--di-text3)',
              cursor: agreed && !loading ? 'pointer' : 'not-allowed',
            }}
            disabled={!agreed || loading || !proposalItems || proposalItems.length === 0}
            onClick={handleSendToRabDraft}
          >
            {loading ? (
              <>
                <Loader2 className="di-spin" size={14} /> Processing Materialization...
              </>
            ) : (
              <>
                <ShieldCheck size={14} /> Kirim ke RAB Draft
              </>
            )}
          </button>
        </div>
      </div>

    </section>
  );
}
