'use client';

/**
 * PAAX - Analisis Gambar AI.
 *
 * UI ini hanya mengorkestrasi presentasi: AI menyalin teks/deskripsi gambar
 * menjadi TKG, lalu core-engine menjalankan validasi, render, dan takeoff.
 * Frontend tidak menghitung kuantitas/harga.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Send, Sparkles, UploadCloud, X } from 'lucide-react';

import type { TakeoffResult, TkgDocument, TkgValidationResult } from '@paax/schemas';
import { Card, Button, StatusPill } from '@/components/ui';
import { renderTkg, takeoffTkg, validateTkg } from '@/lib/engine';
import { emptyTkgRecord, tkgRepository, type ProjectTkgRecord } from '@/lib/projects/tkg-repository';
import { emptyRabLine, rabRepository } from '@/lib/projects/rab-repository';
import { TriagePanel, type TriageItemView } from '@/components/review/triage-panel';
import { analyzeDrawingFile, DocumentIntelligenceError, type DrawingIntakeResult } from '@/lib/ai/document-intelligence-tkg';

const statusBox = {
  display: 'flex',
  gap: 8,
  alignItems: 'flex-start',
  padding: 10,
  borderRadius: 10,
  border: '1px solid var(--border)',
  marginBottom: 10,
};

type PerceptionWarning = {
  code: string;
  message: string;
};

type PerceptionReview = {
  result: DrawingIntakeResult;
  warnings: PerceptionWarning[];
  warningGroups: Array<{ code: string; items: PerceptionWarning[] }>;
  unclassified: Array<{ raw: string; alasan: string; sheetId: string }>;
};

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function parseWarning(raw: string): PerceptionWarning {
  const match = raw.match(/^\[([A-Z0-9_-]+)\]\s*(.+)$/i);
  return {
    code: match?.[1]?.toUpperCase() ?? 'WARNING',
    message: match?.[2] ?? raw,
  };
}

function groupWarnings(warnings: PerceptionWarning[]): Array<{ code: string; items: PerceptionWarning[] }> {
  const groups = new Map<string, PerceptionWarning[]>();
  for (const warning of warnings) {
    const list = groups.get(warning.code) ?? [];
    list.push(warning);
    groups.set(warning.code, list);
  }
  return Array.from(groups, ([code, items]) => ({ code, items }));
}

/**
 * `result.metrics`/`result.gerbang` datang APA ADANYA dari backend (Fase 2
 * P4 — `services/document-intelligence/app/perception/validate.py`). UI ini
 * TIDAK menghitung ulang cakupan/gerbang sendiri (koreksi dari versi
 * sebelumnya yang sempat memfabrikasi kode gerbang ad-hoc yang bentrok nama
 * dengan validator resmi brain V-01 sampai V-10).
 */
function buildPerceptionReview(result: DrawingIntakeResult): PerceptionReview {
  const sheets = result.tkg.sheets;
  const unclassified = sheets.flatMap((sheet) => sheet.unclassified.map((item) => ({
    raw: item.raw,
    alasan: item.alasan,
    sheetId: sheet.sheet_id,
  })));
  const warnings = result.warnings.map(parseWarning);

  return {
    result,
    warnings,
    warningGroups: groupWarnings(warnings),
    unclassified,
  };
}

