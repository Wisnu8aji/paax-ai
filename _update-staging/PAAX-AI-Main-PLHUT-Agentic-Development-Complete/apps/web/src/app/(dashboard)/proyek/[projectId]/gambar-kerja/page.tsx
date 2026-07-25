'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { FileImage, UploadCloud } from 'lucide-react';
import { Card, StatCard, StatusPill, Button } from '@/components/ui';
import { useShell } from '@/components/app-shell/shell-context';
import { TkgWorkspace } from '@/components/drawings/tkg-workspace';
import { drawingsRepository, type ProjectDrawingFile } from '@/lib/projects/drawings-repository';

function formatSize(bytes: number): string {
  if (bytes >= 1e6) return `${(bytes / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })} MB`;
  if (bytes >= 1e3) return `${Math.round(bytes / 1e3).toLocaleString('id-ID')} KB`;
  return `${bytes} B`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function ProjectGambarKerjaPage() {
  const { openOverlay } = useShell();
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const [files, setFiles] = useState<ProjectDrawingFile[]>([]);

  const refreshFiles = useCallback(() => {
    void drawingsRepository.list(projectId).then(setFiles);
  }, [projectId]);

  useEffect(() => {
    refreshFiles();
    const onUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId?: string }>).detail;
      if (!detail?.projectId || detail.projectId === projectId) refreshFiles();
    };
    window.addEventListener('paax-drawings-updated', onUpdated);
    return () => window.removeEventListener('paax-drawings-updated', onUpdated);
  }, [projectId, refreshFiles]);

  const summary = [
    { label: 'Gambar Diunggah', value: files.length.toLocaleString('id-ID'), sub: 'file proyek tersimpan' },
    { label: 'Metadata Tersimpan', value: files.filter((file) => !file.dataUrl).length.toLocaleString('id-ID'), sub: 'file besar / non-preview' },
    { label: 'Preview Lokal', value: files.filter((file) => file.dataUrl).length.toLocaleString('id-ID'), sub: 'file kecil tersimpan lokal' },
    { label: 'Status AI', value: 'Ditunda', sub: 'OCR/CV menunggu prompt terpisah' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <TkgWorkspace projectId={projectId} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }} className="pax-grid-4">
        {summary.map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} sub={s.sub} />
        ))}
      </div>

      <Card padding={18}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Gambar Proyek</span>
          <Button variant="secondary" onClick={() => openOverlay('upload')}>
            <UploadCloud size={14} /> Unggah
          </Button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {files.map((file) => (
            <div key={file.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <span style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)' }}>
                <FileImage size={18} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
                <div className="pax-mono" style={{ fontSize: 11, color: 'var(--text3)' }}>
                  {formatSize(file.sizeBytes)} · {file.mimeType} · {formatDate(file.uploadedAt)}
                </div>
              </div>
              <StatusPill tone="warn">MENUNGGU REVIEW</StatusPill>
            </div>
          ))}
          {files.length === 0 && (
            <div style={{ padding: 16, borderRadius: 12, background: 'var(--surface)', border: '1px dashed var(--border)', color: 'var(--text3)', fontSize: 12.5 }}>
              Belum ada gambar proyek. Klik Unggah untuk menyimpan file ke proyek ini.
            </div>
          )}
        </div>
      </Card>

      <p style={{ fontSize: 11, color: 'var(--text3)' }}>
        Upload menyimpan file/metadata. AI vision/OCR untuk membaca isi gambar dikerjakan di prompt terpisah.
      </p>
    </div>
  );
}
