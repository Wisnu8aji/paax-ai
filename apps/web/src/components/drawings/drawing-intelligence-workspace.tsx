'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  FileText,
  Play,
  Save,
  X,
} from 'lucide-react';
import { Button, Card, EmptyState, StatCard, StatusPill } from '@/components/ui';
import { DocumentIntelligenceClient, type DrawingFileMetadata } from '@/lib/document-intelligence-client';
import { DRAWING_STORAGE_KEYS, LocalStorage, projectStorageKey } from '@/lib/local-storage';
import type {
  BoqDraftItem,
  DocumentIntelligenceHealth,
  DrawingAnalysisResult,
  DrawingToRabContext,
  QuantityCandidate,
} from '@paax/types';

/**
 * Workspace Gambar Kerja AI — restyle 2026-07-03 ke design system medium grey.
 * Aturan Emas tetap: AI hanya MENGUSULKAN kuantitas; volume/harga final selalu
 * dihitung Core Engine setelah verifikasi manusia (lihat panel "BOQ Draft").
 */

interface DrawingIntelligenceWorkspaceProps {
  projectId?: string;
}

const inputStyle: CSSProperties = {
  width: '100%',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '9px 12px',
  fontSize: 13,
  color: 'var(--text)',
  outline: 'none',
};

const labelStyle: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  color: 'var(--text2)',
  display: 'block',
  marginBottom: 6,
};

const smallActionStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 5,
  padding: '6px 11px',
  borderRadius: 8,
  fontSize: 11.5,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'background .15s, color .15s',
};

