'use client';

/**
 * PAAX - Analisis Gambar AI.
 *
 * UI ini hanya mengorkestrasi presentasi: pipeline persepsi (`services/
 * document-intelligence`) membaca PDF gambar kerja jadi TKG terstruktur,
 * lalu core-engine menjalankan validasi, render, dan takeoff. Frontend
 * tidak menghitung kuantitas/harga.
 *
 * "Review Gambar" (rencana besar 2026-07-05) SENGAJA hanya menampilkan
 * ringkasan berbahasa teknik sipil (nama gambar, zona pekerjaan, grid &
 * elemen, dimensi bangunan, daftar "perlu dicek") — metrik teknis mentah
 * (cakupan %/grammar-pass/kode gerbang V-xx) TIDAK ditampilkan ke user,
 * ini keputusan produk eksplisit owner, bukan data yang disembunyikan dari
 * sistem (tetap ada di `result.metrics`/`result.gerbang` bila suatu saat
 * dibutuhkan mode developer/QA terpisah).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Send,
  Sparkles,
  UploadCloud,
  X,
} from 'lucide-react';

import type { TakeoffAhspSuggestion, TakeoffResult, TkgDocument, TkgValidationResult } from '@paax/schemas';
import { Card, Button, StatusPill } from '@/components/ui';
import { renderTkg, takeoffAhspSuggestTkg, validateTkg } from '@/lib/engine';
import { emptyTkgRecord, tkgRepository, type ProjectTkgRecord } from '@/lib/projects/tkg-repository';
import { emptyRabLine, rabRepository } from '@/lib/projects/rab-repository';
import { TriagePanel, type TriageItemView } from '@/components/review/triage-panel';
import {
  analyzeDrawingFileInBackground,
  DocumentIntelligenceError,
  type DrawingIntakeResult,
} from '@/lib/ai/document-intelligence-tkg';

const statusBox = {
  display: 'flex',
  gap: 8,
  alignItems: 'flex-start',
  padding: 10,
  borderRadius: 10,
  border: '1px solid var(--border)',
  marginBottom: 10,
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type PerceptionReview = {
  result: DrawingIntakeResult;
};

/**
 * Animasi "sedang bekerja" ala Engineering Chat (`.pax-thinking`/`.pax-glass`
 * sudah ada di globals.css) — TAPI teksnya didorong progres NYATA dari
 * backend (Fase F, `job.progress_message`), bukan simulasi waktu buta.
 * Fallback ke pesan default kalau backend belum sempat lapor progres.
 */
function AnalyzingIndicator({ progressMessage }: { progressMessage: string | null }) {
  return (
    <div
      className="pax-glass"
      style={{
        display: 'flex',
        gap: 9,
        alignItems: 'center',
        padding: '10px 14px',
        borderRadius: 13,
        color: 'var(--text2)',
        fontSize: 12.5,
        marginTop: 8,
      }}
    >
      <Sparkles size={14} color="var(--gold)" />
      <span className="pax-thinking" style={{ fontWeight: 600 }}>
        {progressMessage ?? 'Membaca gambar kerja...'}
      </span>
    </div>
  );
}

