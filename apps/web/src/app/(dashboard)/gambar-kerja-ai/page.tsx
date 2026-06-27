'use client';

import { UploadCloud, FileImage } from 'lucide-react';
import { Card, StatCard, StatusPill, Button, PageHeader, type PillTone } from '@/components/ui';
import { useShell } from '@/components/app-shell/shell-context';
import { drawingSummary, drawings } from '@/lib/mock/workspace';

const statusMap: Record<string, { tone: PillTone; label: string }> = {
  analyzed: { tone: 'ok', label: 'DIANALISIS' },
  pending: { tone: 'warn', label: 'MENUNGGU' },
  failed: { tone: 'dng', label: 'GAGAL' },
};

export default function GambarKerjaAIPage() {
  const { openOverlay } = useShell();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title="Gambar Kerja AI"
        subtitle="Upload, analisis, verifikasi, dan siapkan data gambar untuk BOQ/RAB"
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 13px', borderRadius: 9, background: 'color-mix(in srgb,var(--text) 5%,transparent)', border: '1px solid color-mix(in srgb,var(--text) 10%,transparent)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--ok-dot)', animation: 'paxpulse 2.4s infinite' }} />
            <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text2)' }}>Service Online · Demo Fallback</span>
          </div>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }} className="pax-grid-4">
        {drawingSummary.map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} sub={s.sub} />
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 14 }} className="pax-grid-2">
        <Card padding={18}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>Unggah Gambar</div>
          <div
            onClick={() => openOverlay('upload')}
            className="pax-card-hover"
            style={{ cursor: 'pointer', border: '1.5px dashed var(--border)', borderRadius: 14, padding: '40px 16px', textAlign: 'center', color: 'var(--text3)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}
          >
            <UploadCloud size={30} />
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)' }}>Tarik gambar atau klik untuk unggah</div>
            <div style={{ fontSize: 12 }}>PDF / DWG / JPG / PNG</div>
            <Button variant="secondary" style={{ marginTop: 6 }}>Pilih File</Button>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 10 }}>Tampilan contoh — analisis AI berjalan dalam mode demo fallback.</p>
        </Card>

        <Card padding={18}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>Gambar Terbaru</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {drawings.map((d) => {
              const st = statusMap[d.status];
              return (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <span style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)' }}>
                    <FileImage size={18} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{d.name}</div>
                    <div className="pax-mono" style={{ fontSize: 11, color: 'var(--text3)' }}>{d.sheet} · {d.type}</div>
                  </div>
                  {d.confidence > 0 && (
                    <span className="pax-mono" style={{ fontSize: 11, color: 'var(--text2)' }}>{d.confidence.toFixed(2)}</span>
                  )}
                  <StatusPill tone={st.tone}>{st.label}</StatusPill>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
