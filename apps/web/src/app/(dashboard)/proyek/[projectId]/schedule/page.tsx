'use client';

/**
 * PAAX v0.7+ — Scenario Simulator (what-if waktu-biaya).
 *
 * ATURAN EMAS: setiap titik pada grafik waktu-biaya & setiap angka di tabel
 * adalah hasil engine deterministik (POST /scenario/simulate). Frontend hanya
 * mengirim input (item, volume, jumlah pekerja, parameter) & menampilkan output.
 * Tidak ada simulasi/perhitungan di browser.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, AlertCircle, Play, Zap, Clock, Wallet, Users } from 'lucide-react';
import type { ScenarioResult } from '@paax/schemas';
import { Card, Button, StatusPill, EmptyState } from '@/components/ui';
import { useProjects } from '@/lib/projects/projects-context';
import { rabRepository } from '@/lib/projects/rab-repository';
import {
  fetchAHSPList,
  simulateScenario,
  type ScenarioLine,
  type ScenarioParams,
  type ScheduleMode,
} from '@/lib/engine';
import { formatRupiah, formatNumber } from '@/lib/format';

interface Row {
  ahsp_code: string;
  name: string;
  volume: number;
  workers: number;
}

const candidateTone: Record<string, 'ok' | 'warn' | 'dng' | 'neutral'> = {
  baseline: 'neutral',
  tambah_crew: 'ok',
  lembur: 'warn',
  paralel: 'ok',
};

export default function ProjectSchedulePage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { getProject, loading: projectsLoading } = useProjects();
  const project = getProject(projectId);

  const [rows, setRows] = useState<Row[]>([]);
  const [regionCode, setRegionCode] = useState('jateng');
  const [ppnRate, setPpnRate] = useState(0.11);
  const [cfg, setCfg] = useState<Required<ScenarioParams>>({
    base_mode: 'sequential',
    crew_factor: 2,
    overtime_speedup: 1.25,
    overtime_cost_factor: 1.4,
  });
  const [result, setResult] = useState<ScenarioResult | null>(null);
  const [bootLoading, setBootLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSimulate = useCallback(
    async (simRows: Row[], region: string, ppn: number, config: ScenarioParams) => {
      const lines: ScenarioLine[] = simRows.map((r) => ({
        ahsp_code: r.ahsp_code,
        volume: r.volume,
        workers: r.workers,
      }));
      setResult(await simulateScenario(lines, region, ppn, config));
    },
    [],
  );

  useEffect(() => {
    let active = true;
    (async () => {
      setBootLoading(true);
      setError(null);
      try {
        const [draft, ahsp] = await Promise.all([rabRepository.get(projectId), fetchAHSPList()]);
        if (!active) return;
        const nameOf = new Map(ahsp.map((a) => [a.code, a.name]));
        const built: Row[] = draft.lines
          .filter((l) => l.ahsp_code && l.volume && l.volume > 0)
          .map((l) => ({
            ahsp_code: l.ahsp_code,
            name: nameOf.get(l.ahsp_code) ?? l.ahsp_code,
            volume: l.volume as number,
            workers: 4,
          }));
        setRows(built);
        setRegionCode(draft.regionCode);
        setPpnRate(draft.ppnRate);
        if (built.length) {
          await runSimulate(built, draft.regionCode, draft.ppnRate, {
            base_mode: 'sequential', crew_factor: 2, overtime_speedup: 1.25, overtime_cost_factor: 1.4,
          });
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Gagal memuat data skenario.');
      } finally {
        if (active) setBootLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [projectId, runSimulate]);

  const setWorkers = (i: number, workers: number) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, workers: Math.max(1, workers) } : r)));

  const handleSimulate = async () => {
    setError(null);
    setBusy(true);
    try {
      await runSimulate(rows, regionCode, ppnRate, cfg);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menjalankan simulasi.');
    } finally {
      setBusy(false);
    }
  };

  if (projectsLoading) return <EmptyState title="Memuat proyek..." />;
  if (!project) return <EmptyState title="Proyek tidak ditemukan" message="Buka daftar proyek untuk memilih proyek." />;

  if (!bootLoading && rows.length === 0) {
    return (
      <Card padding={18}>
        <EmptyState
          title="Belum ada item RAB untuk disimulasikan"
          message="Simulasi skenario memakai item & volume dari RAB proyek. Isi RAB dulu."
        />
        <Link href={`/proyek/${projectId}/rab`} style={{ color: 'var(--text)', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
          Ke editor RAB →
        </Link>
      </Card>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <StatusPill tone="ok"><Zap size={12} /> Simulator deterministik</StatusPill>
        <span style={{ fontSize: 12, color: 'var(--text3)' }}>
          Frontier waktu-biaya — tiap titik dihitung engine dari produktivitas AHSP. Bukan tebakan.
        </span>
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderRadius: 12, background: 'var(--warn-bg)', border: '1px solid var(--warn-bd)' }}>
          <AlertCircle size={16} color="var(--warn-fg)" style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 12.5, color: 'var(--warn-fg)' }}>{error}</span>
          <button onClick={() => setError(null)} style={{ background: 'transparent', border: 'none', color: 'var(--warn-fg)', cursor: 'pointer', fontSize: 12 }}>Tutup</button>
        </div>
      )}

      {/* Parameter + crew */}
      <Card padding={18}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Parameter Simulasi</div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            {(['sequential', 'parallel'] as ScheduleMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setCfg((c) => ({ ...c, base_mode: m }))}
                style={{ padding: '6px 12px', borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: 'pointer', color: cfg.base_mode === m ? 'var(--accent-ink)' : 'var(--text2)', background: cfg.base_mode === m ? 'var(--accent)' : 'var(--surface)', border: '1px solid var(--border)' }}
              >
                {m === 'sequential' ? 'Berurutan' : 'Paralel'}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }} className="pax-grid-3">
          <NumField label="Faktor tambah crew (×)" value={cfg.crew_factor} step={0.5} min={1} onChange={(v) => setCfg((c) => ({ ...c, crew_factor: v }))} />
          <NumField label="Laju lembur (×)" value={cfg.overtime_speedup} step={0.05} min={1} onChange={(v) => setCfg((c) => ({ ...c, overtime_speedup: v }))} />
          <NumField label="Premi biaya lembur (×)" value={cfg.overtime_cost_factor} step={0.1} min={1} onChange={(v) => setCfg((c) => ({ ...c, overtime_cost_factor: v }))} />
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Users size={14} /> Pekerja per item (baseline)
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map((r, i) => (
            <div key={r.ahsp_code + i} style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 10, alignItems: 'center' }}>
              <div style={{ fontSize: 12.5, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.name} <span className="pax-mono" style={{ color: 'var(--text3)' }}>· {formatNumber(r.volume)}</span>
              </div>
              <input
                className="pax-input"
                type="number"
                min={1}
                step={1}
                value={r.workers}
                onChange={(e) => setWorkers(i, Math.trunc(Number(e.target.value)))}
              />
            </div>
          ))}
        </div>

        <div style={{ marginTop: 14 }}>
          <Button onClick={handleSimulate} disabled={busy || bootLoading}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />} Jalankan Simulasi
          </Button>
        </div>
      </Card>

      {result && <TimeCostChart result={result} />}
      {result && <CandidatesTable result={result} />}
      {result && <ItemScheduleTable result={result} />}
    </div>
  );
}

