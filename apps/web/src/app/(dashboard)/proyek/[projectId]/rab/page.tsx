'use client';

/**
 * PAAX v0.7 — Editor RAB per-proyek.
 *
 * ATURAN EMAS: TIDAK ADA kalkulasi angka di halaman ini. Halaman hanya menyimpan
 * INPUT terstruktur (kode AHSP, volume, durasi) per-proyek, lalu meminta engine
 * deterministik (services/core-engine) menghitung HSP, RAB, bobot, dan Kurva S.
 * Semua angka berasal dari engine + divalidasi Zod (@paax/schemas). Frontend hanya
 * menampilkan & memformat.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Plus,
  Trash2,
  Calculator,
  LineChart,
  Receipt,
  Loader2,
  AlertCircle,
  Save,
  CheckCircle2,
  FileSpreadsheet,
  Printer,
} from 'lucide-react';
import type { HSPBreakdown, RABResult, SCurveResult } from '@paax/schemas';
import { Card, Button, StatusPill, EmptyState, Modal } from '@/components/ui';
import { SCurveChart } from '@/components/rab/s-curve-chart';
import { HspBreakdownBody } from '@/components/rab/hsp-breakdown';
import { exportRabCsv, exportRabPdf } from '@/lib/export/rab-export';
import { useProjects } from '@/lib/projects/projects-context';
import {
  rabRepository,
  emptyRabLine,
  emptyRabDraft,
  type ProjectRabDraft,
  type RabDraftLine,
  type ScheduleMode,
} from '@/lib/projects/rab-repository';
import {
  fetchAHSPList,
  fetchRegions,
  calculateRAB,
  getHSPDetail,
  getSCurve,
  type AHSPListItem,
  type RegionItem,
  type EngineLine,
} from '@/lib/engine';
import { formatRupiah, formatNumber, formatPercent } from '@/lib/format';

export default function ProjectRabPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { getProject, updateProject, loading: projectsLoading } = useProjects();
  const project = getProject(projectId);

  const [ahspList, setAhspList] = useState<AHSPListItem[]>([]);
  const [regions, setRegions] = useState<RegionItem[]>([]);
  const [draft, setDraft] = useState<ProjectRabDraft>(() => emptyRabDraft(projectId));
  const [bootLoading, setBootLoading] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);

  const [rabResult, setRabResult] = useState<RABResult | null>(null);
  const [scurveResult, setScurveResult] = useState<SCurveResult | null>(null);
  const [hspModal, setHspModal] = useState<{ code: string; data: HSPBreakdown } | null>(null);
  const [busy, setBusy] = useState<{ rab: boolean; scurve: boolean; save: boolean; hsp: string | null }>({
    rab: false,
    scurve: false,
    save: false,
    hsp: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // ── Build valid engine lines from draft (validasi input, BUKAN hitung angka) ──
  const validLines = useMemo<EngineLine[] | null>(() => {
    const lines: EngineLine[] = [];
    for (const row of draft.lines) {
      if (!row.ahsp_code) continue;
      if (row.volume === null || Number.isNaN(row.volume) || row.volume <= 0) return null;
      lines.push({
        ahsp_code: row.ahsp_code,
        volume: row.volume,
        duration_days: row.duration_days && row.duration_days > 0 ? row.duration_days : undefined,
      });
    }
    return lines.length ? lines : null;
  }, [draft.lines]);

  const allHaveDuration = useMemo(
    () =>
      draft.lines
        .filter((r) => r.ahsp_code && r.volume && r.volume > 0)
        .every((r) => r.duration_days && r.duration_days > 0),
    [draft.lines],
  );
  const canSCurve = validLines !== null && allHaveDuration;

  const runCalculate = useCallback(
    async (lines: EngineLine[], regionCode: string, ppnRate: number) => {
      const result = await calculateRAB(lines, regionCode, ppnRate);
      setRabResult(result);
      return result;
    },
    [],
  );

  // ── Boot: muat AHSP + wilayah + draft tersimpan, lalu auto-hitung dari engine ──
  useEffect(() => {
    let active = true;
    (async () => {
      setBootLoading(true);
      setBootError(null);
      try {
        const [list, regionList, savedDraft] = await Promise.all([
          fetchAHSPList(),
          fetchRegions(),
          rabRepository.get(projectId),
        ]);
        if (!active) return;
        setAhspList(list);
        setRegions(regionList);
        setDraft(savedDraft);

        const lines: EngineLine[] = [];
        let ok = true;
        for (const row of savedDraft.lines) {
          if (!row.ahsp_code) continue;
          if (row.volume === null || row.volume <= 0) { ok = false; break; }
          lines.push({
            ahsp_code: row.ahsp_code,
            volume: row.volume,
            duration_days: row.duration_days && row.duration_days > 0 ? row.duration_days : undefined,
          });
        }
        if (ok && lines.length) {
          await runCalculate(lines, savedDraft.regionCode, savedDraft.ppnRate);
        }
      } catch (e) {
        if (active) setBootError(e instanceof Error ? e.message : 'Gagal memuat data RAB.');
      } finally {
        if (active) setBootLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [projectId, runCalculate]);

  // ── Mutasi draft (input saja) ────────────────────────────────────────────────
  const patchDraft = (patch: Partial<ProjectRabDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const addRow = () => patchDraft({ lines: [...draft.lines, emptyRabLine()] });
  const removeRow = (id: string) =>
    patchDraft({ lines: draft.lines.length <= 1 ? draft.lines : draft.lines.filter((r) => r.id !== id) });
  const updateRow = (id: string, patch: Partial<RabDraftLine>) =>
    patchDraft({ lines: draft.lines.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  // Setiap perubahan input membatalkan hasil lama (harus dihitung ulang engine).
  const invalidateResults = () => {
    setRabResult(null);
    setScurveResult(null);
    setSavedAt(null);
  };

  const handleCalculate = async () => {
    if (!validLines) {
      setError('Setiap baris berisi item AHSP harus punya volume > 0.');
      return;
    }
    setError(null);
    setBusy((b) => ({ ...b, rab: true }));
    try {
      await runCalculate(validLines, draft.regionCode, draft.ppnRate);
      setScurveResult(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menghitung RAB.');
    } finally {
      setBusy((b) => ({ ...b, rab: false }));
    }
  };

  const handleSCurve = async () => {
    if (!validLines || !allHaveDuration) {
      setError('Untuk Kurva S, setiap baris terisi wajib mengisi durasi (hari) > 0.');
      return;
    }
    setError(null);
    setBusy((b) => ({ ...b, scurve: true }));
    try {
      setScurveResult(await getSCurve(validLines, draft.regionCode, 7, draft.mode));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal membangun Kurva S.');
    } finally {
      setBusy((b) => ({ ...b, scurve: false }));
    }
  };

  const handleHsp = async (code: string) => {
    setError(null);
    setBusy((b) => ({ ...b, hsp: code }));
    try {
      setHspModal({ code, data: await getHSPDetail(code, draft.regionCode) });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat rincian HSP.');
    } finally {
      setBusy((b) => ({ ...b, hsp: null }));
    }
  };

  const handleSave = async () => {
    setError(null);
    setBusy((b) => ({ ...b, save: true }));
    try {
      // total = hasil engine (cache tampilan), bukan hitung frontend.
      const total = rabResult ? rabResult.total : null;
      const saved = await rabRepository.save({
        ...draft,
        lastTotal: total,
        lastCalculatedAt: rabResult ? new Date().toISOString() : draft.lastCalculatedAt,
      });
      setDraft(saved);
      await updateProject(projectId, { rabValue: total });
      setSavedAt(new Date().toISOString());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan RAB.');
    } finally {
      setBusy((b) => ({ ...b, save: false }));
    }
  };

  const handleExportCsv = () => {
    if (!rabResult) return;
    try {
      exportRabCsv(rabResult, project?.name ?? 'proyek');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal export Excel.');
    }
  };
  const handleExportPdf = () => {
    if (!rabResult) return;
    try {
      exportRabPdf(rabResult, project?.name ?? 'proyek');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal export PDF.');
    }
  };

  if (projectsLoading) return <EmptyState title="Memuat proyek..." />;
  if (!project) return <EmptyState title="Proyek tidak ditemukan" message="Buka daftar proyek untuk memilih proyek." />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Banner aturan emas */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <StatusPill tone="ok"><CheckCircle2 size={12} /> Engine deterministik</StatusPill>
        <span style={{ fontSize: 12, color: 'var(--text3)' }}>
          Semua angka (HSP, jumlah, bobot, Kurva S) dihitung engine — bukan di browser.
        </span>
      </div>

      {bootError && <ErrorBox message={bootError} onClose={() => setBootError(null)} />}
      {error && <ErrorBox message={error} onClose={() => setError(null)} />}

      {/* Editor input */}
      <Card padding={18}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Item Pekerjaan RAB</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 11.5, color: 'var(--text2)' }}>Wilayah</label>
            <select
              className="pax-input"
              style={{ width: 'auto', height: 34 }}
              value={draft.regionCode}
              disabled={bootLoading}
              onChange={(e) => { patchDraft({ regionCode: e.target.value }); invalidateResults(); }}
            >
              {regions.length === 0 && <option value={draft.regionCode}>{draft.regionCode}</option>}
              {regions.map((r) => (
                <option key={r.code} value={r.code}>{r.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Header kolom */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 120px auto', gap: 10, padding: '0 2px 8px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text3)' }}>
          <span>Item AHSP</span>
          <span>Volume</span>
          <span>Durasi (hari)</span>
          <span style={{ textAlign: 'right' }}>Aksi</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {draft.lines.map((row) => {
            const selected = ahspList.find((a) => a.code === row.ahsp_code);
            return (
              <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 120px auto', gap: 10, alignItems: 'center' }}>
                <select
                  className="pax-input"
                  value={row.ahsp_code}
                  disabled={bootLoading}
                  onChange={(e) => { updateRow(row.id, { ahsp_code: e.target.value }); invalidateResults(); }}
                >
                  <option value="">{bootLoading ? 'Memuat AHSP...' : '— pilih item AHSP —'}</option>
                  {ahspList.map((a) => (
                    <option key={a.code} value={a.code}>{a.code} — {a.name} [{a.unit}]</option>
                  ))}
                </select>
                <input
                  className="pax-input"
                  type="number"
                  min={0}
                  step="any"
                  placeholder={selected ? selected.unit : 'Volume'}
                  value={row.volume ?? ''}
                  onChange={(e) => { updateRow(row.id, { volume: e.target.value === '' ? null : Number(e.target.value) }); invalidateResults(); }}
                />
                <input
                  className="pax-input"
                  type="number"
                  min={0}
                  step={1}
                  placeholder="opsional"
                  value={row.duration_days ?? ''}
                  onChange={(e) => { updateRow(row.id, { duration_days: e.target.value === '' ? null : Math.trunc(Number(e.target.value)) }); invalidateResults(); }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                  <button
                    onClick={() => handleHsp(row.ahsp_code)}
                    disabled={!row.ahsp_code || busy.hsp === row.ahsp_code}
                    title="Rincian HSP"
                    style={iconBtn}
                  >
                    {busy.hsp === row.ahsp_code ? <Loader2 size={15} className="animate-spin" /> : <Receipt size={15} />}
                  </button>
                  <button
                    onClick={() => { removeRow(row.id); invalidateResults(); }}
                    disabled={draft.lines.length <= 1}
                    title="Hapus baris"
                    style={{ ...iconBtn, opacity: draft.lines.length <= 1 ? 0.4 : 1 }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={addRow}><Plus size={15} /> Tambah Item</Button>
          <Button onClick={handleCalculate} disabled={busy.rab || !validLines}>
            {busy.rab ? <Loader2 size={15} className="animate-spin" /> : <Calculator size={15} />} Hitung RAB
          </Button>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <select
              className="pax-input"
              style={{ width: 'auto', height: 38 }}
              value={draft.mode}
              onChange={(e) => { patchDraft({ mode: e.target.value as ScheduleMode }); setScurveResult(null); }}
              title="Mode penjadwalan"
            >
              <option value="sequential">Sequential</option>
              <option value="parallel">Parallel</option>
            </select>
            <Button variant="secondary" onClick={handleSCurve} disabled={busy.scurve || !canSCurve} title={canSCurve ? 'Bangun Kurva S' : 'Isi durasi semua baris terisi'}>
              {busy.scurve ? <Loader2 size={15} className="animate-spin" /> : <LineChart size={15} />} Kurva S
            </Button>
            <Button onClick={handleSave} disabled={busy.save}>
              {busy.save ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Simpan
            </Button>
          </div>
        </div>
        {savedAt && (
          <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--ok-dot)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <CheckCircle2 size={13} /> Tersimpan. Nilai RAB proyek diperbarui dari hasil engine.
          </div>
        )}
      </Card>

      {rabResult && (
        <RabResultTable
          rab={rabResult}
          onHsp={handleHsp}
          hspBusy={busy.hsp}
          onExportCsv={handleExportCsv}
          onExportPdf={handleExportPdf}
        />
      )}
      {scurveResult && <ScurvePanel scurve={scurveResult} />}

      {hspModal && (
        <Modal open onClose={() => setHspModal(null)} title={`Rincian HSP — ${hspModal.data.name}`} width={760}>
          <HspBreakdownBody data={hspModal.data} />
        </Modal>
      )}
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  width: 34, height: 34, borderRadius: 9, border: '1px solid var(--border)',
  background: 'var(--surface)', color: 'var(--text2)', display: 'flex',
  alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
};

function ErrorBox({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 14px', borderRadius: 12, background: 'var(--dng-bg, var(--warn-bg))', border: '1px solid var(--dng-bd, var(--warn-bd))' }}>
      <AlertCircle size={16} color="var(--dng-dot)" style={{ marginTop: 1, flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text)' }}>{message}</span>
      <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 12 }}>Tutup</button>
    </div>
  );
}

function RabResultTable({
  rab,
  onHsp,
  hspBusy,
  onExportCsv,
  onExportPdf,
}: {
  rab: RABResult;
  onHsp: (code: string) => void;
  hspBusy: string | null;
  onExportCsv: () => void;
  onExportPdf: () => void;
}) {
  const th: React.CSSProperties = { padding: '11px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text2)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '11px 14px', borderBottom: '1px solid var(--border-soft)' };
  return (
    <Card padding={18}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Rencana Anggaran Biaya — {rab.region}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>Dihitung engine deterministik · PPN {formatPercent(rab.ppn_rate * 100)}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" onClick={onExportCsv}><FileSpreadsheet size={15} /> Excel</Button>
          <Button variant="secondary" onClick={onExportPdf}><Printer size={15} /> PDF</Button>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }}>No</th>
              <th style={{ ...th, textAlign: 'left' }}>Uraian Pekerjaan</th>
              <th style={{ ...th, textAlign: 'right' }}>Volume</th>
              <th style={{ ...th, textAlign: 'left' }}>Sat.</th>
              <th style={{ ...th, textAlign: 'right' }}>HSP (Rp)</th>
              <th style={{ ...th, textAlign: 'right' }}>Jumlah (Rp)</th>
              <th style={{ ...th, textAlign: 'right' }}>Bobot</th>
              <th style={th} />
            </tr>
          </thead>
          <tbody>
            {rab.lines.map((ln, i) => (
              <tr key={ln.ahsp_code} className="pax-row-hover">
                <td className="pax-mono" style={{ ...td, color: 'var(--text3)' }}>{i + 1}</td>
                <td style={{ ...td, color: 'var(--text)' }}>
                  <div style={{ fontWeight: 600 }}>{ln.name}</div>
                  <div className="pax-mono" style={{ fontSize: 11, color: 'var(--text3)' }}>{ln.ahsp_code}</div>
                </td>
                <td className="pax-mono" style={{ ...td, textAlign: 'right', color: 'var(--text)' }}>{formatNumber(ln.volume)}</td>
                <td style={{ ...td, color: 'var(--text2)' }}>{ln.unit}</td>
                <td className="pax-mono" style={{ ...td, textAlign: 'right', color: 'var(--text)' }}>{formatRupiah(ln.hsp)}</td>
                <td className="pax-mono" style={{ ...td, textAlign: 'right', fontWeight: 600, color: 'var(--text)' }}>{formatRupiah(ln.amount)}</td>
                <td className="pax-mono" style={{ ...td, textAlign: 'right', color: 'var(--text2)' }}>{formatPercent(ln.weight_pct)}</td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <button onClick={() => onHsp(ln.ahsp_code)} disabled={hspBusy === ln.ahsp_code} title="Rincian HSP" style={{ ...iconBtn, width: 30, height: 30 }}>
                    {hspBusy === ln.ahsp_code ? <Loader2 size={14} className="animate-spin" /> : <Receipt size={14} />}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 600, color: 'var(--text2)' }}>Subtotal</td>
              <td className="pax-mono" style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 600, color: 'var(--text)' }}>{formatRupiah(rab.subtotal)}</td>
              <td colSpan={2} />
            </tr>
            <tr>
              <td colSpan={5} style={{ padding: '4px 14px', textAlign: 'right', color: 'var(--text2)' }}>PPN {formatPercent(rab.ppn_rate * 100)}</td>
              <td className="pax-mono" style={{ padding: '4px 14px', textAlign: 'right', color: 'var(--text)' }}>{formatRupiah(rab.ppn)}</td>
              <td colSpan={2} />
            </tr>
            <tr>
              <td colSpan={5} style={{ padding: '11px 14px', textAlign: 'right', fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>RAB Total</td>
              <td className="pax-mono" style={{ padding: '11px 14px', textAlign: 'right', fontSize: 15, fontWeight: 800, color: 'var(--ok-dot)' }}>{formatRupiah(rab.total)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}

function ScurvePanel({ scurve }: { scurve: SCurveResult }) {
  const th: React.CSSProperties = { padding: '9px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text2)', borderBottom: '1px solid var(--border)' };
  const td: React.CSSProperties = { padding: '9px 14px', borderBottom: '1px solid var(--border-soft)' };
  return (
    <Card padding={18}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Kurva S — Rencana Progres</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--text3)' }}>
          <StatusPill tone="neutral">{scurve.mode}</StatusPill>
          <span>{scurve.total_days} hari · {scurve.points.length} periode</span>
        </div>
      </div>
      <SCurveChart points={scurve.points} periodDays={scurve.period_days} />
      <div style={{ overflowX: 'auto', marginTop: 14 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }}>Periode</th>
              <th style={{ ...th, textAlign: 'left' }}>Hari</th>
              <th style={{ ...th, textAlign: 'right' }}>Bobot Periode</th>
              <th style={{ ...th, textAlign: 'right' }}>Kumulatif</th>
            </tr>
          </thead>
          <tbody>
            {scurve.points.map((p) => (
              <tr key={p.period} className="pax-row-hover">
                <td style={{ ...td, color: 'var(--text)' }}>Minggu {p.period}</td>
                <td style={{ ...td, color: 'var(--text2)' }}>{p.day_start}–{p.day_end}</td>
                <td className="pax-mono" style={{ ...td, textAlign: 'right', color: 'var(--text)' }}>{formatPercent(p.planned_pct)}</td>
                <td className="pax-mono" style={{ ...td, textAlign: 'right', fontWeight: 600, color: 'var(--text)' }}>{formatPercent(p.cumulative_pct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

