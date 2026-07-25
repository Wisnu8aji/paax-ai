'use client';

/** Context bar elemen terpilih (blueprint §14.3). */

import { useWorkspace } from '../workspace-store';
import {
  Check,
  AlertTriangle,
  XCircle,
  X,
  MapPin,
  Ruler,
  Brain
} from 'lucide-react';
import type { DetectedElement, VerificationStatus } from '../di-types';

export interface SelectionContextBarProps {
  element: DetectedElement;
}

const CATEGORY_ICONS: Record<string, string> = {
  column: 'Column',
  beam: 'Beam',
  slab: 'Slab',
  'shear-wall': 'Shear Wall',
  wall: 'Wall',
  stair: 'Stair',
  door: 'Door',
  window: 'Window',
  room: 'Room',
};

export function SelectionContextBar({ element }: SelectionContextBarProps) {
  const { dispatch } = useWorkspace();

  const handleStatusChange = (status: VerificationStatus) => {
    dispatch({
      type: 'set-element-verification',
      elementId: element.id,
      status,
    });
    dispatch({
      type: 'push-activity',
      entry: {
        time: 'Now',
        message: `Status ${element.code} changed to ${status}`,
        kind: 'correction',
      },
    });
  };

  const getStatusTone = (status: VerificationStatus) => {
    switch (status) {
      case 'verified':
        return 'ok';
      case 'needs-review':
        return 'warn';
      case 'rejected':
        return 'err';
      default:
        return 'info';
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: 14,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'var(--di-panel)',
        border: '1px solid var(--di-border-strong)',
        borderRadius: 10,
        padding: '6px 12px',
        fontSize: 12.5,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        boxShadow: '0 10px 32px rgba(0, 0, 0, 0.65)',
        zIndex: 20,
        pointerEvents: 'auto',
      }}
      className="di-rise"
    >
      {/* Label Elemen */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          className="di-mono"
          style={{
            fontWeight: 700,
            color: 'var(--di-text)',
            fontSize: 13,
            background: 'var(--di-panel2)',
            padding: '2px 6px',
            borderRadius: 4,
            border: '1px solid var(--di-border)',
          }}
        >
          {element.code}
        </span>
        <span style={{ color: 'var(--di-text2)', fontWeight: 500 }}>
          {CATEGORY_ICONS[element.category] || element.category}
        </span>
      </div>

      {/* Grid Sumbu */}
      {element.grid && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            color: 'var(--di-text2)',
          }}
          title="Grid Location"
        >
          <MapPin size={13} style={{ color: 'var(--di-accent)' }} />
          <span className="di-mono">{element.grid}</span>
        </div>
      )}

      {/* Dimensi */}
      {element.dimensions && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            color: 'var(--di-text2)',
          }}
          title="Dimensions"
        >
          <Ruler size={13} style={{ color: 'var(--di-text3)' }} />
          <span className="di-mono">{element.dimensions}</span>
        </div>
      )}

      {/* Confidence */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          color: 'var(--di-text3)',
        }}
        title="AI Confidence Score"
      >
        <Brain size={13} style={{ color: 'var(--di-info)' }} />
        <span className="di-mono">{element.confidence}%</span>
      </div>

      {/* Divider */}
      <span
        style={{ width: 1, height: 16, background: 'var(--di-border-strong)' }}
      />

      {/* Status Pill */}
      <span
        className="di-pill"
        data-tone={getStatusTone(element.verification)}
        style={{ textTransform: 'uppercase', fontSize: 10, height: 20 }}
      >
        {element.verification.replace('-', ' ')}
      </span>

      {/* Divider */}
      <span
        style={{ width: 1, height: 16, background: 'var(--di-border-strong)' }}
      />

      {/* Tombol Aksi */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* Setuju / Verify */}
        <button
          className="di-icon-btn"
          data-active={element.verification === 'verified'}
          onClick={() => handleStatusChange('verified')}
          title="Verify element"
          style={{
            width: 26,
            height: 26,
            color:
              element.verification === 'verified'
                ? 'var(--di-ok)'
                : 'var(--di-text2)',
          }}
        >
          <Check size={14} />
        </button>

        {/* Butuh Review */}
        <button
          className="di-icon-btn"
          data-active={element.verification === 'needs-review'}
          onClick={() => handleStatusChange('needs-review')}
          title="Mark needs review"
          style={{
            width: 26,
            height: 26,
            color:
              element.verification === 'needs-review'
                ? 'var(--di-warn)'
                : 'var(--di-text2)',
          }}
        >
          <AlertTriangle size={14} />
        </button>

        {/* Tolak / Reject */}
        <button
          className="di-icon-btn"
          data-active={element.verification === 'rejected'}
          onClick={() => handleStatusChange('rejected')}
          title="Reject detection"
          style={{
            width: 26,
            height: 26,
            color:
              element.verification === 'rejected'
                ? 'var(--di-err)'
                : 'var(--di-text2)',
          }}
        >
          <XCircle size={14} />
        </button>

        {/* Divider */}
        <span
          style={{
            width: 1,
            height: 16,
            background: 'var(--di-border-strong)',
            margin: '0 2px',
          }}
        />

        {/* Tutup Seleksi */}
        <button
          className="di-icon-btn"
          onClick={() => dispatch({ type: 'select-element', elementId: null })}
          title="Clear selection (Esc)"
          style={{ width: 26, height: 26 }}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

