'use client';
import { useState } from 'react';
import { Magnet, RotateCcw, RotateCw, Ruler, ShieldCheck } from 'lucide-react';
import { useWorkspace } from '../workspace-store';

export function TakeoffInspector() {
  const { state } = useWorkspace();
  const [snap, setSnap] = useState(true);
  const [ortho, setOrtho] = useState(false);
  return <aside style={{ width: 292, borderLeft: '1px solid var(--di-border)', background: 'var(--di-panel)', padding: 12, overflow: 'auto' }}>
    <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}><Ruler size={16} color="var(--di-accent)" /><strong style={{ fontSize: 13 }}>Takeoff Workbench</strong></div>
    <p style={{ fontSize: 11, color: 'var(--di-text3)', lineHeight: 1.5 }}>Tool aktif: <b>{state.canvas.tool}</b>. Geometri merupakan draft sampai dikalibrasi dan diverifikasi.</p>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
      <button onClick={() => setSnap(!snap)} style={{ height: 32, background: snap ? 'var(--di-accent-soft)' : undefined }}><Magnet size={13} /> Snap {snap ? 'On' : 'Off'}</button>
      <button onClick={() => setOrtho(!ortho)} style={{ height: 32, background: ortho ? 'var(--di-accent-soft)' : undefined }}>Ortho {ortho ? 'On' : 'Off'}</button>
      <button disabled title="Undo tersedia ketika operation ledger berisi aksi"><RotateCcw size={13} /> Undo</button>
      <button disabled title="Redo tersedia setelah undo"><RotateCw size={13} /> Redo</button>
    </div>
    <div style={{ marginTop: 12, padding: 10, border: '1px solid var(--di-border)', borderRadius: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}><ShieldCheck size={14} /> Authority lifecycle</div>
      <ol style={{ paddingLeft: 18, margin: '8px 0 0', fontSize: 10.5, color: 'var(--di-text3)', lineHeight: 1.6 }}>
        <li>Draft geometry</li><li>Scale/view calibration</li><li>Candidate review</li><li>Verified Measurement Fact</li><li>Core Engine calculation</li>
      </ol>
    </div>
  </aside>;
}
