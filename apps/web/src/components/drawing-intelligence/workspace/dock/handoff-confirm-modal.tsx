'use client';

/**
 * Modal konfirmasi "Send verified quantities?" (blueprint §21, gambar 10).
 * Tidak menghitung apa pun — hanya menampilkan count yang sudah ada di store
 * dan mengirim aksi dispatch saat dikonfirmasi.
 */

import { useState } from 'react';
import { useWorkspace } from '../workspace-store';
import { canHandoffQuantity } from '../quantity-authority';

export function HandoffConfirmModal({
  nVerified,
  nReview,
  projectName,
  onSent,
}: {
  nVerified: number;
  nReview: number;
  projectName: string;
  onSent: () => void;
}) {
  const { state, dispatch } = useWorkspace();
  const [ack, setAck] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!state.handoff.confirmOpen) return null;

  function close() {
    if (loading) return;
    dispatch({ type: 'handoff', patch: { confirmOpen: false } });
    setAck(false);
    setErrorMsg(null);
  }

  // WP2 guard: item dengan unit 'ref' adalah context-group (occurrence count),
  // BUKAN Measurement Fact terverifikasi. Harus diblokir dari jalur RAB.
  const eligibleItems = state.quantities.filter((q) => canHandoffQuantity({ sourceAuthority: q.sourceAuthority ?? 'none', status: q.status, unit: q.unit }));
  const blockedItems = state.quantities.filter((q) => q.status === 'verified' && !canHandoffQuantity({ sourceAuthority: q.sourceAuthority ?? 'none', status: q.status, unit: q.unit }));
  const blockedRefCount = blockedItems.length;

  async function confirmSend() {
    setLoading(true);
    setErrorMsg(null);
    try {
      const verifiedNodeIds = eligibleItems.map((q) => q.id)
        .filter(Boolean);

      if (verifiedNodeIds.length === 0) {
        throw new Error(
          blockedRefCount > 0
            ? `Semua ${blockedRefCount} item berstatus verified tidak memiliki otoritas Core Engine atau masih berupa context-group dan diblokir dari RAB. Pastikan item memiliki satuan fisik terverifikasi sebelum handoff.`
            : 'Tidak ada item terverifikasi (verified) untuk dikirim ke RAB Bridge.',
        );
      }

      if (!state.projectId) {
        throw new Error('Project ID tidak ditemukan.');
      }

      const { sendRabBridgeProposal } = await import('../../drawing-intelligence-api');
      const res = await sendRabBridgeProposal(state.projectId, verifiedNodeIds);

      dispatch({
        type: 'handoff',
        patch: {
          confirmOpen: false,
          sent: true,
          proposalId: res.proposal_id || null,
          sentAt: new Date().toISOString(),
          reviewPanelOpen: true,
          proposalItems: res.items || null,
        },
      });

      dispatch({
        type: 'push-activity',
        entry: {
          time: 'Now',
          message: `${nVerified} verified quantities sent to Cost & Quantity (Proposal ID: ${res.proposal_id || 'N/A'})`,
          kind: 'handoff',
        },
      });

      dispatch({ type: 'set-status', message: 'Verified quantities sent for approval' });
      setAck(false);
      onSent();
    } catch (err: any) {
      console.error('Handoff error:', err);
      setErrorMsg(err.message || 'Gagal mengirim quantities.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 70,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--di-overlay-bg)',
      }}
      onClick={close}
    >
      <div
        className="di-panel di-rise"
        style={{ width: 480, borderRadius: 14, padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ fontFamily: 'var(--di-font-display)', fontSize: 16, margin: 0 }}>Send verified quantities?</h2>

        <p style={{ fontSize: 12.5, color: 'var(--di-text2)', margin: 0 }}>
          <strong style={{ color: 'var(--di-text)' }}>{eligibleItems.length}</strong> verified items will be transferred to Cost
          &amp; Quantity.
        </p>
        {blockedRefCount > 0 && (
          <p style={{ fontSize: 12, color: 'var(--di-warn)', margin: '4px 0 0', fontWeight: 500 }}>
            ⚠ {blockedRefCount} item diblokir: bukan quantity final berotoritas Core Engine atau masih berupa context-group. Tidak terkirim ke RAB.
          </p>
        )}

        <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--di-text2)' }}>
          <li>
            Destination: <span className="di-mono">{projectName} — RAB draft v0.6</span>
          </li>
          <li>{nReview} unresolved items are excluded</li>
          <li>AHSP matches are transferred as suggestions only</li>
          <li>Existing draft lines will be appended, not replaced.</li>
        </ul>

        {nVerified === 0 && (
          <p style={{ fontSize: 12, color: 'var(--di-err)', margin: '4px 0 0', fontWeight: 600 }}>
            Peringatan: Tidak ada item terverifikasi untuk dikirim. Ubah status kuantitas ke "Verified" terlebih dahulu.
          </p>
        )}

        {errorMsg && (
          <p style={{ fontSize: 12, color: 'var(--di-err)', margin: '4px 0 0', fontWeight: 500 }}>
            Error: {errorMsg}
          </p>
        )}

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer', marginTop: 4 }}>
          <input type="checkbox" checked={ack} disabled={loading || eligibleItems.length === 0} onChange={(e) => setAck(e.target.checked)} />
          I have reviewed the excluded items.
        </label>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <button className="di-btn di-btn-ghost" disabled={loading} onClick={close}>
            Cancel
          </button>
          <button className="di-btn di-btn-ok" disabled={!ack || loading || eligibleItems.length === 0} onClick={confirmSend}>
            {loading ? 'Sending...' : `Send ${eligibleItems.length} items`}
          </button>
        </div>
      </div>
    </div>
  );
}
