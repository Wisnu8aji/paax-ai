'use client';

// paax/web — QuantaLivePanel (MP3-P2): data QUANTA live dari event gateway.
//
// Panel presentasional — data berasal dari selectQuantaFromEvents() yang
// sudah melewati gate anti-fake (scanRealEvents produksi). Bila gate menolak
// (`ok: false`) panel menampilkan status jujur TANPA data apa pun. Bila
// gateway belum terhubung dan belum ada event, tampil empty state jujur —
// tidak pernah substitusi sintetis.

import type { CSSProperties } from 'react';
import { ExternalLink, FlaskConical, ShieldAlert, WifiOff } from 'lucide-react';
import type { QuantaFormulaReceipt, QuantaRow, QuantaSelection } from './quanta-view';

const APPROVAL_PILL: Record<string, { label: string; tone: string }> = {
  pending: { label: 'Menunggu approval', tone: 'warn' },
  approved: { label: 'Approved', tone: 'ok' },
  rejected: { label: 'Rejected', tone: 'err' },
  excluded: { label: 'Excluded', tone: '' },
};

const ROW_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  'needs-review': 'Perlu review',
  verified: 'Terverifikasi',
  conflict: 'Data rancu',
  excluded: 'Dikecualikan',
  'pending-approval': 'Menunggu approval',
};

export interface QuantaLivePanelProps {
  selection: QuantaSelection;
  /** status transport gateway (untuk catatan jujur). */
  transportKind: string;
  transportConnected: boolean;
  onOpenEvidence: (row: QuantaRow) => void;
}

