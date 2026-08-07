// paax/web — EvidencePane (F2 #3, evidence mode + crop preview).
//
// Adaptasi zoomable-image.tsx konsol R1 + evidence drill-down. Crop/artifact
// preview dibuka dari trace (payload_ref). Evidence mode menampilkan crop
// + lineage (crop → page → evidence id) bila tersedia.

import { useState } from 'react'

export interface EvidencePaneProps {
  /** payload_ref aktif yang dipilih user (crop/artifact path). */
  selectedRef?: string | null
  onSelectRef?: (ref: string) => void
  /** Daftar payload_ref yang tersedia di trace artifact.created. */
  refs: string[]
}

export function ZoomableImage({ src, alt, caption }: { src: string; alt?: string; caption?: string }): React.ReactElement {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`zoom ${alt ?? 'crop'}`} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
        <img src={src} alt={alt ?? 'crop preview'} style={{ maxWidth: 180, maxHeight: 120, borderRadius: 6, border: '1px solid var(--di-border)' }} />
        {caption && <span style={{ display: 'block', fontSize: 9.5, color: 'var(--di-text3)' }}>{caption}</span>}
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
        >
          <div onClick={e => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '90vh' }}>
            <img src={src} alt={alt ?? 'crop preview'} style={{ maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain', borderRadius: 8 }} />
            {caption && <div style={{ color: '#ddd', fontSize: 12, marginTop: 6 }}>{caption}</div>}
            <button type="button" onClick={() => setOpen(false)} style={{ marginTop: 8, padding: '4px 12px', borderRadius: 5, cursor: 'pointer' }}>
              close
            </button>
          </div>
        </div>
      )}
    </>
  )
}

export function EvidencePane({ selectedRef, onSelectRef, refs }: EvidencePaneProps): React.ReactElement {
  const uniqueRefs = [...new Set(refs)].slice(0, 100)
  return (
    <div data-testid="evidence-pane" style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 220, maxWidth: 280 }}>
      <strong style={{ fontSize: 12 }}>Evidence</strong>
      {uniqueRefs.length === 0 && (
        <div style={{ fontSize: 10.5, color: 'var(--di-text3)' }}>Belum ada artifact/crop dari trace.</div>
      )}
      {uniqueRefs.map(ref => {
        const active = selectedRef === ref
        return (
          <button
            key={ref}
            type="button"
            data-testid="evidence-ref"
            data-active={active}
            onClick={() => onSelectRef?.(ref)}
            style={{
              textAlign: 'left',
              padding: '6px 8px',
              borderRadius: 6,
              fontSize: 9.5,
              fontFamily: 'var(--di-mono, monospace)',
              background: active ? 'rgba(59, 130, 246, 0.1)' : 'var(--di-panel)',
              border: `1px solid ${active ? 'var(--di-action, #3b82f6)' : 'var(--di-border)'}`,
              cursor: 'pointer',
              wordBreak: 'break-all',
            }}
          >
            {ref}
          </button>
        )
      })}
    </div>
  )
}