function NumField({ label, value, onChange, step, min }: { label: string; value: number; onChange: (v: number) => void; step: number; min: number }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600 }}>{label}</span>
      <input className="pax-input" type="number" value={value} step={step} min={min} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

/** Grafik waktu-biaya (SVG). Setiap titik = satu skenario hasil engine. */
function TimeCostChart({ result }: { result: ScenarioResult }) {
  const cands = result.candidates;
  const W = 760, H = 320, padL = 78, padR = 24, padT = 20, padB = 44;
  const innerW = W - padL - padR, innerH = H - padT - padB;

  const days = cands.map((c) => c.total_days);
  const costs = cands.map((c) => c.total_cost);
  const dMin = Math.min(...days), dMax = Math.max(...days);
  const cMin = Math.min(...costs), cMax = Math.max(...costs);
  const dPad = (dMax - dMin) * 0.15 || 1;
  const cPad = (cMax - cMin) * 0.15 || 1;
  const x = (d: number) => padL + ((d - (dMin - dPad)) / ((dMax + dPad) - (dMin - dPad))) * innerW;
  const y = (c: number) => padT + innerH - ((c - (cMin - cPad)) / ((cMax + cPad) - (cMin - cPad))) * innerH;

  return (
    <Card padding={18}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>Frontier Waktu–Biaya</div>
      <div style={{ fontSize: 11.5, color: 'var(--text3)', marginBottom: 10 }}>Sumbu X = durasi proyek (hari) · Sumbu Y = total biaya (Rp). Kiri-bawah = lebih cepat & murah.</div>
      <div style={{ overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 540 }} role="img" aria-label="Grafik waktu-biaya skenario">
          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const yy = padT + innerH - t * innerH;
            const cost = (cMin - cPad) + t * ((cMax + cPad) - (cMin - cPad));
            return (
              <g key={t}>
                <line x1={padL} y1={yy} x2={W - padR} y2={yy} stroke="var(--border)" strokeWidth={1} />
                <text x={padL - 8} y={yy + 4} textAnchor="end" fontSize={10} fill="var(--text3)">{formatRupiah(cost)}</text>
              </g>
            );
          })}
          {cands.map((c) => (
            <g key={c.key}>
              <line x1={x(c.total_days)} y1={padT} x2={x(c.total_days)} y2={padT + innerH} stroke="var(--border-soft)" strokeWidth={1} strokeDasharray="3 3" />
              <text x={x(c.total_days)} y={H - padB + 16} textAnchor="middle" fontSize={10} fill="var(--text3)">{formatNumber(c.total_days)}h</text>
            </g>
          ))}
          {cands.map((c) => {
            const isBase = c.key === 'baseline';
            return (
              <g key={c.key}>
                <circle cx={x(c.total_days)} cy={y(c.total_cost)} r={isBase ? 7 : 6} fill={isBase ? 'var(--text)' : 'var(--accent)'} stroke="var(--bg)" strokeWidth={2}>
                  <title>{c.label}: {formatNumber(c.total_days)} hari · {formatRupiah(c.total_cost)}</title>
                </circle>
                <text x={x(c.total_days)} y={y(c.total_cost) - 12} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="var(--text2)">{c.label}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </Card>
  );
}

function CandidatesTable({ result }: { result: ScenarioResult }) {
  const th: React.CSSProperties = { padding: '10px 12px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text2)', borderBottom: '1px solid var(--border)' };
  const td: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--border-soft)' };
  const delta = (v: number, suffix = '') => {
    if (v === 0) return <span style={{ color: 'var(--text3)' }}>—</span>;
    const good = v < 0;
    return <span style={{ color: good ? 'var(--ok-dot)' : 'var(--warn-fg)' }}>{v > 0 ? '+' : ''}{formatNumber(v)}{suffix}</span>;
  };
  return (
    <Card padding={18}>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
        <Metric icon={<Clock size={14} />} label="Baseline durasi" value={`${formatNumber(result.baseline_total_days)} hari`} />
        <Metric icon={<Wallet size={14} />} label="Baseline biaya" value={formatRupiah(result.baseline_total_cost)} />
        <Metric icon={<Users size={14} />} label="Porsi tenaga" value={formatRupiah(result.baseline_labor_cost)} />
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }}>Skenario</th>
              <th style={{ ...th, textAlign: 'right' }}>Durasi (hari)</th>
              <th style={{ ...th, textAlign: 'right' }}>Δ Hari</th>
              <th style={{ ...th, textAlign: 'right' }}>Total Biaya</th>
              <th style={{ ...th, textAlign: 'right' }}>Δ Biaya</th>
              <th style={{ ...th, textAlign: 'left' }}>Catatan</th>
            </tr>
          </thead>
          <tbody>
            {result.candidates.map((c) => (
              <tr key={c.key} className="pax-row-hover">
                <td style={{ ...td }}><StatusPill tone={candidateTone[c.key] ?? 'neutral'}>{c.label}</StatusPill></td>
                <td className="pax-mono" style={{ ...td, textAlign: 'right', color: 'var(--text)', fontWeight: 600 }}>{formatNumber(c.total_days)}</td>
                <td className="pax-mono" style={{ ...td, textAlign: 'right' }}>{delta(c.delta_days)}</td>
                <td className="pax-mono" style={{ ...td, textAlign: 'right', color: 'var(--text)' }}>{formatRupiah(c.total_cost)}</td>
                <td className="pax-mono" style={{ ...td, textAlign: 'right' }}>{c.delta_cost === 0 ? <span style={{ color: 'var(--text3)' }}>—</span> : <span style={{ color: c.delta_cost < 0 ? 'var(--ok-dot)' : 'var(--warn-fg)' }}>{c.delta_cost > 0 ? '+' : ''}{formatRupiah(c.delta_cost)}</span>}</td>
                <td style={{ ...td, color: 'var(--text2)', fontSize: 12 }}>{c.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ItemScheduleTable({ result }: { result: ScenarioResult }) {
  const th: React.CSSProperties = { padding: '10px 12px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text2)', borderBottom: '1px solid var(--border)' };
  const td: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--border-soft)' };
  return (
    <Card padding={18}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>Durasi per Item (dari produktivitas AHSP)</div>
      <div style={{ fontSize: 11.5, color: 'var(--text3)', marginBottom: 12 }}>mandays = volume × Σ koef upah (OH) · durasi = mandays ÷ pekerja</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }}>Uraian</th>
              <th style={{ ...th, textAlign: 'right' }}>Volume</th>
              <th style={{ ...th, textAlign: 'right' }}>OH/sat</th>
              <th style={{ ...th, textAlign: 'right' }}>Mandays</th>
              <th style={{ ...th, textAlign: 'right' }}>Pekerja</th>
              <th style={{ ...th, textAlign: 'right' }}>Durasi (hari)</th>
            </tr>
          </thead>
          <tbody>
            {result.items.map((it) => (
              <tr key={it.ahsp_code} className="pax-row-hover">
                <td style={{ ...td, color: 'var(--text)' }}>{it.name} <span className="pax-mono" style={{ color: 'var(--text3)', fontSize: 11 }}>[{it.unit}]</span></td>
                <td className="pax-mono" style={{ ...td, textAlign: 'right', color: 'var(--text)' }}>{formatNumber(it.volume)}</td>
                <td className="pax-mono" style={{ ...td, textAlign: 'right', color: 'var(--text2)' }}>{formatNumber(it.labor_oh_per_unit, 4)}</td>
                <td className="pax-mono" style={{ ...td, textAlign: 'right', color: 'var(--text)' }}>{formatNumber(it.mandays)}</td>
                <td className="pax-mono" style={{ ...td, textAlign: 'right', color: 'var(--text2)' }}>{it.workers}</td>
                <td className="pax-mono" style={{ ...td, textAlign: 'right', color: 'var(--text)', fontWeight: 600 }}>{formatNumber(it.duration_days)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <span style={{ color: 'var(--text3)' }}>{icon}</span>
      <div>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text3)' }}>{label}</div>
        <div className="pax-mono" style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{value}</div>
      </div>
    </div>
  );
}