export function TkgWorkspace({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [record, setRecord] = useState<ProjectTkgRecord>(() => emptyTkgRecord(projectId));
  const [selectedPdf, setSelectedPdf] = useState<File | null>(null);
  const [perceptionReview, setPerceptionReview] = useState<PerceptionReview | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [sourceText, setSourceText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [validation, setValidation] = useState<TkgValidationResult | null>(null);
  const [takeoff, setTakeoff] = useState<TakeoffResult | null>(null);
  // Fase T — usulan kode AHSP per item takeoff (token-overlap deterministik,
  // BUKAN keputusan final). Dihitung ulang tiap kali pipeline jalan, tidak
  // disimpan permanen — usulan harus selalu mencerminkan katalog AHSP terkini.
  const [ahspSuggestions, setAhspSuggestions] = useState<TakeoffAhspSuggestion[]>([]);
  const [rabDraftPath, setRabDraftPath] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    tkgRepository.get(projectId).then((loaded) => {
      if (!alive) return;
      setRecord(loaded);
      setTakeoff(loaded.lastTakeoff);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const runPipeline = useCallback(async (baseRecord: ProjectTkgRecord) => {
    const tkg = baseRecord.tkg;
    if (!tkg) return null;
    setRabDraftPath(null);
    setValidation(null);
    setTakeoff(null);
    setAhspSuggestions([]);

    setBusy('validate');
    const nextValidation = await validateTkg(tkg);
    setValidation(nextValidation);

    setBusy('render');
    const rendered = await renderTkg(tkg);
    const renderedRecord = await tkgRepository.save({ ...baseRecord, lastRenderedText: rendered, lastTakeoff: null });
    setRecord(renderedRecord);

    setBusy('takeoff');
    const nextResult = await takeoffAhspSuggestTkg(tkg);
    const nextTakeoff = nextResult.takeoff;
    setAhspSuggestions(nextResult.suggestions);
    const finalRecord = await tkgRepository.save({ ...renderedRecord, lastTakeoff: nextTakeoff });
    setRecord(finalRecord);
    setTakeoff(nextTakeoff);
    setInfo('Analisis selesai. Tinjau item yang ditandai sebelum mengirim volume ke Draft RAB.');
    return { takeoff: nextTakeoff, suggestions: nextResult.suggestions };
  }, []);

  const runAiExtract = useCallback(async () => {
    if (!sourceText.trim()) {
      setError('Isi dulu teks/deskripsi gambar kerja.');
      return;
    }
    setBusy('ai');
    setError(null);
    setInfo(null);
    setRabDraftPath(null);
    try {
      const res = await fetch('/api/ai/tkg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: sourceText, projectId }),
      });
      const data = (await res.json()) as { tkg?: TkgDocument | null; provider?: string; error?: string };
      if (!res.ok || !data.tkg) {
        setError(data.error ?? 'Ekstraksi AI gagal. Periksa kembali teks/deskripsi gambar kerja.');
        return;
      }
      const next = await tkgRepository.save({
        ...record,
        projectId,
        tkg: data.tkg,
        source: 'ai_proposal',
        reviewed: false,
        lastRenderedText: null,
        lastTakeoff: null,
      });
      setRecord(next);
      setInfo(`Usulan dari ${data.provider ?? 'AI'} tersimpan. Proses engine berjalan di belakang layar.`);
      await runPipeline(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analisis gambar gagal.');
    } finally {
      setBusy(null);
    }
  }, [projectId, record, runPipeline, sourceText]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const applyFile = useCallback((file: File) => {
    setSelectedPdf(file);
    setPerceptionReview(null);
    setRabDraftPath(null);
    setError(null);
    setInfo(`${file.name} siap dianalisis. Klik "Analisa RAB dari Gambar Kerja" untuk memproses hasilnya.`);
  }, []);

  const runPerception = useCallback(async () => {
    if (!selectedPdf) {
      setError('Pilih PDF gambar kerja dulu.');
      return;
    }
    setBusy('perception');
    setError(null);
    setInfo(null);
    setRabDraftPath(null);
    setProgressMessage('Mengunggah gambar...');
    try {
      const result = await analyzeDrawingFileInBackground(selectedPdf, projectId, setProgressMessage);
      setPerceptionReview({ result });
      setInfo('Hasil AI siap. Tinjau tabel pekerjaan, lalu klik Proses RAB.');
    } catch (err) {
      setError(err instanceof DocumentIntelligenceError ? err.message : (err instanceof Error ? err.message : 'Upload gambar gagal.'));
    } finally {
      setBusy(null);
      setProgressMessage(null);
    }
  }, [projectId, selectedPdf]);

  const savePerceptionAsTranscript = useCallback(async () => {
    if (!perceptionReview) return null;
    const next = await tkgRepository.save({
      ...record,
      projectId,
      tkg: perceptionReview.result.tkg,
      source: 'pipeline',
      reviewed: false,
      lastRenderedText: perceptionReview.result.tkgText ?? null,
      lastTakeoff: null,
    });
    setRecord(next);
    setValidation(null);
    setTakeoff(null);
    return next;
  }, [perceptionReview, projectId, record]);

  const discardPerception = useCallback(() => {
    setSelectedPdf(null);
    setPerceptionReview(null);
    setRabDraftPath(null);
    setError(null);
    setInfo('Hasil analisis dibuang. Pilih PDF lain atau gunakan teks deskripsi.');
  }, []);

  const rerunPipeline = useCallback(async () => {
    if (!record.tkg) return;
    setError(null);
    setInfo(null);
    try {
      await runPipeline(record);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Proses ulang gagal.');
    } finally {
      setBusy(null);
    }
  }, [record, runPipeline]);

  const sendTakeoffToRab = useCallback(async (
    takeoffInput: TakeoffResult,
    suggestionsInput: TakeoffAhspSuggestion[],
  ) => {
    setBusy('rab');
    setError(null);
    const draft = await rabRepository.get(projectId);
    const okItems = takeoffInput.items.filter((item) => !item.needs_review && item.quantity != null);
    const suggestionByKey = new Map(
      suggestionsInput.map((s) => [`${s.kode}|${s.lantai ?? ''}|${s.work_type}`, s]),
    );
    const newLines = okItems.map((item) => {
      const suggestion = suggestionByKey.get(`${item.kode}|${item.lantai ?? ''}|${item.work_type}`);
      const suggested = suggestion?.ahsp_suggested === true;
      return {
        ...emptyRabLine(),
        ahsp_code: suggested ? suggestion!.ahsp_code : '',
        ahsp_suggested: suggested,
        volume: item.quantity ?? null,
        duration_days: null,
      };
    });
    const nSuggested = newLines.filter((l) => l.ahsp_suggested).length;
    const kept = draft.lines.filter((line) => line.ahsp_code || line.volume != null);
    await rabRepository.save({ ...draft, lines: [...kept, ...newLines] });
    setRabDraftPath(`/proyek/${projectId}/rab`);
    setInfo(
      `${newLines.length} baris volume terkirim ke Draft RAB` +
      (nSuggested > 0 ? ` (${nSuggested} sudah ada usulan kode AHSP, tetap bisa diganti)` : '') +
      `. ${takeoffInput.items.length - okItems.length} item review tidak ikut dikirim.`,
    );
  }, [projectId]);

  const processPerceptionToRab = useCallback(async () => {
    if (!perceptionReview) return;
    setBusy('save-perception');
    setError(null);
    setRabDraftPath(null);
    try {
      const next = await savePerceptionAsTranscript();
      if (!next) return;
      const pipeline = await runPipeline(next);
      if (!pipeline) return;
      await sendTakeoffToRab(pipeline.takeoff, pipeline.suggestions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Proses RAB dari gambar gagal.');
    } finally {
      setBusy(null);
    }
  }, [perceptionReview, runPipeline, savePerceptionAsTranscript, sendTakeoffToRab]);

  const sendToRab = useCallback(async () => {
    if (!takeoff) return;
    try {
      await sendTakeoffToRab(takeoff, ahspSuggestions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kirim ke RAB gagal.');
    } finally {
      setBusy(null);
    }
  }, [ahspSuggestions, sendTakeoffToRab, takeoff]);

  const openRabDraft = useCallback(() => {
    if (!rabDraftPath) return;
    router.push(rabDraftPath);
  }, [rabDraftPath, router]);

  const tkg = record.tkg;
  const triageItems: TriageItemView[] = useMemo(() => {
    if (!takeoff) return [];
    return takeoff.items
      .filter((item) => item.needs_review)
      .map((item, index) => ({
        // alamat disertakan supaya kode yang sama (mis. beberapa instance K1)
        // tidak bertabrakan key-nya; index sbg fallback terakhir bila alamat
        // juga sama persis (kasus langka, tetap butuh key unik untuk React).
        key: `${item.kode}.${item.work_type}.${item.rule_id}.${item.alamat ?? 'no-alamat'}.${index}`,
        kode: item.kode,
        work: `${item.work_type} · ${item.kategori}`,
        rule_id: item.rule_id,
        reason: item.review_reason ?? 'perlu review',
      }));
  }, [takeoff]);

  const aiReport = perceptionReview?.result.aiReport ?? null;

  const readyItems = takeoff?.items.filter((item) => !item.needs_review && item.quantity != null).length ?? 0;

  return (
    <Card padding={18}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={16} color="var(--gold)" />
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Analisis Gambar AI</span>
          {tkg && <StatusPill tone={takeoff ? 'ok' : 'warn'}>{takeoff ? 'SIAP DITINJAU' : 'MENUNGGU PROSES'}</StatusPill>}
        </div>
      </div>

      {error && (
        <div style={{ ...statusBox, background: 'color-mix(in srgb, crimson 8%, transparent)', borderColor: 'color-mix(in srgb, crimson 30%, transparent)' }}>
          <AlertTriangle size={14} color="crimson" style={{ marginTop: 1 }} />
          <span style={{ fontSize: 12, color: 'var(--text)' }}>{error}</span>
        </div>
      )}
      {info && (
        <div style={{ ...statusBox, background: 'var(--surface2)' }}>
          <CheckCircle2 size={14} color="var(--text2)" style={{ marginTop: 1 }} />
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>{info}</span>
        </div>
      )}

      <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
            Unggah PDF gambar kerja
          </div>
          <input
            ref={fileInputRef}
            type="file"
            aria-label="Unggah PDF gambar kerja"
            accept="application/pdf"
            style={{ display: 'none' }}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              applyFile(file);
            }}
          />
          {!selectedPdf ? (
            <div
              onClick={() => busy === null && fileInputRef.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                if (busy === null) setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragging(false);
                if (busy !== null) return;
                const file = event.dataTransfer.files?.[0];
                if (file) applyFile(file);
              }}
              className="pax-card-hover"
              style={{
                marginTop: 6,
                cursor: busy !== null ? 'wait' : 'pointer',
                border: `1.5px dashed ${isDragging ? 'var(--gold)' : 'var(--border)'}`,
                background: isDragging ? 'color-mix(in srgb, var(--gold) 8%, transparent)' : undefined,
                borderRadius: 10,
                padding: '18px 14px',
                textAlign: 'center',
                color: 'var(--text3)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                transition: 'border-color 150ms ease, background 150ms ease',
              }}
            >
              <UploadCloud size={22} color={isDragging ? 'var(--gold)' : undefined} />
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text2)' }}>
                {isDragging ? 'Lepas file di sini' : 'Seret PDF ke sini, atau klik untuk pilih'}
              </div>
              <div style={{ fontSize: 11 }}>PDF vektor (mis. ekspor dari AutoCAD) — foto/scan belum didukung jalur ini.</div>
            </div>
          ) : (
            <div
              className="pax-glass"
              style={{
                marginTop: 6,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 12,
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 9, background: 'color-mix(in srgb, var(--gold) 15%, transparent)', flexShrink: 0 }}>
                <FileText size={17} color="var(--gold)" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selectedPdf.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>{formatFileSize(selectedPdf.size)}</div>
              </div>
              {busy === null && (
                <button
                  type="button"
                  aria-label="Hapus file"
                  onClick={discardPerception}
                  style={{ border: 0, background: 'transparent', color: 'var(--text3)', cursor: 'pointer', padding: 4, borderRadius: 6, display: 'flex' }}
                >
                  <X size={15} />
                </button>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <Button onClick={runPerception} disabled={!selectedPdf || busy !== null}>
              <Sparkles size={14} /> {busy === 'perception' ? 'Menganalisis...' : 'Analisa RAB dari Gambar Kerja'}
            </Button>
          </div>
          {busy === 'perception' && <AnalyzingIndicator progressMessage={progressMessage} />}

          <div style={{ marginTop: 12, border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: 12, width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Hasil analisis AI</div>
              {aiReport && <StatusPill tone="ok">{aiReport.project_summary.total_pages} halaman</StatusPill>}
            </div>

            {!perceptionReview ? (
              <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.5 }}>
                Unggah PDF lalu klik &quot;Analisa RAB dari Gambar Kerja&quot;. Proses mentah berjalan di belakang layar; hasil utama berupa ringkasan dan tabel pekerjaan.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {aiReport && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(180px, 240px)', gap: 10 }} className="pax-grid-2">
                    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'var(--elev)' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Ringkasan gambar</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', marginBottom: 6 }}>{aiReport.project_summary.project_kind}</div>
                      <div style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.55 }}>{aiReport.technical_summary}</div>
                    </div>
                    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'var(--elev)' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>File</div>
                      <div style={{ fontSize: 18, fontWeight: 850, color: 'var(--text)' }}>{aiReport.project_summary.total_pages}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>halaman terbaca</div>
                    </div>
                  </div>
                )}
                {aiReport?.model_stack?.length ? (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
                      <Sparkles size={13} /> Model AI
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {aiReport.model_stack.map((stage) => (
                        <StatusPill key={stage.stage} tone={stage.active ? 'ok' : 'warn'} mono>
                          {stage.stage.replace(/_/g, ' ')}: {stage.model}
                        </StatusPill>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
                    <FileText size={13} /> Halaman gambar
                  </div>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {(aiReport?.sheets ?? []).map((sheet) => (
                      <div key={sheet.sheet_id} style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--border)', borderRadius: 10, padding: '8px 10px', background: 'var(--elev)' }}>
                        <StatusPill tone="ok" mono>{`Hal. ${sheet.page}`}</StatusPill>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>{sheet.interpreted_title}</div>
                          <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                            {sheet.role}{sheet.scale ? ` · Skala ${sheet.scale}` : ''}
                          </div>
                        </div>
                      </div>
                    ))}
                    {!aiReport?.sheets.length && <div style={{ fontSize: 12, color: 'var(--text3)' }}>Tidak ada data halaman.</div>}
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
                    <CheckCircle2 size={13} /> Item pekerjaan hasil AI
                  </div>
                  <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--elev)' }}>
                    <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ color: 'var(--text3)', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                          {['Kategori', 'Item pekerjaan', 'Sumber halaman', 'Dasar pembacaan', 'Satuan', 'Volume', 'Rumus', 'AHSP kandidat', 'Status', 'Catatan verifikasi'].map((head) => (
                            <th key={head} scope="col" style={{ padding: '9px 10px', fontWeight: 800, whiteSpace: 'nowrap' }}>{head}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(aiReport?.detected_work_items ?? []).map((item, index) => (
                          <tr key={`${item.item_pekerjaan}-${index}`} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '9px 10px', color: 'var(--text2)' }}>{item.category}</td>
                            <td style={{ padding: '9px 10px', color: 'var(--text)', fontWeight: 800 }}>{item.item_pekerjaan}</td>
                            <td style={{ padding: '9px 10px', color: 'var(--text2)', whiteSpace: 'nowrap' }}>{item.source_pages.map((p) => `Hal. ${p}`).join(', ') || '-'}</td>
                            <td style={{ padding: '9px 10px', color: 'var(--text2)', minWidth: 220 }}>{item.dasar_pembacaan}</td>
                            <td style={{ padding: '9px 10px', color: 'var(--text2)' }}>{item.unit ?? '-'}</td>
                            <td style={{ padding: '9px 10px', color: 'var(--text2)' }}>{item.volume ?? '-'}</td>
                            <td style={{ padding: '9px 10px', color: 'var(--text2)', minWidth: 160 }}>{item.formula ?? '-'}</td>
                            <td style={{ padding: '9px 10px', color: 'var(--text2)' }}>{item.ahsp_candidate ?? '-'}</td>
                            <td style={{ padding: '9px 10px' }}>
                              <StatusPill tone={item.status === 'Siap diproses' ? 'ok' : 'warn'}>{item.status}</StatusPill>
                            </td>
                            <td style={{ padding: '9px 10px', color: 'var(--text2)', minWidth: 180 }}>{item.verification_note ?? '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!aiReport?.detected_work_items.length && (
                      <div style={{ padding: 12, fontSize: 12, color: 'var(--text3)' }}>Belum ada item pekerjaan yang siap ditampilkan.</div>
                    )}
                  </div>
                  {aiReport?.verification_notes.length ? (
                    <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                      {aiReport.verification_notes.slice(0, 4).map((note, index) => (
                        <div key={index} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: 'var(--text2)' }}>
                          <StatusPill tone={note.level === 'tinggi' ? 'dng' : note.level === 'sedang' ? 'warn' : 'ok'}>{note.level}</StatusPill>
                          <span>{note.note}{note.source_pages.length ? ` (hal. ${note.source_pages.join(', ')})` : ''}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Button onClick={processPerceptionToRab} disabled={busy !== null}>
                    <CheckCircle2 size={14} /> {aiReport?.next_action_label ?? 'Proses RAB'}
                  </Button>
                  <Button variant="secondary" onClick={discardPerception} disabled={busy !== null}>
                    Buang hasil
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0', color: 'var(--text3)', fontSize: 11 }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            atau tempel teks deskripsi
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          <textarea
            value={sourceText}
            onChange={(event) => setSourceText(event.target.value)}
            rows={8}
            placeholder={"Contoh: Denah sloof & kolom. Grid X: A-B 3000, B-C 3500. Kolom K1 300x400, 8D16, sengkang D8-150, fc' 25..."}
            style={{ width: '100%', marginTop: 6, padding: 10, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', resize: 'vertical', fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <Button onClick={runAiExtract} disabled={busy !== null}>
              <Sparkles size={14} /> {busy ? 'Memproses...' : 'Proses dengan AI'}
            </Button>
            {tkg && (
              <Button variant="secondary" onClick={rerunPipeline} disabled={busy !== null}>
                Proses ulang
              </Button>
            )}
          </div>
        </div>

        {false && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Status proses</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', lineHeight: 1.45 }} />
          {validation && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 11.5, color: 'var(--text3)' }}>
              <StatusPill tone={validation!.gate_passed ? 'ok' : validation!.ok ? 'warn' : 'dng'}>
                {validation!.gate_passed ? 'VALID' : validation!.ok ? 'DRAFT' : 'PERLU PERBAIKAN'}
              </StatusPill>
              {validation!.n_errors} error · {validation!.n_warnings} warning
            </div>
          )}
          {busy && busy !== 'perception' && <div style={{ fontSize: 12, color: 'var(--text2)' }}>Sedang menjalankan tahap: {busy}</div>}
        </div>
        )}

      {takeoff && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <TriagePanel projectId={projectId} items={triageItems} onRecompute={rerunPipeline} busy={busy === 'takeoff'} />
          {readyItems > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <Button variant="secondary" onClick={sendToRab} disabled={busy !== null} style={{ alignSelf: 'flex-start' }}>
                <Send size={14} /> Proses RAB
              </Button>
              {rabDraftPath && (
                <Button variant="secondary" onClick={openRabDraft} disabled={busy !== null} style={{ alignSelf: 'flex-start' }}>
                  <FileText size={14} /> Lihat Draft RAB
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
