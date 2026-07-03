'use client';

/**
 * PAAX — Workspace TKG (Transkrip Kanonik Gambar) di halaman Gambar Kerja.
 *
 * Alur: teks/deskripsi gambar -> [AI transkrip ATAU input manual JSON] ->
 * TKG tersimpan per proyek -> validasi (engine) -> skrip .tkg.txt (engine) ->
 * takeoff beton/bekisting/besi (engine) -> kirim volume ke draft RAB.
 *
 * ATURAN EMAS: komponen ini TIDAK menghitung apa pun. Semua angka (validasi,
 * render, kuantitas) datang dari core-engine. AI hanya menyalin ke struktur.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, Sparkles, CheckCircle2, AlertTriangle, Calculator, Send, RefreshCw, Upload, Loader2, ChevronDown, ChevronRight } from 'lucide-react';

import { TkgDocumentSchema, type TkgDocument, type TkgValidationResult, type TakeoffResult, type TakeoffParams } from '@paax/schemas';
import { Card, Button, StatusPill } from '@/components/ui';
import { DocumentIntelligenceClient, type TkgPerceptionResult, type TkgPerceptionUnclassified, type TkgPerceptionWarning } from '@/lib/document-intelligence-client';
import { renderTkg, takeoffTkg, validateTkg } from '@/lib/engine';
import { tkgRepository, emptyTkgRecord, type ProjectTkgRecord, type TkgRecordSource } from '@/lib/projects/tkg-repository';
import { rabRepository, emptyRabLine } from '@/lib/projects/rab-repository';
import { TriagePanel, type TriageItemView } from '@/components/review/triage-panel';
import { formatTkgBbsNumber, hasTkgBbs } from './tkg-bbs-format';

type Tab = 'persepsi' | 'sumber' | 'transkrip' | 'skrip' | 'takeoff';

const S = {
  label: { fontSize: 11, fontWeight: 700 as const, color: 'var(--text3)', textTransform: 'uppercase' as const, letterSpacing: 0.4 },
  mono: { fontFamily: 'var(--font-mono, monospace)', fontSize: 12 },
  th: { textAlign: 'left' as const, padding: '6px 8px', fontSize: 11, color: 'var(--text3)', borderBottom: '1px solid var(--border)' },
  td: { padding: '6px 8px', fontSize: 12, color: 'var(--text)', borderBottom: '1px solid var(--border)' },
};

function sourceLabel(source: TkgRecordSource): string {
  if (source === 'pipeline') return 'PIPELINE';
  if (source === 'ai_proposal') return 'USULAN AI';
  return 'MANUAL';
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatBBoxValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatLocator(item: { page?: number; bbox?: number[] }): string | null {
  if (!item.page || !item.bbox?.length) return null;
  return `(hal. ${item.page}, bbox ${item.bbox.map(formatBBoxValue).join(', ')})`;
}

function groupWarnings(warnings: TkgPerceptionWarning[]): Array<{ code: string; items: TkgPerceptionWarning[] }> {
  const groups = new Map<string, TkgPerceptionWarning[]>();
  for (const warning of warnings) {
    const list = groups.get(warning.code) ?? [];
    list.push(warning);
    groups.set(warning.code, list);
  }
  return Array.from(groups, ([code, items]) => ({ code, items }));
}

export function TkgWorkspace({ projectId }: { projectId: string }) {
  const [record, setRecord] = useState<ProjectTkgRecord>(() => emptyTkgRecord(projectId));
  const [tab, setTab] = useState<Tab>('persepsi');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [perception, setPerception] = useState<TkgPerceptionResult | null>(null);
  const [warningGroupOpen, setWarningGroupOpen] = useState<Record<string, boolean>>({});
  const [unclassifiedOpen, setUnclassifiedOpen] = useState(false);
  const [sourceText, setSourceText] = useState('');
  const [manualJson, setManualJson] = useState('');
  const [tinggiLantai, setTinggiLantai] = useState<string>('');
  const [nLd, setNLd] = useState<string>('');
  const [lStock, setLStock] = useState<string>('');
  const [reuseForm, setReuseForm] = useState<string>('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [validation, setValidation] = useState<TkgValidationResult | null>(null);
  const [script, setScript] = useState<string | null>(null);
  const [takeoff, setTakeoff] = useState<TakeoffResult | null>(null);

  useEffect(() => {
    let alive = true;
    tkgRepository.get(projectId).then((r) => {
      if (!alive) return;
      setRecord(r);
      if (r.lastRenderedText) setScript(r.lastRenderedText);
      if (r.tkg) setTab('transkrip');
    });
    return () => { alive = false; };
  }, [projectId]);

  const params = useMemo(() => {
    // Parameter dikirim APA ADANYA ke engine — UI tidak menghitung apa pun.
    const num = (s: string) => {
      const v = Number.parseFloat(s.replace(',', '.'));
      return Number.isFinite(v) && v > 0 ? v : undefined;
    };
    const p: Partial<TakeoffParams> = {};
    const t = num(tinggiLantai); if (t !== undefined) p.tinggi_per_lantai_m = t;
    const n = num(nLd); if (n !== undefined) p.n_ld = n;
    const l = num(lStock); if (l !== undefined) p.l_stock_m = l;
    const u = num(reuseForm); if (u !== undefined && Number.isInteger(u)) p.reuse_form = u;
    return Object.keys(p).length ? p : undefined;
  }, [tinggiLantai, nLd, lStock, reuseForm]);

  const saveTkg = useCallback(async (tkg: TkgDocument, source: TkgRecordSource) => {
    const next = await tkgRepository.save({ ...record, projectId, tkg, source, reviewed: false });
    setRecord(next);
    setValidation(null);
    setScript(null);
    setTakeoff(null);
    setTab('transkrip');
  }, [projectId, record]);

  const runPerceive = useCallback(async () => {
    if (!pdfFile) {
      setError('Pilih PDF gambar kerja dulu.');
      return;
    }
    setBusy('perceive'); setError(null); setInfo(null);
    try {
      const result = await DocumentIntelligenceClient.perceiveTkg(pdfFile, projectId);
      setPerception(result);
      setWarningGroupOpen({});
      setUnclassifiedOpen(false);
      setInfo('Hasil persepsi siap direview. Periksa gerbang, warning, dan unclassified sebelum dipakai sebagai transkrip.');
    } catch (e) {
      const detail = e instanceof Error ? e.message : 'Persepsi PDF gagal.';
      setError(`${detail} Gunakan tab Sumber untuk jalur AI-teks atau fallback JSON manual.`);
    } finally { setBusy(null); }
  }, [pdfFile, projectId]);

  const usePerceivedTkg = useCallback(async () => {
    if (!perception) return;
    await saveTkg(perception.tkg, 'pipeline');
    setInfo('TKG dari pipeline persepsi tersimpan sebagai transkrip. Tetap tandai review setelah diverifikasi manusia.');
  }, [perception, saveTkg]);

  const discardPerception = useCallback(() => {
    setPdfFile(null);
    setPerception(null);
    setWarningGroupOpen({});
    setUnclassifiedOpen(false);
    setError(null);
    setInfo('Hasil persepsi dibuang. Unggah PDF lagi atau lanjut lewat tab Sumber.');
  }, []);

  const runAiExtract = useCallback(async () => {
    if (!sourceText.trim()) { setError('Isi dulu teks/deskripsi gambar.'); return; }
    setBusy('ai'); setError(null); setInfo(null);
    try {
      const res = await fetch('/api/ai/tkg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: sourceText, projectId }),
      });
      const data = await res.json() as { tkg?: TkgDocument | null; provider?: string; error?: string };
      if (!res.ok || !data.tkg) {
        setError(data.error ?? 'Ekstraksi AI gagal — gunakan jalur input manual JSON di bawah.');
        return;
      }
      await saveTkg(data.tkg, 'ai_proposal');
      setInfo(`Usulan TKG dari ${data.provider ?? 'AI'} tersimpan — WAJIB direview sebelum dipakai (tandai "Sudah direview").`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ekstraksi AI gagal.');
    } finally { setBusy(null); }
  }, [sourceText, projectId, saveTkg]);

  const loadManual = useCallback(async () => {
    setBusy('manual'); setError(null); setInfo(null);
    try {
      const parsed = TkgDocumentSchema.safeParse(JSON.parse(manualJson));
      if (!parsed.success) {
        setError(`JSON tidak lolos skema TkgDocument: ${parsed.error.issues[0]?.path.join('.')} — ${parsed.error.issues[0]?.message}`);
        return;
      }
      await saveTkg({ ...parsed.data, prj_id: projectId, generated_by: 'manual' }, 'manual');
      setInfo('TKG manual tersimpan.');
    } catch {
      setError('Input bukan JSON valid.');
    } finally { setBusy(null); }
  }, [manualJson, projectId, saveTkg]);

  const runValidate = useCallback(async () => {
    if (!record.tkg) return;
    setBusy('validate'); setError(null);
    try {
      setValidation(await validateTkg(record.tkg));
    } catch (e) { setError(e instanceof Error ? e.message : 'Validasi gagal.'); }
    finally { setBusy(null); }
  }, [record.tkg]);

  const runRender = useCallback(async () => {
    if (!record.tkg) return;
    setBusy('render'); setError(null);
    try {
      const text = await renderTkg(record.tkg);
      setScript(text);
      const next = await tkgRepository.save({ ...record, lastRenderedText: text });
      setRecord(next);
      setTab('skrip');
    } catch (e) { setError(e instanceof Error ? e.message : 'Render skrip gagal.'); }
    finally { setBusy(null); }
  }, [record]);

  const runTakeoff = useCallback(async () => {
    if (!record.tkg) return;
    setBusy('takeoff'); setError(null);
    try {
      setTakeoff(await takeoffTkg(record.tkg, params));
      setTab('takeoff');
    } catch (e) { setError(e instanceof Error ? e.message : 'Takeoff gagal.'); }
    finally { setBusy(null); }
  }, [record.tkg, params]);

  const sendToRab = useCallback(async () => {
    if (!takeoff) return;
    setBusy('rab'); setError(null);
    try {
      const draft = await rabRepository.get(projectId);
      const okItems = takeoff.items.filter((i) => !i.needs_review && i.quantity != null);
      const newLines = okItems.map((i) => ({
        ...emptyRabLine(),
        // kode AHSP sengaja KOSONG: pemetaan AHSP = keputusan user/AI terpisah,
        // dilarang dikarang di sini (RULE-AHSP). Volume = hasil engine.
        ahsp_code: '',
        volume: i.quantity ?? null,
        duration_days: null,
      }));
      const kept = draft.lines.filter((l) => l.ahsp_code || l.volume != null);
      await rabRepository.save({ ...draft, lines: [...kept, ...newLines] });
      setInfo(`${newLines.length} baris volume terkirim ke draft RAB (kode AHSP diisi di halaman RAB). `
        + `${takeoff.items.length - okItems.length} item needs_review TIDAK ikut dikirim.`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Kirim ke RAB gagal.'); }
    finally { setBusy(null); }
  }, [takeoff, projectId]);

  const markReviewed = useCallback(async () => {
    const next = await tkgRepository.save({ ...record, reviewed: true });
    setRecord(next);
  }, [record]);

  const perceptionWarnings = useMemo<TkgPerceptionWarning[]>(() => {
    if (!perception) return [];
    if (perception.warnings?.length) return perception.warnings;
    return perception.validation.issues
      .filter((issue) => issue.severity === 'warning')
      .map((issue) => ({ code: issue.code, message: issue.message }));
  }, [perception]);

  const perceptionUnclassified = useMemo<TkgPerceptionUnclassified[]>(() => {
    if (!perception) return [];
    if (perception.unclassified?.length) return perception.unclassified;
    return perception.tkg.sheets.flatMap((sheet) => sheet.unclassified.map((item) => ({
      raw: item.raw,
      alasan: item.alasan,
    })));
  }, [perception]);

  const warningGroups = useMemo(() => groupWarnings(perceptionWarnings), [perceptionWarnings]);
  const visibleUnclassified = unclassifiedOpen ? perceptionUnclassified : perceptionUnclassified.slice(0, 10);
  const failedGateChecks = perception?.gerbang.checks.filter((check) => !check.passed).length ?? 0;

  const tkg = record.tkg;
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'persepsi', label: '0 · Persepsi (PDF)' },
    { id: 'sumber', label: '1 · Sumber' },
    { id: 'transkrip', label: '2 · Transkrip (TKG)' },
    { id: 'skrip', label: '3 · Skrip .tkg.txt' },
    { id: 'takeoff', label: '4 · Takeoff' },
  ];

  const triageItems: TriageItemView[] = useMemo(() => {
    if (!takeoff) return [];
    return takeoff.items
      .filter((it) => it.needs_review)
      .map((it) => ({
        key: `${it.kode}.${it.work_type}.${it.rule_id}`,
        kode: it.kode,
        work: `${it.work_type} · ${it.kategori}`,
        rule_id: it.rule_id,
        reason: it.review_reason ?? 'perlu review',
      }));
  }, [takeoff]);

  return (
    <Card padding={18}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileText size={16} color="var(--text2)" />
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Transkrip Kanonik Gambar (TKG)</span>
          {tkg && (
            <StatusPill tone={record.reviewed ? 'ok' : 'warn'}>
              {sourceLabel(record.source)}{record.reviewed ? ' · DIREVIEW' : ' · BELUM DIREVIEW'}
            </StatusPill>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                padding: '5px 10px', borderRadius: 8, fontSize: 11.5, cursor: 'pointer',
                border: '1px solid var(--border)',
                background: tab === t.id ? 'var(--surface2)' : 'transparent',
                color: tab === t.id ? 'var(--text)' : 'var(--text3)', fontWeight: tab === t.id ? 700 : 500,
              }}>{t.label}</button>
          ))}
        </div>
      </div>

      {error && (
        <div role="alert" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: 10, borderRadius: 10, background: 'color-mix(in srgb, var(--dng-fg) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--dng-fg) 30%, transparent)', marginBottom: 10 }}>
          <AlertTriangle size={14} color="var(--dng-fg)" style={{ marginTop: 1 }} />
          <span style={{ fontSize: 12, color: 'var(--text)' }}>{error}</span>
        </div>
      )}
      {info && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: 10, borderRadius: 10, background: 'var(--surface2)', border: '1px solid var(--border)', marginBottom: 10 }}>
          <CheckCircle2 size={14} color="var(--text2)" style={{ marginTop: 1 }} />
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>{info}</span>
        </div>
      )}

      {tab === 'persepsi' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)' }}>
            <div>
              <label htmlFor="tkg-perception-pdf" style={S.label}>Unggah PDF gambar kerja</label>
              <input
                id="tkg-perception-pdf"
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
                style={{ ...S.mono, display: 'block', width: '100%', marginTop: 6, padding: 10, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)' }}
              />
            </div>
            {!perception && (
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text3)' }}>
                Belum ada hasil persepsi — unggah PDF gambar kerja.
              </p>
            )}
            {pdfFile && (
              <div className="pax-mono" style={{ fontSize: 11.5, color: 'var(--text2)' }}>
                File dipilih: {pdfFile.name}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button onClick={runPerceive} disabled={busy !== null || !pdfFile}>
                {busy === 'perceive' ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {busy === 'perceive' ? 'Memproses persepsi…' : 'Jalankan persepsi'}
              </Button>
              <Button variant="secondary" onClick={() => setTab('sumber')} disabled={busy !== null}>
                Pakai tab Sumber
              </Button>
            </div>
          </div>

          {perception && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: 10, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)' }}>
                <StatusPill tone={perception.gerbang.status === 'lolos' ? 'ok' : 'warn'}>
                  {perception.gerbang.status === 'lolos' ? 'GERBANG-2 LOLOS' : 'DRAFT'}
                </StatusPill>
                <span style={{ fontSize: 12.5, color: 'var(--text2)' }}>
                  {perception.gerbang.status === 'lolos'
                    ? 'Semua pemeriksaan gerbang lolos.'
                    : `DRAFT — ${failedGateChecks} pemeriksaan belum lolos.`}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
                {[
                  ['Cakupan', formatPercent(perception.metrics.cakupan)],
                  ['Grammar-pass', formatPercent(perception.metrics.grammar_pass_rate)],
                  ['Unclassified', String(perception.metrics.n_unclassified)],
                  ['Warning', String(perception.metrics.n_warning)],
                ].map(([label, value]) => (
                  <div key={label} style={{ padding: 10, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)' }}>
                    <div className="pax-mono" style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>{value}</div>
                    <div style={{ ...S.label, marginTop: 2 }}>{label}</div>
                  </div>
                ))}
              </div>

              <div style={{ padding: 10, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)' }}>
                <div style={{ ...S.label, marginBottom: 6 }}>Pemeriksaan gerbang</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {perception.gerbang.checks.map((check) => (
                    <div key={check.code} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: 'var(--text2)' }}>
                      {check.passed ? <CheckCircle2 size={14} color="var(--ok-fg)" /> : <AlertTriangle size={14} color="var(--warn-fg)" />}
                      <span><span className="pax-mono">[{check.code}]</span> {check.label} — {check.passed ? 'lolos' : 'belum lolos'}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ padding: 10, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)' }}>
                <div style={{ ...S.label, marginBottom: 6 }}>Warnings grouped by code</div>
                {warningGroups.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>Tidak ada warning dari pipeline.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {warningGroups.map((group) => {
                      const open = Boolean(warningGroupOpen[group.code]);
                      return (
                        <div key={group.code} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                          <button
                            type="button"
                            onClick={() => setWarningGroupOpen((prev) => ({ ...prev, [group.code]: !open }))}
                            aria-expanded={open}
                            style={{ width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 10px', background: 'var(--surface2)', color: 'var(--text)', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                          >
                            <span style={{ fontSize: 12, fontWeight: 700 }}><span className="pax-mono">[{group.code}]</span> ({group.items.length})</span>
                            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                          {open && (
                            <div style={{ overflowX: 'auto' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
                                <thead><tr><th style={S.th}>Pesan</th><th style={S.th}>Locator</th></tr></thead>
                                <tbody>
                                  {group.items.map((item, idx) => (
                                    <tr key={`${group.code}-${idx}`}>
                                      <td style={S.td}>{item.message}</td>
                                      <td style={{ ...S.td, color: 'var(--text3)' }} className="pax-mono">{formatLocator(item) ?? '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div style={{ padding: 10, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)' }}>
                <div style={{ ...S.label, marginBottom: 6 }}>Unclassified</div>
                {perceptionUnclassified.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>Tidak ada unclassified.</div>
                ) : (
                  <>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                        <thead><tr><th style={S.th}>Raw</th><th style={S.th}>Alasan</th><th style={S.th}>Locator</th></tr></thead>
                        <tbody>
                          {visibleUnclassified.map((item, idx) => (
                            <tr key={`${item.raw}-${idx}`}>
                              <td style={S.td} className="pax-mono">{item.raw}</td>
                              <td style={S.td}>{item.alasan}</td>
                              <td style={{ ...S.td, color: 'var(--text3)' }} className="pax-mono">{formatLocator(item) ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {perceptionUnclassified.length > 10 && (
                      <Button variant="ghost" onClick={() => setUnclassifiedOpen((v) => !v)} style={{ marginTop: 8 }}>
                        {unclassifiedOpen ? 'Ringkas unclassified' : `Tampilkan semua (${perceptionUnclassified.length})`}
                      </Button>
                    )}
                  </>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button onClick={usePerceivedTkg} disabled={busy !== null}>
                  <CheckCircle2 size={14} /> Pakai TKG ini sebagai transkrip
                </Button>
                <Button variant="secondary" onClick={discardPerception} disabled={busy !== null}>
                  Buang, coba lagi
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'sumber' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={S.label}>Teks / deskripsi gambar kerja (hasil baca sheet, catatan, tabel)</div>
            <textarea value={sourceText} onChange={(e) => setSourceText(e.target.value)} rows={8}
              placeholder={'Contoh: Denah sloof & kolom. Grid X: A-B 3000, B-C 3500 (total 6500). Grid Y: 1-2 4000.\nKolom K1 di as B/1, 4 buah. Tabel kolom: K1 300x400, 8D16, sengkang D8-150, fc\' 25...'}
              style={{ ...S.mono, width: '100%', marginTop: 6, padding: 10, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <Button onClick={runAiExtract} disabled={busy !== null}>
                <Sparkles size={14} /> {busy === 'ai' ? 'Menyalin…' : 'Transkrip dengan AI'}
              </Button>
            </div>
          </div>
          <div>
            <div style={S.label}>Fallback manual — tempel JSON TkgDocument langsung</div>
            <textarea value={manualJson} onChange={(e) => setManualJson(e.target.value)} rows={5}
              placeholder='{"prj_id":"...","sheets":[...]}'
              style={{ ...S.mono, width: '100%', marginTop: 6, padding: 10, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', resize: 'vertical' }} />
            <div style={{ marginTop: 8 }}>
              <Button variant="secondary" onClick={loadManual} disabled={busy !== null}>
                {busy === 'manual' ? 'Memuat…' : 'Muat TKG Manual'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {tab === 'transkrip' && (
        !tkg ? <p style={{ fontSize: 12.5, color: 'var(--text3)' }}>Belum ada TKG — mulai dari tab Sumber.</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button variant="secondary" onClick={runValidate} disabled={busy !== null}>
                <RefreshCw size={14} /> {busy === 'validate' ? 'Memvalidasi…' : 'Validasi (V-02..V-08)'}
              </Button>
              <Button variant="secondary" onClick={runRender} disabled={busy !== null}>
                <FileText size={14} /> {busy === 'render' ? 'Merender…' : 'Buat Skrip .tkg.txt'}
              </Button>
              {!record.reviewed && (
                <Button variant="secondary" onClick={markReviewed} disabled={busy !== null}>
                  <CheckCircle2 size={14} /> Tandai Sudah Direview
                </Button>
              )}
            </div>

            {validation && (
              <div style={{ padding: 10, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                  <StatusPill tone={validation.gate_passed ? 'ok' : validation.ok ? 'warn' : 'dng'}>
                    {validation.gate_passed ? 'GERBANG LOLOS' : validation.ok ? 'DRAFT (ada warning)' : `${validation.n_errors} ERROR`}
                  </StatusPill>
                  <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>{validation.n_warnings} warning</span>
                </div>
                {validation.issues.map((iss, i) => (
                  <div key={i} style={{ fontSize: 12, color: iss.severity === 'error' ? 'crimson' : 'var(--text2)', padding: '2px 0' }}>
                    <span className="pax-mono" style={{ fontSize: 11 }}>[{iss.code}]</span> {iss.message}
                  </div>
                ))}
                {validation.issues.length === 0 && <div style={{ fontSize: 12, color: 'var(--text2)' }}>Tidak ada temuan.</div>}
              </div>
            )}

            {tkg.sheets.map((sheet) => (
              <div key={sheet.sheet_id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
                  {sheet.sheet_id} · {sheet.jenis.toUpperCase()} · {sheet.meta.judul}
                  {sheet.meta.skala ? <span style={{ color: 'var(--text3)', fontWeight: 400 }}> · skala {sheet.meta.skala}</span> : null}
                </div>
                {sheet.grid && (sheet.grid.bentang_x.length > 0 || sheet.grid.bentang_y.length > 0) && (
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4 }} className="pax-mono">
                    Grid X: {sheet.grid.bentang_x.map((s) => `${s.dari}-${s.ke}=${s.nilai}${s.unit}`).join(' · ') || '—'}
                    {sheet.grid.total_x ? ` (total ${sheet.grid.total_x.nilai}${sheet.grid.total_x.unit})` : ''}
                    <br />
                    Grid Y: {sheet.grid.bentang_y.map((s) => `${s.dari}-${s.ke}=${s.nilai}${s.unit}`).join(' · ') || '—'}
                    {sheet.grid.total_y ? ` (total ${sheet.grid.total_y.nilai}${sheet.grid.total_y.unit})` : ''}
                  </div>
                )}
                {sheet.levels.length > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4 }} className="pax-mono">
                    Level: {sheet.levels.map((l) => `${l.label_raw}${l.lantai ? ` (${l.lantai})` : ''}`).join(' · ')}
                  </div>
                )}
                {sheet.elements.length > 0 && (
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 4 }}>
                    <thead><tr>
                      <th style={S.th}>Kode</th><th style={S.th}>Bentuk</th><th style={S.th}>Alamat (grid)</th>
                      <th style={S.th}>n</th><th style={S.th}>Simbol/Label</th><th style={S.th}>Lantai</th>
                    </tr></thead>
                    <tbody>
                      {sheet.elements.map((el, i) => (
                        <tr key={i}>
                          <td style={{ ...S.td, fontWeight: 700 }} className="pax-mono">{el.kode}</td>
                          <td style={S.td}>{el.bentuk}</td>
                          <td style={S.td}>{el.alamat}{el.ruas ? ` (as ${el.ruas.dari}→${el.ruas.ke}${el.ruas.pada ? ` pada ${el.ruas.pada}` : ''})` : ''}</td>
                          <td style={S.td}>{el.n}</td>
                          <td style={S.td}>{el.count_simbol ?? '—'}/{el.count_label ?? '—'}</td>
                          <td style={S.td}>{el.lantai ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {sheet.tables.map((tbl, ti) => (
                  <div key={ti} style={{ marginTop: 8 }}>
                    <div style={S.label}>{tbl.judul}</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 4 }}>
                      <thead><tr>
                        <th style={S.th}>Kode</th><th style={S.th}>Lantai</th><th style={S.th}>Dimensi</th>
                        <th style={S.th}>Tulangan</th><th style={S.th}>Mutu</th>
                      </tr></thead>
                      <tbody>
                        {tbl.records.map((r, ri) => (
                          <tr key={ri}>
                            <td style={{ ...S.td, fontWeight: 700 }} className="pax-mono">{r.kode}</td>
                            <td style={S.td}>{r.lantai ?? '—'}</td>
                            <td style={S.td} className="pax-mono">
                              {Object.entries(r.dimensi).map(([k, v]) => `${k}=${v}`).join(', ')} {r.satuan_dimensi}
                            </td>
                            <td style={S.td} className="pax-mono">{r.tulangan.map((t) => `${t.posisi}:${t.raw}`).join('; ') || '—'}</td>
                            <td style={S.td}>{r.mutu_beton ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
                {sheet.unclassified.length > 0 && (
                  <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--text3)' }}>
                    UNCLASSIFIED ({sheet.unclassified.length}): {sheet.unclassified.map((u) => `"${u.raw}"`).join(', ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'skrip' && (
        !script ? (
          <div>
            <p style={{ fontSize: 12.5, color: 'var(--text3)' }}>Belum ada skrip — buat dari tab Transkrip.</p>
          </div>
        ) : (
          <pre style={{ ...S.mono, whiteSpace: 'pre-wrap', padding: 12, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', maxHeight: 480, overflow: 'auto' }}>
            {script}
          </pre>
        )
      )}

      {tab === 'takeoff' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            {([
              ['Tinggi/lantai (m)', tinggiLantai, setTinggiLantai, 'mis. 3.5'],
              ['Lewatan n_ld (×d)', nLd, setNLd, 'mis. 40'],
              ['Stok besi (m)', lStock, setLStock, 'mis. 12'],
              ['Pakai-ulang bekisting', reuseForm, setReuseForm, 'mis. 2'],
            ] as const).map(([label, value, set, ph]) => (
              <div key={label}>
                <div style={S.label}>{label}</div>
                <input value={value} onChange={(e) => set(e.target.value)} placeholder={ph}
                  style={{ ...S.mono, marginTop: 6, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', width: 120 }} />
              </div>
            ))}
            <Button onClick={runTakeoff} disabled={busy !== null || !tkg}>
              <Calculator size={14} /> {busy === 'takeoff' ? 'Menghitung (engine)…' : 'Hitung Takeoff (engine)'}
            </Button>
            {takeoff && takeoff.items.some((i) => !i.needs_review) && (
              <Button variant="secondary" onClick={sendToRab} disabled={busy !== null}>
                <Send size={14} /> Kirim Volume ke Draft RAB
              </Button>
            )}
          </div>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--text3)' }}>
            Parameter opsional — diteruskan apa adanya ke engine & tercatat sebagai asumsi/params_used (RULE-BOE).
          </p>

          {takeoff && (
            <>
              <TriagePanel
                projectId={projectId}
                items={triageItems}
                onRecompute={runTakeoff}
                busy={busy === 'takeoff'}
              />
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={S.th}>Kode</th><th style={S.th}>Pekerjaan</th><th style={S.th}>Kuantitas</th>
                  <th style={S.th}>Satuan</th><th style={S.th}>Rumus</th><th style={S.th}>Rincian / Alasan review</th>
                </tr></thead>
                <tbody>
                  {takeoff.items.map((it, i) => (
                    <tr key={i} style={it.needs_review ? { background: 'color-mix(in srgb, orange 7%, transparent)' } : undefined}>
                      <td style={{ ...S.td, fontWeight: 700 }} className="pax-mono">{it.kode}{it.lantai ? ` (${it.lantai})` : ''}</td>
                      <td style={S.td}>{it.work_type} <span style={{ color: 'var(--text3)' }}>· {it.kategori}</span></td>
                      <td style={{ ...S.td, fontWeight: 700 }} className="pax-mono">
                        {it.quantity != null ? it.quantity.toLocaleString('id-ID', { maximumFractionDigits: 4 }) : 'REVIEW'}
                      </td>
                      <td style={S.td}>{it.unit}</td>
                      <td style={{ ...S.td, fontSize: 11 }} className="pax-mono">[{it.rule_id}] {it.formula}</td>
                      <td style={{ ...S.td, fontSize: 11, color: it.needs_review ? 'darkorange' : 'var(--text2)' }}>
                        {it.needs_review ? (it.review_reason ?? 'perlu review') : it.detail}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>
                {takeoff.n_needs_review} item butuh review · {takeoff.assumptions.length} asumsi tercatat
                {takeoff.assumptions.length > 0 && (
                  <ul style={{ margin: '4px 0 0 16px' }}>
                    {takeoff.assumptions.map((a, i) => <li key={i}>{a}</li>)}
                  </ul>
                )}
                {takeoff.params_used.length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    Parameter terpakai: {takeoff.params_used.map((p) => `${p.nama}=${p.nilai}`).join(' · ')}
                  </div>
                )}
              </div>
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, background: 'var(--surface)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                  <div style={S.label}>Bar Bending Schedule (BBS)</div>
                  {takeoff.bbs && (
                    <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>
                      Waste total {formatTkgBbsNumber(takeoff.bbs.total_waste_kg)} kg
                    </span>
                  )}
                </div>
                {hasTkgBbs(takeoff.bbs) ? (
                  <div style={{ display: 'grid', gap: 10 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead><tr>
                        <th style={S.th}>Mark</th><th style={S.th}>Diameter</th><th style={S.th}>Panjang</th>
                        <th style={S.th}>Qty</th><th style={S.th}>Berat total</th>
                      </tr></thead>
                      <tbody>
                        {takeoff.bbs?.marks.map((m) => (
                          <tr key={`${m.mark}-${m.kode}-${m.posisi}`}>
                            <td style={{ ...S.td, fontWeight: 700 }} className="pax-mono">{m.mark}</td>
                            <td style={S.td} className="pax-mono">D{formatTkgBbsNumber(m.d_mm)}</td>
                            <td style={S.td} className="pax-mono">{formatTkgBbsNumber(m.panjang_m)} m</td>
                            <td style={S.td} className="pax-mono">{m.jumlah}</td>
                            <td style={S.td} className="pax-mono">{formatTkgBbsNumber(m.berat_kg)} kg</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead><tr>
                        <th style={S.th}>Diameter</th><th style={S.th}>Total panjang potong</th>
                        <th style={S.th}>Stok batang</th><th style={S.th}>Waste</th>
                      </tr></thead>
                      <tbody>
                        {takeoff.bbs?.per_diameter.map((d) => (
                          <tr key={d.d_mm}>
                            <td style={{ ...S.td, fontWeight: 700 }} className="pax-mono">D{formatTkgBbsNumber(d.d_mm)}</td>
                            <td style={S.td} className="pax-mono">{formatTkgBbsNumber(d.total_panjang_m)} m</td>
                            <td style={S.td} className="pax-mono">{d.kebutuhan_stok_batang}</td>
                            <td style={S.td} className="pax-mono">{formatTkgBbsNumber(d.waste_kg)} kg</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>Belum ada BBS dari engine.</div>
                )}
              </div>
            </>
          )}
          {!takeoff && <p style={{ fontSize: 12.5, color: 'var(--text3)' }}>Belum ada hasil — jalankan takeoff. Semua kuantitas dihitung engine; item dengan data kurang ditandai REVIEW, tidak pernah ditebak.</p>}
        </div>
      )}
    </Card>
  );
}
