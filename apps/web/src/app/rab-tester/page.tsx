'use client';

/**
 * PAAX v0.6 — Halaman Uji RAB Manual.
 *
 * ATURAN KERAS: TIDAK ADA kalkulasi angka di halaman ini. Semua nilai (HSP, jumlah,
 * bobot, subtotal, PPN, total, Kurva S) datang dari Core Engine via @/lib/engine dan
 * sudah divalidasi dengan tipe @paax/schemas. Halaman hanya menampilkan & memformat.
 * Satu-satunya "perhitungan" di sini adalah geometri SVG untuk menggambar grafik
 * (memetakan cumulative_pct → piksel) — itu rendering, bukan menghitung ulang angka RAB.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Plus,
  Trash2,
  Calculator,
  LineChart,
  Receipt,
  Loader2,
  AlertCircle,
  X,
  ArrowLeft,
  Building2,
} from 'lucide-react';
import type { HSPBreakdown, RABResult, SCurveResult } from '@paax/schemas';
import {
  fetchAHSPList,
  calculateRAB,
  getHSPDetail,
  getSCurve,
  type AHSPListItem,
  type EngineLine,
  type ScheduleMode,
} from '@/lib/engine';
import { formatRupiah, formatNumber, formatPercent } from '@/lib/format';

const REGION_CODE = 'jateng';
const REGION_NAME = 'Jawa Tengah';
const PPN_RATE = 0.11;

interface Row {
  id: string;
  ahsp_code: string;
  volume: string;
  duration_days: string;
}

const emptyRow = (): Row => ({
  id: crypto.randomUUID(),
  ahsp_code: '',
  volume: '',
  duration_days: '',
});

const categoryBadge: Record<string, string> = {
  bahan: 'badge badge-blue',
  upah: 'badge badge-amber',
  alat: 'badge badge-purple',
};

export default function RabTesterPage() {
  const [ahspList, setAhspList] = useState<AHSPListItem[]>([]);
  const [ahspLoading, setAhspLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [rabResult, setRabResult] = useState<RABResult | null>(null);
  const [scurveResult, setScurveResult] = useState<SCurveResult | null>(null);
  const [mode, setMode] = useState<ScheduleMode>('sequential');
  const [hspModal, setHspModal] = useState<{ code: string; data: HSPBreakdown } | null>(null);
  const [loading, setLoading] = useState<{ rab: boolean; scurve: boolean; hsp: string | null }>({
    rab: false,
    scurve: false,
    hsp: null,
  });
  const [error, setError] = useState<string | null>(null);

  // Load daftar AHSP saat mount (GET /ahsp)
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const list = await fetchAHSPList();
        if (active) setAhspList(list);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Gagal memuat daftar AHSP.');
      } finally {
        if (active) setAhspLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // ── Row management ─────────────────────────────────────────────────────────
  const addRow = () => setRows((r) => [...r, emptyRow()]);
  const removeRow = (id: string) =>
    setRows((r) => (r.length <= 1 ? r : r.filter((row) => row.id !== id)));
  const updateRow = (id: string, patch: Partial<Row>) =>
    setRows((r) => r.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  // Validasi input (bukan perhitungan angka RAB) → daftar baris siap kirim ke engine
  const validLines = useMemo<EngineLine[] | null>(() => {
    const lines: EngineLine[] = [];
    for (const row of rows) {
      const volume = Number(row.volume);
      if (!row.ahsp_code || !row.volume || Number.isNaN(volume) || volume <= 0) return null;
      const duration = Number(row.duration_days);
      lines.push({
        ahsp_code: row.ahsp_code,
        volume,
        duration_days:
          row.duration_days && !Number.isNaN(duration) && duration > 0 ? Math.trunc(duration) : undefined,
      });
    }
    return lines;
  }, [rows]);

  const allHaveDuration = rows.every((r) => {
    const d = Number(r.duration_days);
    return r.duration_days !== '' && !Number.isNaN(d) && d > 0;
  });
  const canSCurve = validLines !== null && allHaveDuration;

  // ── Actions (semua angka dari engine) ──────────────────────────────────────
  const handleCalculate = async () => {
    if (!validLines) {
      setError('Setiap baris harus punya item AHSP dan volume > 0.');
      return;
    }
    setError(null);
    setLoading((l) => ({ ...l, rab: true }));
    try {
      const result = await calculateRAB(validLines, REGION_CODE, PPN_RATE);
      setRabResult(result);
      setScurveResult(null); // reset Kurva S; minta hitung ulang setelah RAB berubah
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menghitung RAB.');
    } finally {
      setLoading((l) => ({ ...l, rab: false }));
    }
  };

  const handleSCurve = async () => {
    if (!validLines || !allHaveDuration) {
      setError('Untuk Kurva S, semua baris harus mengisi durasi (hari) > 0.');
      return;
    }
    setError(null);
    setLoading((l) => ({ ...l, scurve: true }));
    try {
      const result = await getSCurve(validLines, REGION_CODE, 7, mode);
      setScurveResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal membangun Kurva S.');
    } finally {
      setLoading((l) => ({ ...l, scurve: false }));
    }
  };

  const handleHsp = async (code: string) => {
    setError(null);
    setLoading((l) => ({ ...l, hsp: code }));
    try {
      const data = await getHSPDetail(code, REGION_CODE);
      setHspModal({ code, data });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat rincian HSP.');
    } finally {
      setLoading((l) => ({ ...l, hsp: null }));
    }
  };

  return (
    <div className="min-h-screen px-6 py-8 md:px-10">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-[13px] text-paax-text-muted hover:text-paax-text-secondary transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Kembali ke Dashboard
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Building2 className="h-6 w-6 text-indigo-400" /> PAAX — Uji RAB Manual
          </h1>
          <p className="text-[14px] text-paax-text-secondary">
            Pilih item AHSP, isi volume dan durasi, lalu hitung RAB &amp; Kurva S.{' '}
            <span className="text-paax-text-muted">
              Semua angka dihitung oleh engine deterministik — bukan di browser.
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="badge badge-slate">Wilayah: {REGION_NAME}</span>
            <span className="badge badge-slate">PPN: {formatPercent(PPN_RATE * 100)}</span>
            <span className="badge badge-green">Engine deterministik</span>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="glass-card flex items-start gap-3 border-paax-red/30 bg-paax-red/10 p-4 text-[13px]">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-paax-red" />
            <span className="flex-1 text-paax-text">{error}</span>
            <button onClick={() => setError(null)} className="text-paax-text-muted hover:text-paax-text">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Input rows */}
        <div className="glass-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">Daftar Item Pekerjaan</h2>
            <span className="text-[12px] text-paax-text-muted">
              {ahspLoading ? 'Memuat AHSP…' : `${ahspList.length} item AHSP tersedia`}
            </span>
          </div>

          <div className="space-y-3">
            {/* Column headers */}
            <div className="hidden grid-cols-[1fr_120px_120px_auto] gap-3 px-1 text-[11px] font-semibold uppercase tracking-wider text-paax-text-muted md:grid">
              <span>Item AHSP</span>
              <span>Volume</span>
              <span>Durasi (hari)</span>
              <span className="text-right">Aksi</span>
            </div>

            {rows.map((row) => {
              const selected = ahspList.find((a) => a.code === row.ahsp_code);
              return (
                <div
                  key={row.id}
                  className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_120px_120px_auto] md:items-center"
                >
                  <select
                    className="input-field"
                    value={row.ahsp_code}
                    disabled={ahspLoading}
                    onChange={(e) => updateRow(row.id, { ahsp_code: e.target.value })}
                  >
                    <option value="">— pilih item AHSP —</option>
                    {ahspList.map((a) => (
                      <option key={a.code} value={a.code}>
                        {a.code} — {a.name} [{a.unit}]
                      </option>
                    ))}
                  </select>

                  <input
                    type="number"
                    min={0}
                    step="any"
                    placeholder={selected ? `Volume (${selected.unit})` : 'Volume'}
                    className="input-field"
                    value={row.volume}
                    onChange={(e) => updateRow(row.id, { volume: e.target.value })}
                  />

                  <input
                    type="number"
                    min={0}
                    step={1}
                    placeholder="opsional"
                    className="input-field"
                    value={row.duration_days}
                    onChange={(e) => updateRow(row.id, { duration_days: e.target.value })}
                  />

                  <div className="flex items-center justify-end gap-2">
                    <button
                      className="btn-secondary !px-3"
                      disabled={!row.ahsp_code || loading.hsp === row.ahsp_code}
                      onClick={() => handleHsp(row.ahsp_code)}
                      title="Rincian HSP"
                    >
                      {loading.hsp === row.ahsp_code ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Receipt className="h-4 w-4" />
                      )}
                      <span className="hidden lg:inline">HSP</span>
                    </button>
                    <button
                      className="btn-secondary !px-3 disabled:opacity-40"
                      disabled={rows.length <= 1}
                      onClick={() => removeRow(row.id)}
                      title="Hapus baris"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button className="btn-secondary" onClick={addRow}>
              <Plus className="h-4 w-4" /> Tambah Item
            </button>
            <button className="btn-primary" onClick={handleCalculate} disabled={loading.rab || !validLines}>
              {loading.rab ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
              Hitung RAB
            </button>
            <div className="ml-auto flex items-center gap-2">
              <select
                className="input-field !w-auto"
                value={mode}
                onChange={(e) => setMode(e.target.value as ScheduleMode)}
                title="Mode penjadwalan"
              >
                <option value="sequential">Sequential</option>
                <option value="parallel">Parallel</option>
              </select>
              <button
                className="btn-secondary"
                onClick={handleSCurve}
                disabled={loading.scurve || !canSCurve}
                title={canSCurve ? 'Bangun Kurva S' : 'Isi durasi semua baris untuk Kurva S'}
              >
                {loading.scurve ? <Loader2 className="h-4 w-4 animate-spin" /> : <LineChart className="h-4 w-4" />}
                Lihat Kurva S
              </button>
            </div>
          </div>
        </div>

        {/* RAB result */}
        {rabResult && <RABTable rab={rabResult} />}

        {/* Kurva S */}
        {scurveResult && <SCurveSection scurve={scurveResult} />}
      </div>

      {/* HSP modal */}
      {hspModal && <HSPModal code={hspModal.code} data={hspModal.data} onClose={() => setHspModal(null)} />}
    </div>
  );
}

// ── RAB table (semua angka dari rab) ──────────────────────────────────────────
function RABTable({ rab }: { rab: RABResult }) {
  return (
    <div className="glass-card p-5">
      <h2 className="mb-4 text-[15px] font-semibold">
        Rencana Anggaran Biaya — {rab.region}
      </h2>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>No</th>
              <th>Uraian Pekerjaan</th>
              <th className="text-right">Volume</th>
              <th>Satuan</th>
              <th className="text-right">HSP (Rp)</th>
              <th className="text-right">Jumlah (Rp)</th>
              <th className="text-right">Bobot</th>
            </tr>
          </thead>
          <tbody>
            {rab.lines.map((ln, i) => (
              <tr key={ln.ahsp_code}>
                <td className="text-paax-text-muted">{i + 1}</td>
                <td>
                  <div className="font-medium">{ln.name}</div>
                  <div className="text-[11px] text-paax-text-muted">{ln.ahsp_code}</div>
                </td>
                <td className="text-right tabular-nums">{formatNumber(ln.volume)}</td>
                <td>{ln.unit}</td>
                <td className="text-right tabular-nums">{formatRupiah(ln.hsp)}</td>
                <td className="text-right font-medium tabular-nums">{formatRupiah(ln.amount)}</td>
                <td className="text-right tabular-nums">{formatPercent(ln.weight_pct)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} className="text-right font-semibold text-paax-text-secondary">
                Subtotal
              </td>
              <td className="text-right font-semibold tabular-nums">{formatRupiah(rab.subtotal)}</td>
              <td />
            </tr>
            <tr>
              <td colSpan={5} className="text-right text-paax-text-secondary">
                PPN {formatPercent(rab.ppn_rate * 100)}
              </td>
              <td className="text-right tabular-nums">{formatRupiah(rab.ppn)}</td>
              <td />
            </tr>
            <tr>
              <td colSpan={5} className="text-right text-[15px] font-bold">
                RAB Total
              </td>
              <td className="text-right text-[15px] font-bold text-paax-green tabular-nums">
                {formatRupiah(rab.total)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ── Kurva S (chart + tabel) ───────────────────────────────────────────────────
function SCurveSection({ scurve }: { scurve: SCurveResult }) {
  return (
    <div className="glass-card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold">Kurva S — Rencana Progres</h2>
        <div className="flex items-center gap-2 text-[12px] text-paax-text-muted">
          <span className="badge badge-slate">{scurve.mode}</span>
          <span>{scurve.total_days} hari</span>
          <span>•</span>
          <span>{scurve.points.length} periode</span>
        </div>
      </div>

      <SCurveChart points={scurve.points} periodDays={scurve.period_days} />

      <div className="table-container mt-5">
        <table>
          <thead>
            <tr>
              <th>Periode</th>
              <th>Hari</th>
              <th className="text-right">Bobot Periode</th>
              <th className="text-right">Kumulatif</th>
            </tr>
          </thead>
          <tbody>
            {scurve.points.map((p) => (
              <tr key={p.period}>
                <td>Minggu {p.period}</td>
                <td className="text-paax-text-secondary">
                  {p.day_start}–{p.day_end}
                </td>
                <td className="text-right tabular-nums">{formatPercent(p.planned_pct)}</td>
                <td className="text-right font-medium tabular-nums">{formatPercent(p.cumulative_pct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Inline SVG area chart untuk Kurva S kumulatif. Tanpa dependency.
 * Hanya memetakan nilai cumulative_pct (dari engine) ke koordinat piksel (rendering).
 */
function SCurveChart({ points, periodDays }: { points: SCurveResult['points']; periodDays: number }) {
  const W = 760;
  const H = 280;
  const padL = 46;
  const padR = 18;
  const padT = 18;
  const padB = 40;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = points.length;

  const x = (i: number) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (pct: number) => padT + innerH - (Math.max(0, Math.min(100, pct)) / 100) * innerH;

  const linePts = points.map((p, i) => `${x(i)},${y(p.cumulative_pct)}`);
  const linePath = linePts.length ? `M ${linePts.join(' L ')}` : '';
  const areaPath = linePts.length
    ? `M ${x(0)},${y(0)} L ${linePts.join(' L ')} L ${x(n - 1)},${y(0)} Z`
    : '';
  const gridY = [0, 25, 50, 75, 100];

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[520px]" role="img" aria-label="Grafik Kurva S kumulatif">
        <defs>
          <linearGradient id="scurveFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Gridlines + Y labels */}
        {gridY.map((g) => (
          <g key={g}>
            <line
              x1={padL}
              y1={y(g)}
              x2={W - padR}
              y2={y(g)}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth={1}
            />
            <text x={padL - 8} y={y(g) + 4} textAnchor="end" fontSize={11} fill="#64748b">
              {g}%
            </text>
          </g>
        ))}

        {/* Area + line */}
        {areaPath && <path d={areaPath} fill="url(#scurveFill)" />}
        {linePath && <path d={linePath} fill="none" stroke="#6366f1" strokeWidth={2.5} />}

        {/* Points + X labels + native tooltip */}
        {points.map((p, i) => (
          <g key={p.period}>
            <circle cx={x(i)} cy={y(p.cumulative_pct)} r={4} fill="#818cf8" stroke="#0a0f1e" strokeWidth={1.5}>
              <title>
                Minggu {p.period} (hari {p.day_start}–{p.day_end}){'\n'}
                Bobot periode: {p.planned_pct}%{'\n'}
                Kumulatif: {p.cumulative_pct}%
              </title>
            </circle>
            <text x={x(i)} y={H - padB + 18} textAnchor="middle" fontSize={11} fill="#94a3b8">
              M{p.period}
            </text>
          </g>
        ))}

        <text x={padL} y={H - 6} fontSize={10} fill="#64748b">
          Periode = {periodDays} hari
        </text>
      </svg>
    </div>
  );
}

// ── HSP modal (rincian auditable, semua angka dari engine) ────────────────────
function HSPModal({ code, data, onClose }: { code: string; data: HSPBreakdown; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass-card max-h-[88vh] w-full max-w-3xl overflow-y-auto bg-paax-surface p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-[16px] font-semibold">{data.name}</h3>
            <p className="text-[12px] text-paax-text-muted">
              {code} • per {data.unit}
            </p>
          </div>
          <button onClick={onClose} className="text-paax-text-muted hover:text-paax-text">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Kode</th>
                <th>Resource</th>
                <th>Kategori</th>
                <th className="text-right">Koefisien</th>
                <th className="text-right">Harga Satuan</th>
                <th className="text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {data.components.map((c) => (
                <tr key={c.resource_code}>
                  <td className="text-paax-text-muted">{c.resource_code}</td>
                  <td>
                    {c.resource_name} <span className="text-paax-text-muted">[{c.unit}]</span>
                  </td>
                  <td>
                    <span className={categoryBadge[c.category] ?? 'badge badge-slate'}>{c.category}</span>
                  </td>
                  <td className="text-right tabular-nums">{formatNumber(c.coefficient, 4)}</td>
                  <td className="text-right tabular-nums">{formatRupiah(c.unit_price)}</td>
                  <td className="text-right tabular-nums">{formatRupiah(c.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Bahan (A)" value={formatRupiah(data.bahan)} />
          <Stat label="Upah (B)" value={formatRupiah(data.upah)} />
          <Stat label="Alat (C)" value={formatRupiah(data.alat)} />
          <Stat label="Base (A+B+C)" value={formatRupiah(data.base)} />
          <Stat
            label={`Overhead & Profit (${formatPercent(data.overhead_profit * 100)})`}
            value={formatRupiah(data.overhead_profit_value)}
          />
          <Stat label={`HSP / ${data.unit}`} value={formatRupiah(data.hsp)} highlight />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg border border-paax-border bg-white/[0.03] p-3">
      <div className="text-[11px] uppercase tracking-wider text-paax-text-muted">{label}</div>
      <div className={`mt-1 text-[15px] font-semibold tabular-nums ${highlight ? 'text-paax-green' : ''}`}>
        {value}
      </div>
    </div>
  );
}
