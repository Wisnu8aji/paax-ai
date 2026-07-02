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
import { FileText, Sparkles, CheckCircle2, AlertTriangle, Calculator, Send, RefreshCw } from 'lucide-react';

import { TkgDocumentSchema, type TkgDocument, type TkgValidationResult, type TakeoffResult } from '@paax/schemas';
import { Card, Button, StatusPill } from '@/components/ui';
import { renderTkg, takeoffTkg, validateTkg } from '@/lib/engine';
import { tkgRepository, emptyTkgRecord, type ProjectTkgRecord } from '@/lib/projects/tkg-repository';
import { rabRepository, emptyRabLine } from '@/lib/projects/rab-repository';

type Tab = 'sumber' | 'transkrip' | 'skrip' | 'takeoff';

const S = {
  label: { fontSize: 11, fontWeight: 700 as const, color: 'var(--text3)', textTransform: 'uppercase' as const, letterSpacing: 0.4 },
  mono: { fontFamily: 'var(--font-mono, monospace)', fontSize: 12 },
  th: { textAlign: 'left' as const, padding: '6px 8px', fontSize: 11, color: 'var(--text3)', borderBottom: '1px solid var(--border)' },
  td: { padding: '6px 8px', fontSize: 12, color: 'var(--text)', borderBottom: '1px solid var(--border)' },
};

export function TkgWorkspace({ projectId }: { projectId: string }) {
  const [record, setRecord] = useState<ProjectTkgRecord>(() => emptyTkgRecord(projectId));
  const [tab, setTab] = useState<Tab>('sumber');
  const [sourceText, setSourceText] = useState('');
  const [manualJson, setManualJson] = useState('');
  const [tinggiLantai, setTinggiLantai] = useState<string>('');
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
    const t = Number.parseFloat(tinggiLantai.replace(',', '.'));
    return Number.isFinite(t) && t > 0 ? { tinggi_per_lantai_m: t } : undefined;
  }, [tinggiLantai]);

  const saveTkg = useCallback(async (tkg: TkgDocument, source: string) => {
    const next = await tkgRepository.save({ ...record, projectId, tkg, source, reviewed: false });
    setRecord(next);
    setValidation(null);
    setScript(null);
    setTakeoff(null);
    setTab('transkrip');
  }, [projectId, record]);

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

  const tkg = record.tkg;
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'sumber', label: '1 · Sumber' },
    { id: 'transkrip', label: '2 · Transkrip (TKG)' },
    { id: 'skrip', label: '3 · Skrip .tkg.txt' },
    { id: 'takeoff', label: '4 · Takeoff' },
  ];

  return (
    <Card padding={18}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileText size={16} color="var(--text2)" />
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Transkrip Kanonik Gambar (TKG)</span>
          {tkg && (
            <StatusPill tone={record.reviewed ? 'ok' : 'warn'}>
              {record.source === 'ai_proposal' ? 'USULAN AI' : 'MANUAL'}{record.reviewed ? ' · DIREVIEW' : ' · BELUM DIREVIEW'}
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
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: 10, borderRadius: 10, background: 'color-mix(in srgb, crimson 8%, transparent)', border: '1px solid color-mix(in srgb, crimson 30%, transparent)', marginBottom: 10 }}>
          <AlertTriangle size={14} color="crimson" style={{ marginTop: 1 }} />
          <span style={{ fontSize: 12, color: 'var(--text)' }}>{error}</span>
        </div>
      )}
      {info && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: 10, borderRadius: 10, background: 'var(--surface2)', border: '1px solid var(--border)', marginBottom: 10 }}>
          <CheckCircle2 size={14} color="var(--text2)" style={{ marginTop: 1 }} />
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>{info}</span>
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
            <div>
              <div style={S.label}>Tinggi kolom per lantai (m) — opsional, dicatat sbg asumsi</div>
              <input value={tinggiLantai} onChange={(e) => setTinggiLantai(e.target.value)} placeholder="mis. 3.5"
                style={{ ...S.mono, marginTop: 6, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', width: 140 }} />
            </div>
            <Button onClick={runTakeoff} disabled={busy !== null || !tkg}>
              <Calculator size={14} /> {busy === 'takeoff' ? 'Menghitung (engine)…' : 'Hitung Takeoff (engine)'}
            </Button>
            {takeoff && takeoff.items.some((i) => !i.needs_review) && (
              <Button variant="secondary" onClick={sendToRab} disabled={busy !== null}>
                <Send size={14} /> Kirim Volume ke Draft RAB
              </Button>
            )}
          </div>

          {takeoff && (
            <>
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
            </>
          )}
          {!takeoff && <p style={{ fontSize: 12.5, color: 'var(--text3)' }}>Belum ada hasil — jalankan takeoff. Semua kuantitas dihitung engine; item dengan data kurang ditandai REVIEW, tidak pernah ditebak.</p>}
        </div>
      )}
    </Card>
  );
}
