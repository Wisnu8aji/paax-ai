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
  ChevronDown,
  ChevronRight,
  FileText,
  Layers,
  ListChecks,
  Ruler,
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
  type ConsolidatedAssumption,
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

const ZONE_LABELS: Record<string, string> = {
  substruktur: 'Substruktur / Pondasi',
  struktur_lantai_1: 'Struktur Lantai 1',
  struktur_lantai_2: 'Struktur Lantai 2',
  struktur_lantai_3: 'Struktur Lantai 3',
  struktur_atap: 'Struktur Atap',
  detail_tabel: 'Detail & Tabel',
};

function zoneLabel(zone: string | null): string {
  if (!zone) return 'Belum diketahui';
  return ZONE_LABELS[zone] ?? zone.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const DAMPAK_TONE: Record<ConsolidatedAssumption['dampak'], 'ok' | 'warn' | 'dng'> = {
  rendah: 'ok',
  sedang: 'warn',
  tinggi: 'dng',
};

const ASSUMPTIONS_PREVIEW_COUNT = 12;

function formatBuildingSize(mm: number | null): string | null {
  if (mm == null) return null;
  return `${(mm / 1000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} m`;
}

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
  const [assumptionsExpanded, setAssumptionsExpanded] = useState(false);
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
    if (!tkg) return;
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
    setAssumptionsExpanded(false);
    setRabDraftPath(null);
    setError(null);
    setInfo(`${file.name} siap dianalisis. Klik "Analisa Gambar Kerja" untuk melihat hasilnya.`);
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
      setAssumptionsExpanded(false);
      setInfo('Hasil analisis siap direview di bawah.');
    } catch (err) {
      setError(err instanceof DocumentIntelligenceError ? err.message : (err instanceof Error ? err.message : 'Upload gambar gagal.'));
    } finally {
      setBusy(null);
      setProgressMessage(null);
    }
  }, [projectId, selectedPdf]);

  const usePerceptionAsTranscript = useCallback(async () => {
    if (!perceptionReview) return;
    setBusy('save-perception');
    setError(null);
    setRabDraftPath(null);
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
      setInfo('Hasil analisis gambar tersimpan. Validasi dan hitung volume berjalan otomatis.');
      await runPipeline(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Simpan hasil analisis atau proses engine gagal.');
    } finally {
      setBusy(null);
    }
  }, [perceptionReview, projectId, record, runPipeline]);

  const discardPerception = useCallback(() => {
    setSelectedPdf(null);
    setPerceptionReview(null);
    setAssumptionsExpanded(false);
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

  const sendToRab = useCallback(async () => {
    if (!takeoff) return;
    setBusy('rab');
    setError(null);
    try {
      const draft = await rabRepository.get(projectId);
      const okItems = takeoff.items.filter((item) => !item.needs_review && item.quantity != null);
      // Fase T: kode AHSP terisi HANYA bila usulan cukup yakin (ahsp_suggested
      // true, ambang diverifikasi manual thd katalog CK 2026 nyata) -- selain
      // itu tetap kosong seperti sebelumnya, user pilih manual di halaman RAB.
      const suggestionByKey = new Map(
        ahspSuggestions.map((s) => [`${s.kode}|${s.lantai ?? ''}|${s.work_type}`, s]),
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
        `. ${takeoff.items.length - okItems.length} item review tidak ikut dikirim.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kirim ke RAB gagal.');
    } finally {
      setBusy(null);
    }
  }, [ahspSuggestions, projectId, takeoff]);

  const openRabDraft = useCallback(() => {
    if (!rabDraftPath) return;
    router.push(rabDraftPath);
  }, [rabDraftPath, router]);

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

  // Elemen per-zona: gabung `element_registry` (lintas-halaman) dengan zona
  // sheet asal tiap instance, supaya tampilan "grid & elemen" dikelompokkan
  // per paket pekerjaan (substruktur/struktur lantai N/atap), bukan per kode
  // mentah — bahasa teknik sipil, bukan struktur data internal.
  const elementsByZone = useMemo(() => {
    const consolidated = perceptionReview?.result.consolidated;
    if (!consolidated) return [] as Array<{ zone: string | null; rows: Array<{ alamat: string; kode: string }> }>;

    const zoneBySheetPage = new Map<number, string | null>();
    for (const sheet of consolidated.sheets) zoneBySheetPage.set(sheet.page, sheet.zone);

    const rowsByZone = new Map<string, Array<{ alamat: string; kode: string }>>();
    for (const entry of consolidated.element_registry) {
      for (const instance of entry.instances) {
        const zone = zoneBySheetPage.get(instance.sheet_page) ?? null;
        const key = zone ?? '__unknown__';
        const rows = rowsByZone.get(key) ?? [];
        rows.push({ alamat: instance.alamat, kode: entry.kode });
        rowsByZone.set(key, rows);
      }
    }
    return Array.from(rowsByZone, ([key, rows]) => ({ zone: key === '__unknown__' ? null : key, rows }));
  }, [perceptionReview]);

  const assumptions = perceptionReview?.result.consolidated?.assumptions ?? [];
  const highImpactAssumptions = assumptions.filter((a) => a.dampak === 'tinggi');
  const visibleAssumptions = assumptionsExpanded ? assumptions : assumptions.slice(0, ASSUMPTIONS_PREVIEW_COUNT);

  const readyItems = takeoff?.items.filter((item) => !item.needs_review && item.quantity != null).length ?? 0;
  const statusText = takeoff
    ? `AI menemukan ${counts.elements} elemen dari ${counts.tables} tabel pada ${counts.sheets} sheet. ${readyItems} volume siap dikirim, ${takeoff.n_needs_review} item perlu review.`
    : perceptionReview
    ? 'Hasil analisis gambar siap direview di bawah. Tekan simpan untuk menjalankan validasi dan hitung volume otomatis.'
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
              <Sparkles size={14} /> {busy === 'perception' ? 'Menganalisis...' : 'Analisa Gambar Kerja'}
            </Button>
          </div>
          {busy === 'perception' && <AnalyzingIndicator progressMessage={progressMessage} />}

          <div style={{ marginTop: 12, border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Review Gambar</div>
              {highImpactAssumptions.length > 0 && (
                <StatusPill tone="warn">{highImpactAssumptions.length} perlu perhatian</StatusPill>
              )}
            </div>

            {!perceptionReview ? (
              <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.5 }}>
                Belum ada hasil analisis. Unggah PDF lalu klik &quot;Analisa Gambar Kerja&quot; untuk melihat ringkasan gambar per halaman.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
                    <FileText size={13} /> Halaman gambar
                  </div>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {perceptionReview.result.consolidated?.sheets.map((sheet) => (
                      <div key={sheet.sheet_id} style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--border)', borderRadius: 10, padding: '8px 10px', background: 'var(--elev)' }}>
                        <StatusPill tone="ok" mono>{`Hal. ${sheet.page}`}</StatusPill>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>{sheet.judul}</div>
                          <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                            {zoneLabel(sheet.zone)}{sheet.skala ? ` · Skala ${sheet.skala}` : ''}
                          </div>
                        </div>
                      </div>
                    )) ?? <div style={{ fontSize: 12, color: 'var(--text3)' }}>Tidak ada data halaman.</div>}
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
                    <Layers size={13} /> Grid &amp; elemen per zona
                  </div>
                  {elementsByZone.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--text3)' }}>Belum ada elemen dengan grid yang terbaca.</div>
                  ) : (
                    <div style={{ display: 'grid', gap: 8 }}>
                      {elementsByZone.map(({ zone, rows }) => (
                        <div key={zone ?? 'unknown'} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, background: 'var(--elev)' }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>{zoneLabel(zone)}</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {rows.map((row, index) => (
                              <div key={`${row.alamat}-${row.kode}-${index}`} style={{ fontSize: 11.5, padding: '3px 8px', borderRadius: 999, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text2)' }}>
                                <span style={{ fontWeight: 700, color: 'var(--text)' }}>{row.alamat}</span>: {row.kode}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {perceptionReview.result.consolidated?.building_dimensions.sumber !== 'tidak_tersedia' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--border)', borderRadius: 10, padding: 10, background: 'var(--elev)' }}>
                    <Ruler size={16} color="var(--gold)" />
                    <div style={{ fontSize: 12.5, color: 'var(--text)' }}>
                      Bangunan diperkirakan{' '}
                      <strong>
                        {formatBuildingSize(perceptionReview.result.consolidated?.building_dimensions.total_x_mm ?? null) ?? '?'}
                        {' × '}
                        {formatBuildingSize(perceptionReview.result.consolidated?.building_dimensions.total_y_mm ?? null) ?? '?'}
                      </strong>
                    </div>
                  </div>
                )}

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
                    <ListChecks size={13} /> Perlu dicek {assumptions.length > 0 ? `(${assumptions.length})` : ''}
                  </div>
                  {assumptions.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--text3)' }}>Tidak ada yang perlu dicek — semua terbaca jelas.</div>
                  ) : (
                    <div style={{ display: 'grid', gap: 6 }}>
                      {visibleAssumptions.map((assumption, index) => (
                        <div key={index} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', border: '1px solid var(--border)', borderRadius: 10, padding: 8, background: 'var(--elev)' }}>
                          <StatusPill tone={DAMPAK_TONE[assumption.dampak]}>{assumption.dampak}</StatusPill>
                          <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                            {assumption.pernyataan}
                            {assumption.sheet_page != null && <span style={{ color: 'var(--text3)' }}> (hal. {assumption.sheet_page})</span>}
                          </div>
                        </div>
                      ))}
                      {assumptions.length > ASSUMPTIONS_PREVIEW_COUNT && (
                        <button
                          type="button"
                          onClick={() => setAssumptionsExpanded((prev) => !prev)}
                          style={{ border: 0, background: 'transparent', color: 'var(--text3)', cursor: 'pointer', fontSize: 11.5, textAlign: 'left', padding: '4px 0', display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                          {assumptionsExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                          {assumptionsExpanded ? 'Sembunyikan' : `Lihat ${assumptions.length - ASSUMPTIONS_PREVIEW_COUNT} lainnya`}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Button onClick={usePerceptionAsTranscript} disabled={busy !== null}>
                    <CheckCircle2 size={14} /> Simpan hasil analisis
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
          {busy && busy !== 'perception' && <div style={{ fontSize: 12, color: 'var(--text2)' }}>Sedang menjalankan tahap: {busy}</div>}
        </div>
      </div>

      {takeoff && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <TriagePanel projectId={projectId} items={triageItems} onRecompute={rerunPipeline} busy={busy === 'takeoff'} />
          {readyItems > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <Button variant="secondary" onClick={sendToRab} disabled={busy !== null} style={{ alignSelf: 'flex-start' }}>
                <Send size={14} /> Kirim Volume ke Draft RAB
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