export function QuantaLivePanel({ selection, transportKind, transportConnected, onOpenEvidence }: QuantaLivePanelProps): React.ReactElement {
  const { ok, rows, receipts, scannedEvents } = selection;

  return (
    <div
      data-testid="quanta-live-panel"
      data-ok={ok ? 'true' : 'false'}
      data-rows={rows.length}
      className="di-panel"
      style={{ borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <FlaskConical size={13} color="var(--di-accent)" />
        <strong style={{ fontSize: 12 }}>QUANTA live — dari event gateway</strong>
        <span style={{ fontSize: 10, color: 'var(--di-text3)' }} data-testid="quanta-source-note">
          Hanya data dari event nyata (anti-fake gate aktif)
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--di-text3)' }}>
          {ok ? `${rows.length} row · ${receipts.length} formula receipt · ${scannedEvents} event discan` : `${scannedEvents} event discan`}
        </span>
      </div>

      {!ok && scannedEvents > 0 && (
        <div data-testid="quanta-gate-denied" style={{ fontSize: 10.5, color: 'var(--di-danger, #ef4444)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <ShieldAlert size={12} />
          Anti-fake gate menolak kumpulan event (marker simulasi/synthetic/invalid) — data QUANTA tidak ditampilkan.
        </div>
      )}

      {!ok && scannedEvents === 0 && (
        <div data-testid="quanta-empty" style={{ fontSize: 10.5, color: 'var(--di-text3)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <WifiOff size={12} />
          Belum ada event QUANTA dari gateway ({transportKind}{transportConnected ? ' · connected' : ' · disconnected'}). Tidak ada data sintetis yang ditampilkan.
        </div>
      )}

      {ok && rows.length === 0 && (
        <div data-testid="quanta-empty" style={{ fontSize: 10.5, color: 'var(--di-text3)' }}>
          {selection.runCompleted
            ? 'Run selesai tanpa row QUANTA atau formula receipt; quantity final tetap diblokir sampai ada evidence dan kalkulasi Core Engine.'
            : 'Belum ada row QUANTA pada run ini — menunggu event quanta.row_created dari runtime.'}
        </div>
      )}

      {ok && rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="di-table" style={{ minWidth: 860 }}>
            <thead>
              <tr>
                <th>Item pekerjaan</th>
                <th>Lokasi</th>
                <th>Satuan</th>
                <th style={{ textAlign: 'right' }}>Jumlah</th>
                <th>Formula</th>
                <th>Approval</th>
                <th style={{ width: 28 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const pill = APPROVAL_PILL[row.approval?.status ?? 'none'] ?? null;
                return (
                  <tr key={row.rowId} data-testid="quanta-row" data-row-id={row.rowId} data-status={row.status}>
                    <td>
                      <strong>{row.workItem}</strong>
                      <div className="di-mono" style={{ fontSize: 9.5, color: 'var(--di-text3)', marginTop: 2 }}>{row.rowId}</div>
                    </td>
                    <td style={{ fontSize: 11.5 }}>{row.location}</td>
                    <td className="di-mono" style={{ fontSize: 11.5 }}>{row.unit}</td>
                    <td className="di-mono" style={{ textAlign: 'right', fontWeight: 700, fontSize: 12 }}>
                      {row.qtyDisplay ?? (row.qty !== null ? row.qty : '—')}
                    </td>
                    <td style={{ fontSize: 10.5 }}>
                      {row.formulaRef ? (
                        <span className="di-mono" style={{ color: 'var(--di-accent)' }} data-testid="quanta-formula-ref">{row.formulaRef}</span>
                      ) : (
                        <span style={{ color: 'var(--di-text3)' }}>—</span>
                      )}
                      <div style={{ fontSize: 9.5, color: 'var(--di-text3)' }}>
                        <span className="di-pill" data-tone={row.status === 'verified' ? 'ok' : row.status === 'conflict' ? 'err' : 'warn'}>
                          {ROW_STATUS_LABEL[row.status] ?? row.status}
                        </span>
                      </div>
                    </td>
                    <td>
                      {pill ? (
                        <span className="di-pill" data-tone={pill.tone} data-testid="quanta-approval-pill">{pill.label}</span>
                      ) : (
                        <span style={{ fontSize: 10, color: 'var(--di-text3)' }}>—</span>
                      )}
                      {row.approval?.rationale && (
                        <div style={{ fontSize: 9.5, color: 'var(--di-text2)', maxWidth: 200, marginTop: 2, lineHeight: 1.4 }} title={row.approval.rationale}>
                          {row.approval.rationale}
                        </div>
                      )}
                      {row.approval?.resolvedBy && (
                        <div style={{ fontSize: 9, color: 'var(--di-text3)', marginTop: 1 }}>oleh {row.approval.resolvedBy}</div>
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {row.sourcePages.length > 0 && (
                        <button
                          type="button"
                          data-testid="quanta-evidence-link"
                          data-row-id={row.rowId}
                          data-page={row.sourcePages[0]}
                          className="di-icon-btn"
                          title={`Buka bukti sumber Halaman ${row.sourcePages[0]} (${row.evidenceRefs.join(', ')})`}
                          onClick={() => onOpenEvidence(row)}
                        >
                          <ExternalLink size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {ok && receipts.length > 0 && (
        <div data-testid="quanta-receipts" style={{ display: 'flex', flexDirection: 'column', gap: 4, borderTop: '1px dashed var(--di-border)', paddingTop: 6 }}>
          <div style={{ fontSize: 10, color: 'var(--di-text3)', fontWeight: 700 }}>FORMULA RECEIPTS</div>
          {receipts.slice(-8).map(r => (
            <div key={r.formulaId} style={{ fontSize: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="di-mono" style={{ color: 'var(--di-accent)' }}>{r.formulaId}</span>
              {r.expression && <span className="di-mono" style={{ color: 'var(--di-text2)' }}>{r.expression}</span>}
              <span className="di-mono" style={{ fontWeight: 700 }}>{r.resultDisplay ?? r.result ?? ''}</span>
              <span className="di-pill" data-tone={r.status === 'completed' || r.status === 'ok' ? 'ok' : 'warn'}>{r.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export const quantaPanelStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8 };