export function DrawingIntelligenceWorkspace({ projectId = 'demo-project' }: DrawingIntelligenceWorkspaceProps) {
  const router = useRouter();
  const [health, setHealth] = useState<DocumentIntelligenceHealth | null>(null);
  const [fileName, setFileName] = useState('Denah_Lantai_1.pdf');
  const [fileType, setFileType] = useState('DRAWING_PDF');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<DrawingAnalysisResult | null>(null);
  const [verifiedQuantities, setVerifiedQuantities] = useState<QuantityCandidate[]>([]);
  const [boqDraft, setBoqDraft] = useState<BoqDraftItem[]>([]);
  const [isGeneratingBoq, setIsGeneratingBoq] = useState(false);

  useEffect(() => {
    DocumentIntelligenceClient.getHealth().then(setHealth);

    const savedContext = LocalStorage.get<DrawingToRabContext | null>(
      projectStorageKey(DRAWING_STORAGE_KEYS.CONTEXT, projectId),
      null,
    );
    const savedAnalysis = LocalStorage.get<DrawingAnalysisResult | null>(
      projectStorageKey(DRAWING_STORAGE_KEYS.ANALYSIS, projectId),
      null,
    );
    const savedBoqDraft = LocalStorage.get<BoqDraftItem[]>(
      projectStorageKey(DRAWING_STORAGE_KEYS.BOQ_DRAFT, projectId),
      [],
    );
    if (savedContext && savedContext.analysis_result) {
      setAnalysisResult(savedContext.analysis_result);
      setVerifiedQuantities(savedContext.verified_quantities || []);
      setBoqDraft(savedContext.boq_draft_items || []);
    } else {
      setAnalysisResult(savedAnalysis);
      setVerifiedQuantities(savedAnalysis?.quantity_candidates || []);
      setBoqDraft(savedBoqDraft);
    }
  }, [projectId]);

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    try {
      const metadata: DrawingFileMetadata = {
        file_name: fileName,
        file_type: fileType,
        project_id: projectId,
      };
      const result = await DocumentIntelligenceClient.analyzeDrawing(metadata);
      setAnalysisResult(result);
      LocalStorage.set(projectStorageKey(DRAWING_STORAGE_KEYS.ANALYSIS, projectId), result);
      setVerifiedQuantities(result.quantity_candidates || []);
      setBoqDraft([]);
    } catch (error) {
      console.error('Analysis failed', error);
      alert('Analisis gagal. Cek apakah Document Intelligence service berjalan.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleVerify = (candidateId: string, status: 'APPROVED' | 'REJECTED', newValue?: number) => {
    setVerifiedQuantities((prev) => {
      const updated = prev.map((c) => {
        if (c.id === candidateId) {
          return {
            ...c,
            status,
            needs_verification: false,
            value: newValue !== undefined ? newValue : c.value,
          };
        }
        return c;
      });
      if (analysisResult) {
        const updatedAnalysis = { ...analysisResult, quantity_candidates: updated };
        setAnalysisResult(updatedAnalysis);
        LocalStorage.set(projectStorageKey(DRAWING_STORAGE_KEYS.ANALYSIS, projectId), updatedAnalysis);
      }
      return updated;
    });
  };

  const handleGenerateBoqPreview = async () => {
    setIsGeneratingBoq(true);
    try {
      const approved = verifiedQuantities.filter((c) => c.status === 'APPROVED' || c.status === 'EDITED');
      if (approved.length === 0) {
        alert('Setujui minimal satu kuantitas sebelum membuat draft.');
        setIsGeneratingBoq(false);
        return;
      }
      const res = await DocumentIntelligenceClient.getBoqPreview(approved);
      setBoqDraft(res.draft_items);
      LocalStorage.set(projectStorageKey(DRAWING_STORAGE_KEYS.BOQ_DRAFT, projectId), res.draft_items);
    } catch (e) {
      console.error(e);
      alert('Gagal menyusun draft BOQ.');
    } finally {
      setIsGeneratingBoq(false);
    }
  };

  const handleHandoffToRab = () => {
    if (!analysisResult) return;
    const context: DrawingToRabContext = {
      project_id: projectId,
      drawing_file: fileName,
      analysis_result: analysisResult,
      verified_quantities: verifiedQuantities.filter((c) => c.status === 'APPROVED' || c.status === 'EDITED'),
      boq_draft_items: boqDraft,
      warnings: analysisResult.warnings.map((w) => w.message),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    LocalStorage.set(projectStorageKey(DRAWING_STORAGE_KEYS.CONTEXT, projectId), context);
    LocalStorage.set(projectStorageKey(DRAWING_STORAGE_KEYS.ANALYSIS, projectId), analysisResult);
    LocalStorage.set(projectStorageKey(DRAWING_STORAGE_KEYS.BOQ_DRAFT, projectId), boqDraft);

    const filesKey = projectStorageKey(DRAWING_STORAGE_KEYS.FILES, projectId);
    const existingFiles = LocalStorage.get<Array<Record<string, unknown>>>(filesKey, []);
    LocalStorage.set(filesKey, [...existingFiles, { name: fileName, type: fileType, project_id: projectId }]);

    router.push(`/proyek/${projectId}/rab`);
  };

  const approvedCount = verifiedQuantities.filter((q) => !q.needs_verification && q.status !== 'REJECTED').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 1400 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 className="pax-display" style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)' }}>
            Gambar Kerja AI
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--text2)' }}>
            Unggah, analisis, verifikasi, dan siapkan data gambar kerja untuk BOQ/RAB.
          </p>
        </div>
        {health?.status === 'ok' ? (
          <StatusPill tone="ok">
            Service Online ({health.mode === 'real_ai' ? 'Gemini AI' : 'Demo Fallback'})
          </StatusPill>
        ) : (
          <StatusPill tone="warn">Service Offline</StatusPill>
        )}
      </div>

      {/* Metrik */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }} className="pax-grid-4">
        <StatCard
          label="Drawing Files"
          value={analysisResult ? '1' : '0'}
          sub="Diunggah & diproses"
          icon={<FileText size={13} />}
        />
        <StatCard
          label="Approved Quantities"
          value={String(approvedCount)}
          sub="Siap untuk draft BOQ"
          icon={<CheckCircle2 size={13} />}
        />
        <StatCard
          label="Draft BOQ Items"
          value={String(boqDraft.length)}
          sub="Dari gambar terverifikasi"
          icon={<Save size={13} />}
        />
        <StatCard
          label="Drawing Warnings"
          value={String(analysisResult?.warnings.length || 0)}
          sub="Perlu perhatian"
          icon={<AlertTriangle size={13} />}
          dot={analysisResult?.warnings.length ? 'var(--warn-fg)' : undefined}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 14 }} className="pax-grid-2">
        {/* Intake */}
        <Card padding={20}>
          <div style={{ marginBottom: 14 }}>
            <div className="pax-display" style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Drawing Intake</div>
            <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 2 }}>Unggah gambar kerja untuk analisis AI.</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ display: 'block' }}>
              <span style={labelStyle}>Nama File</span>
              <input
                type="text"
                className="pax-input"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                aria-label="Nama file gambar"
              />
            </label>
            <label style={{ display: 'block' }}>
              <span style={labelStyle}>Tipe File</span>
              <select
                className="pax-input"
                value={fileType}
                onChange={(e) => setFileType(e.target.value)}
                aria-label="Tipe file"
              >
                <option value="DRAWING_PDF">PDF Gambar Kerja</option>
                <option value="DWG_PDF">DWG to PDF</option>
                <option value="IMAGE">Foto / Scan</option>
              </select>
            </label>

            <div
              style={{
                border: '1.5px dashed var(--border)',
                borderRadius: 12,
                padding: '28px 16px',
                textAlign: 'center',
                background: 'var(--surface)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <FileText size={26} color="var(--text3)" />
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Simulasi Unggah</div>
              <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>Unggah asli hadir bersama konektor.</div>
            </div>

            <Button
              onClick={handleAnalyze}
              disabled={isAnalyzing || health?.status !== 'ok'}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {isAnalyzing ? (
                <>Menganalisis…</>
              ) : (
                <>
                  <Bot size={15} /> Analisis Gambar
                </>
              )}
            </Button>

            {health?.mode === 'fallback_demo' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 11, color: 'var(--warn-fg)' }}>
                <AlertTriangle size={12} />
                Mode demo fallback aktif (tanpa API Key).
              </div>
            )}
          </div>
        </Card>

        {/* Extraction & verification */}
        <Card padding={20}>
          <div style={{ marginBottom: 14 }}>
            <div className="pax-display" style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Ekstraksi & Verifikasi</div>
            <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 2 }}>Tinjau dan setujui kandidat kuantitas.</div>
          </div>

          {!analysisResult ? (
            <EmptyState
              title="Belum ada analisis"
              message="Jalankan analisis untuk melihat kandidat kuantitas di sini."
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <StatusPill tone="neutral">Klasifikasi: {analysisResult.classification}</StatusPill>
                <StatusPill tone="neutral">{analysisResult.rooms.length} Ruang</StatusPill>
                <StatusPill tone="neutral">{analysisResult.doors.length} Pintu</StatusPill>
                <StatusPill tone="neutral">{analysisResult.windows.length} Jendela</StatusPill>
              </div>

              {analysisResult.warnings.length > 0 && (
                <div
                  style={{
                    background: 'var(--warn-bg)',
                    border: '1px solid var(--warn-bd)',
                    color: 'var(--warn-fg)',
                    padding: '12px 14px',
                    borderRadius: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <AlertTriangle size={14} />
                    <span style={{ fontSize: 12.5, fontWeight: 700 }}>
                      Peringatan Gambar ({analysisResult.warnings.length})
                    </span>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11.5, lineHeight: 1.5, color: 'var(--text2)' }}>
                    {analysisResult.warnings.slice(0, 3).map((w, i) => (
                      <li key={i}>{w.message}</li>
                    ))}
                    {analysisResult.warnings.length > 3 && (
                      <li>Dan {analysisResult.warnings.length - 3} lainnya…</li>
                    )}
                  </ul>
                </div>
              )}

              <div>
                <div className="pax-display" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
                  Kandidat Kuantitas (verifikasi wajib)
                </div>
                <div
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    overflow: 'hidden',
                    maxHeight: 320,
                    overflowY: 'auto',
                    background: 'var(--surface)',
                  }}
                >
                  {verifiedQuantities.map((candidate, idx) => {
                    const bg =
                      candidate.status === 'APPROVED'
                        ? 'var(--ok-bg)'
                        : candidate.status === 'REJECTED'
                          ? 'color-mix(in srgb, var(--text) 5%, transparent)'
                          : 'transparent';
                    return (
                      <div
                        key={candidate.id}
                        style={{
                          padding: '12px 14px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                          borderBottom: idx === verifiedQuantities.length - 1 ? 'none' : '1px solid var(--border-soft)',
                          background: bg,
                          opacity: candidate.status === 'REJECTED' ? 0.7 : 1,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>
                            {candidate.quantity_name}
                          </span>
                          <span
                            className="pax-mono"
                            style={{
                              fontSize: 10,
                              color: 'var(--text3)',
                              border: '1px solid var(--border)',
                              padding: '1px 6px',
                              borderRadius: 6,
                            }}
                          >
                            {Math.round(candidate.confidence * 100)}% conf.
                          </span>
                          {candidate.status === 'APPROVED' && <StatusPill tone="ok">Disetujui</StatusPill>}
                          {candidate.status === 'REJECTED' && <StatusPill tone="warn">Ditolak</StatusPill>}
                        </div>

                        <div style={{ fontSize: 11.5, color: 'var(--text2)', lineHeight: 1.5 }}>
                          {candidate.evidence_note}
                        </div>

                        <div className="pax-mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)' }}>
                          {candidate.value} {candidate.unit}
                        </div>

                        {candidate.needs_verification && (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              onClick={() => handleVerify(candidate.id, 'APPROVED')}
                              style={{
                                ...smallActionStyle,
                                color: 'var(--text)',
                                background: 'var(--ok-bg)',
                                border: '1px solid var(--ok-bd)',
                              }}
                            >
                              <Check size={12} /> Setujui
                            </button>
                            <button
                              onClick={() => handleVerify(candidate.id, 'REJECTED')}
                              style={{
                                ...smallActionStyle,
                                color: 'var(--warn-fg)',
                                background: 'var(--warn-bg)',
                                border: '1px solid var(--warn-bd)',
                              }}
                            >
                              <X size={12} /> Tolak
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* BOQ Draft & handoff */}
      {analysisResult && (
        <Card padding={20}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 14,
              flexWrap: 'wrap',
              marginBottom: 14,
            }}
          >
            <div>
              <div className="pax-display" style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Draft BOQ & Serah Terima RAB</div>
              <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 2 }}>
                Siapkan kuantitas terverifikasi untuk kalkulasi biaya deterministik.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button
                variant="secondary"
                onClick={handleGenerateBoqPreview}
                disabled={
                  isGeneratingBoq ||
                  verifiedQuantities.filter((c) => !c.needs_verification && c.status !== 'REJECTED').length === 0
                }
              >
                <Play size={14} /> Buat Draft BOQ
              </Button>
              <Button onClick={handleHandoffToRab}>
                Pakai Data untuk RAB <ArrowRight size={14} />
              </Button>
            </div>
          </div>

          <div
            style={{
              background: 'var(--gold-soft)',
              border: '1px solid var(--gold-bd)',
              borderRadius: 12,
              padding: '12px 14px',
              marginBottom: 14,
            }}
          >
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--gold)' }}>Aturan Emas — Core Engine</div>
            <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 4, lineHeight: 1.55 }}>
              Preview ini murni draf. AI tidak pernah menghasilkan angka RAB final. Core Engine akan melakukan seluruh
              kalkulasi deterministik dari kuantitas terverifikasi + profil harga proyek Anda.
            </div>
          </div>

          {boqDraft.length > 0 && (
            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: 12,
                overflow: 'auto',
                background: 'var(--surface)',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                    {['Kategori', 'Item', 'Volume', 'Satuan', 'Status'].map((h, i) => (
                      <th
                        key={h}
                        style={{
                          padding: '10px 14px',
                          textAlign: i === 2 ? 'right' : i === 4 ? 'center' : 'left',
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: '0.05em',
                          textTransform: 'uppercase',
                          color: 'var(--text2)',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {boqDraft.map((item, idx) => (
                    <tr
                      key={item.id}
                      className="pax-row-hover"
                      style={{ borderBottom: idx === boqDraft.length - 1 ? 'none' : '1px solid var(--border-soft)' }}
                    >
                      <td style={{ padding: '10px 14px', color: 'var(--text2)', fontSize: 11.5 }}>{item.category}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--text)', fontWeight: 600 }}>{item.item_name}</td>
                      <td className="pax-mono" style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--gold)', fontWeight: 700 }}>
                        {item.quantity}
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text2)' }}>{item.unit}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <StatusPill tone="ok">Siap</StatusPill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