export function TkgWorkspace({ projectId }: { projectId: string }) {
  const [record, setRecord] = useState<ProjectTkgRecord>(() => emptyTkgRecord(projectId));
  const [selectedPdf, setSelectedPdf] = useState<File | null>(null);
  const [perceptionReview, setPerceptionReview] = useState<PerceptionReview | null>(null);
  const [openWarningGroups, setOpenWarningGroups] = useState<Record<string, boolean>>({});
  const [sourceText, setSourceText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [validation, setValidation] = useState<TkgValidationResult | null>(null);
  const [takeoff, setTakeoff] = useState<TakeoffResult | null>(null);

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
    if (!tkg) return;
    setValidation(null);
    setTakeoff(null);

    setBusy('validate');
    const nextValidation = await validateTkg(tkg);
    setValidation(nextValidation);

    setBusy('render');
    const rendered = await renderTkg(tkg);
    const renderedRecord = await tkgRepository.save({ ...baseRecord, lastRenderedText: rendered, lastTakeoff: null });
    setRecord(renderedRecord);

    setBusy('takeoff');
    const nextTakeoff = await takeoffTkg(tkg);
    const finalRecord = await tkgRepository.save({ ...renderedRecord, lastTakeoff: nextTakeoff });
    setRecord(finalRecord);
    setTakeoff(nextTakeoff);
    setInfo('Analisis selesai. Tinjau item yang ditandai sebelum mengirim volume ke Draft RAB.');
  }, []);

  const runAiExtract = useCallback(async () => {
    if (!sourceText.trim()) {
      setError('Isi dulu teks/deskripsi gambar kerja.');
      return;
    }
    setBusy('ai');
    setError(null);
    setInfo(null);
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

  const runPerception = useCallback(async () => {
    if (!selectedPdf) {
      setError('Pilih PDF gambar kerja dulu.');
      return;
    }
    setBusy('perception');
    setError(null);
    setInfo(null);
    try {
      const result = await analyzeDrawingFile(selectedPdf, projectId);
      setPerceptionReview(buildPerceptionReview(result));
      setOpenWarningGroups({});
      setInfo('Hasil persepsi siap direview. Periksa cakupan, gerbang, warning, dan unclassified sebelum dipakai sebagai transkrip.');
    } catch (err) {
      setError(err instanceof DocumentIntelligenceError ? err.message : (err instanceof Error ? err.message : 'Upload gambar gagal.'));
    } finally {
      setBusy(null);
    }
  }, [projectId, selectedPdf]);

  const usePerceptionAsTranscript = useCallback(async () => {
    if (!perceptionReview) return;
    setBusy('save-perception');
    setError(null);
    try {
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
      setInfo('TKG dari pipeline persepsi tersimpan sebagai transkrip. Jalankan proses ulang setelah review manusia selesai.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Simpan hasil persepsi gagal.');
    } finally {
      setBusy(null);
    }
  }, [perceptionReview, projectId, record]);

  const discardPerception = useCallback(() => {
    setSelectedPdf(null);
    setPerceptionReview(null);
    setOpenWarningGroups({});
    setError(null);
    setInfo('Hasil persepsi dibuang. Pilih PDF lain atau gunakan teks deskripsi.');
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

  const sendToRab = useCallback(async () => {
    if (!takeoff) return;
    setBusy('rab');
    setError(null);
    try {
      const draft = await rabRepository.get(projectId);
      const okItems = takeoff.items.filter((item) => !item.needs_review && item.quantity != null);
      const newLines = okItems.map((item) => ({
        ...emptyRabLine(),
        // Kode AHSP sengaja kosong: mapping AHSP adalah keputusan user/AI terpisah.
        ahsp_code: '',
        volume: item.quantity ?? null,
        duration_days: null,
      }));
      const kept = draft.lines.filter((line) => line.ahsp_code || line.volume != null);
      await rabRepository.save({ ...draft, lines: [...kept, ...newLines] });
      setInfo(`${newLines.length} baris volume terkirim ke Draft RAB. ${takeoff.items.length - okItems.length} item review tidak ikut dikirim.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kirim ke RAB gagal.');
    } finally {
      setBusy(null);
    }
  }, [projectId, takeoff]);

  const tkg = record.tkg;
  const counts = useMemo(() => {
    const sheets = tkg?.sheets ?? [];
    return {
      sheets: sheets.length,
      tables: sheets.reduce((sum, sheet) => sum + sheet.tables.length, 0),
      elements: sheets.reduce((sum, sheet) => sum + sheet.elements.length, 0),
    };
  }, [tkg]);

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

  const readyItems = takeoff?.items.filter((item) => !item.needs_review && item.quantity != null).length ?? 0;
  const statusText = perceptionReview
    ? perceptionReview.result.metrics
      ? `Draft persepsi PDF siap direview: cakupan ${formatPercent(perceptionReview.result.metrics.cakupan)}, ${perceptionReview.warnings.length} warning, ${perceptionReview.result.metrics.n_unclassified} unclassified. Belum masuk transkrip sampai Anda menekan tombol pakai TKG.`
      : 'Draft persepsi PDF siap direview (backend tidak mengembalikan metrik). Belum masuk transkrip sampai Anda menekan tombol pakai TKG.'
    : takeoff
    ? `AI menemukan ${counts.elements} elemen dari ${counts.tables} tabel pada ${counts.sheets} sheet. ${readyItems} volume siap dikirim, ${takeoff.n_needs_review} item perlu review.`
    : tkg
      ? `AI menemukan ${counts.elements} elemen dari ${counts.tables} tabel pada ${counts.sheets} sheet. Proses engine siap dijalankan ulang.`
      : 'Unggah PDF gambar kerja, atau tempel teks deskripsi, untuk memulai analisis.';

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

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(260px, .9fr)', gap: 14 }} className="pax-grid-2">
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
              setSelectedPdf(file);
              setPerceptionReview(null);
              setOpenWarningGroups({});
              setError(null);
              setInfo(`${file.name} siap dipersepsi. Jalankan persepsi untuk melihat review sebelum menjadi transkrip.`);
            }}
          />
          <div
            onClick={() => busy === null && fileInputRef.current?.click()}
            className="pax-card-hover"
            style={{ marginTop: 6, cursor: busy !== null ? 'wait' : 'pointer', border: '1.5px dashed var(--border)', borderRadius: 10, padding: '18px 14px', textAlign: 'center', color: 'var(--text3)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}
          >
            <UploadCloud size={22} />
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text2)' }}>
              {selectedPdf ? selectedPdf.name : 'Klik untuk pilih PDF gambar kerja'}
            </div>
            <div style={{ fontSize: 11 }}>PDF vektor (mis. ekspor dari AutoCAD) — foto/scan belum didukung jalur ini.</div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <Button onClick={runPerception} disabled={!selectedPdf || busy !== null}>
              <UploadCloud size={14} /> {busy === 'perception' ? 'Memproses persepsi...' : 'Jalankan persepsi'}
            </Button>
            {(selectedPdf || perceptionReview) && (
              <Button variant="ghost" onClick={discardPerception} disabled={busy !== null}>
                <X size={14} /> Bersihkan
              </Button>
            )}
          </div>

          <div style={{ marginTop: 12, border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Review persepsi PDF</div>
              {perceptionReview?.result.gerbang && (
                <StatusPill tone={perceptionReview.result.gerbang.status === 'lolos' ? 'ok' : 'warn'}>
                  {perceptionReview.result.gerbang.status === 'lolos' ? 'GERBANG-2 LOLOS' : 'DRAFT PERSEPSI'}
                </StatusPill>
              )}
            </div>

            {!perceptionReview ? (
              <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.5 }}>
                Belum ada hasil persepsi. Pilih PDF lalu jalankan persepsi untuk melihat metrik, gate, warning, dan unclassified sebelum TKG disimpan.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {perceptionReview.result.metrics && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }} className="pax-grid-2">
                    {[
                      ['Cakupan', formatPercent(perceptionReview.result.metrics.cakupan)],
                      ['Grammar-pass', formatPercent(perceptionReview.result.metrics.grammar_pass_rate)],
                      ['Unclassified', String(perceptionReview.result.metrics.n_unclassified)],
                      ['Warning', String(perceptionReview.result.metrics.n_warning)],
                    ].map(([label, value]) => (
                      <div key={label} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, background: 'var(--elev)' }}>
                        <div style={{ fontSize: 10.5, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
                        <div style={{ marginTop: 3, fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>{value}</div>
                      </div>
                    ))}
                  </div>
                )}

                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Gerbang</div>
                  {!perceptionReview.result.gerbang ? (
                    <div style={{ fontSize: 12, color: 'var(--text3)' }}>Backend tidak mengembalikan gerbang untuk hasil ini.</div>
                  ) : (
                    <div style={{ display: 'grid', gap: 6 }}>
                      {perceptionReview.result.gerbang.checks.map((check) => (
                        <div key={check.code} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: 'var(--text2)' }}>
                          <StatusPill tone={check.passed ? 'ok' : 'warn'} mono>{check.code}</StatusPill>
                          <div>
                            <div style={{ color: 'var(--text)', fontWeight: 700 }}>{check.label}</div>
                            <div style={{ color: 'var(--text3)' }}>{check.detail}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Warning</div>
                  {perceptionReview.warningGroups.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--text3)' }}>Tidak ada warning dari pipeline.</div>
                  ) : (
                    <div style={{ display: 'grid', gap: 6 }}>
                      {perceptionReview.warningGroups.map((group) => {
                        const open = Boolean(openWarningGroups[group.code]);
                        return (
                          <div key={group.code} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                            <button
                              type="button"
                              onClick={() => setOpenWarningGroups((prev) => ({ ...prev, [group.code]: !prev[group.code] }))}
                              style={{ width: '100%', border: 0, background: 'var(--elev)', color: 'var(--text)', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12, textAlign: 'left' }}
                            >
                              {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              [{group.code}] {group.items.length} warning
                            </button>
                            {open && (
                              <div style={{ display: 'grid', gap: 6, padding: 10, background: 'var(--surface)' }}>
                                {group.items.map((warning, index) => (
                                  <div key={`${warning.code}-${index}`} style={{ fontSize: 12, color: 'var(--text2)' }}>{warning.message}</div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Unclassified</div>
                  {perceptionReview.unclassified.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--text3)' }}>Tidak ada unclassified.</div>
                  ) : (
                    <div style={{ display: 'grid', gap: 6 }}>
                      {perceptionReview.unclassified.slice(0, 10).map((item, index) => (
                        <div key={`${item.sheetId}-${index}`} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 8, background: 'var(--elev)' }}>
                          <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 700 }}>{item.raw}</div>
                          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{item.sheetId} - {item.alasan}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Button onClick={usePerceptionAsTranscript} disabled={busy !== null}>
                    <CheckCircle2 size={14} /> Pakai TKG sebagai transkrip
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

        <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Status proses</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', lineHeight: 1.45 }}>{statusText}</div>
          {validation && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 11.5, color: 'var(--text3)' }}>
              <StatusPill tone={validation.gate_passed ? 'ok' : validation.ok ? 'warn' : 'dng'}>
                {validation.gate_passed ? 'VALID' : validation.ok ? 'DRAFT' : 'PERLU PERBAIKAN'}
              </StatusPill>
              {validation.n_errors} error · {validation.n_warnings} warning
            </div>
          )}
          {busy && <div style={{ fontSize: 12, color: 'var(--text2)' }}>Sedang menjalankan tahap: {busy}</div>}
        </div>
      </div>

      {takeoff && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <TriagePanel projectId={projectId} items={triageItems} onRecompute={rerunPipeline} busy={busy === 'takeoff'} />
          {readyItems > 0 && (
            <Button variant="secondary" onClick={sendToRab} disabled={busy !== null} style={{ alignSelf: 'flex-start' }}>
              <Send size={14} /> Kirim Volume ke Draft RAB
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
