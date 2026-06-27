'use client';

import { FileText, UploadCloud, Download } from 'lucide-react';
import { Card, Button, StatusPill, PageHeader } from '@/components/ui';
import { useShell } from '@/components/app-shell/shell-context';
import { files } from '@/lib/mock/workspace';

export default function FilesPage() {
  const { openOverlay } = useShell();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title="File & Dokumen"
        subtitle="Semua berkas proyek di satu tempat"
        actions={
          <Button onClick={() => openOverlay('upload')}>
            <UploadCloud size={15} /> Unggah File
          </Button>
        }
      />

      <Card padding={0}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {files.map((f, i) => (
            <div
              key={f.id}
              className="pax-row-hover"
              style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px', borderBottom: i < files.length - 1 ? '1px solid var(--border-soft)' : 'none' }}
            >
              <span style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)' }}>
                <FileText size={18} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{f.name}</div>
                <div className="pax-mono" style={{ fontSize: 11, color: 'var(--text3)' }}>{f.size} · {f.updatedAt}</div>
              </div>
              <StatusPill tone="neutral">{f.type}</StatusPill>
              <button aria-label="Unduh" style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <Download size={15} />
              </button>
            </div>
          ))}
        </div>
      </Card>
      <p style={{ fontSize: 11, color: 'var(--text3)' }}>Data contoh — unggahan belum tersambung ke penyimpanan.</p>
    </div>
  );
}
