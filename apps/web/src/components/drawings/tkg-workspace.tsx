'use client';

/**
 * PAAX - Analisis Gambar AI.
 *
 * UI ini hanya mengorkestrasi presentasi: AI menyalin teks/deskripsi gambar
 * menjadi TKG, lalu core-engine menjalankan validasi, render, dan takeoff.
 * Frontend tidak menghitung kuantitas/harga.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Send, Sparkles } from 'lucide-react';

import type { TakeoffResult, TkgDocument, TkgValidationResult } from '@paax/schemas';
import { Card, Button, StatusPill } from '@/components/ui';
import { renderTkg, takeoffTkg, validateTkg } from '@/lib/engine';
import { emptyTkgRecord, tkgRepository, type ProjectTkgRecord } from '@/lib/projects/tkg-repository';
import { emptyRabLine, rabRepository } from '@/lib/projects/rab-repository';
import { TriagePanel, type TriageItemView } from '@/components/review/triage-panel';

const statusBox = {
  display: 'flex',
  gap: 8,
  alignItems: 'flex-start',
  padding: 10,
  borderRadius: 10,
  border: '1px solid var(--border)',
  marginBottom: 10,
};

export function TkgWorkspace({ projectId }: { projectId: string }) {
  const [record, setRecord] = useState<ProjectTkgRecord>(() => emptyTkgRecord(projectId));
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
      .map((item) => ({
        key: `${item.kode}.${item.work_type}.${item.rule_id}`,
        kode: item.kode,
        work: `${item.work_type} · ${item.kategori}`,
        rule_id: item.rule_id,
        reason: item.review_reason ?? 'perlu review',
      }));
  }, [takeoff]);

  const readyItems = takeoff?.items.filter((item) => !item.needs_review && item.quantity != null).length ?? 0;
  const statusText = takeoff
    ? `AI menemukan ${counts.elements} elemen dari ${counts.tables} tabel pada ${counts.sheets} sheet. ${readyItems} volume siap dikirim, ${takeoff.n_needs_review} item perlu review.`
    : tkg
      ? `AI menemukan ${counts.elements} elemen dari ${counts.tables} tabel pada ${counts.sheets} sheet. Proses engine siap dijalankan ulang.`
      : 'Tempel deskripsi gambar kerja untuk memulai analisis.';

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
            Teks / deskripsi gambar kerja
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
