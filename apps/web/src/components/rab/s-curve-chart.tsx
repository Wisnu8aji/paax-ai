'use client';

import type { SCurveResult } from '@paax/schemas';

/**
 * Grafik area Kurva S kumulatif (SVG, tanpa dependency).
 *
 * Hanya MEMETAKAN nilai cumulative_pct (dari engine) ke koordinat piksel —
 * ini rendering, bukan menghitung ulang angka RAB/Kurva S.
 */
export function SCurveChart({
  points,
  periodDays,
}: {
  points: SCurveResult['points'];
  periodDays: number;
}) {
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
    <div style={{ overflowX: 'auto' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', minWidth: 520 }}
        role="img"
        aria-label="Grafik Kurva S kumulatif"
      >
        <defs>
          <linearGradient id="paaxScurveFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {gridY.map((g) => (
          <g key={g}>
            <line x1={padL} y1={y(g)} x2={W - padR} y2={y(g)} stroke="var(--border)" strokeWidth={1} />
            <text x={padL - 8} y={y(g) + 4} textAnchor="end" fontSize={11} fill="var(--text3)">
              {g}%
            </text>
          </g>
        ))}

        {areaPath && <path d={areaPath} fill="url(#paaxScurveFill)" />}
        {linePath && <path d={linePath} fill="none" stroke="#6366f1" strokeWidth={2.5} />}

        {points.map((p, i) => (
          <g key={p.period}>
            <circle cx={x(i)} cy={y(p.cumulative_pct)} r={4} fill="#818cf8" stroke="var(--bg)" strokeWidth={1.5}>
              <title>
                Minggu {p.period} (hari {p.day_start}-{p.day_end}){'\n'}
                Bobot periode: {p.planned_pct}%{'\n'}
                Kumulatif: {p.cumulative_pct}%
              </title>
            </circle>
            <text x={x(i)} y={H - padB + 18} textAnchor="middle" fontSize={11} fill="var(--text3)">
              M{p.period}
            </text>
          </g>
        ))}

        <text x={padL} y={H - 6} fontSize={10} fill="var(--text3)">
          Periode = {periodDays} hari
        </text>
      </svg>
    </div>
  );
}
