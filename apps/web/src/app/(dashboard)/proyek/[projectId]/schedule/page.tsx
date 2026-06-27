'use client';

import { useState } from 'react';
import { Info } from 'lucide-react';
import Link from 'next/link';
import { Card, StatusPill, ProgressBar } from '@/components/ui';
import { scheduleTasks, scenarios, sCurve } from '@/lib/mock/workspace';

export default function ProjectSchedulePage() {
  const [scenario, setScenario] = useState('normal');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', borderRadius: 12, background: 'var(--warn-bg)', border: '1px solid var(--warn-bd)' }}>
        <Info size={16} color="var(--warn-fg)" style={{ marginTop: 1, flexShrink: 0 }} />
        <div style={{ fontSize: 12, color: 'var(--warn-fg)', lineHeight: 1.5 }}>
          <strong>Data contoh / placeholder.</strong> Kurva S & durasi di sini hanya tampilan desain.
          Kurva S yang dihitung engine tersedia di{' '}
          <Link href="/rab-tester" style={{ color: 'var(--warn-fg)', fontWeight: 700, textDecoration: 'underline' }}>Uji RAB (v0.6)</Link>.
        </div>
      </div>

      <Card padding={18}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Kurva S — Rencana Progres</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {scenarios.map((s) => (
              <button
                key={s.key}
                onClick={() => setScenario(s.key)}
                title={s.desc}
                style={{ padding: '6px 12px', borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: 'pointer', color: scenario === s.key ? 'var(--accent-ink)' : 'var(--text2)', background: scenario === s.key ? 'var(--accent)' : 'var(--surface)', border: '1px solid var(--border)' }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <SCurveChart />
      </Card>

      <Card padding={18}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>Daftar Pekerjaan (WBS)</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {scheduleTasks.map((t) => (
            <div key={t.wbs} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span className="pax-mono" style={{ width: 22, fontSize: 12, color: 'var(--text3)' }}>{t.wbs}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                  <span style={{ color: 'var(--text)', fontWeight: 600 }}>{t.name}</span>
                  <span className="pax-mono" style={{ color: 'var(--text2)' }}>{t.progress}%</span>
                </div>
                <ProgressBar value={t.progress} />
              </div>
              <span className="pax-mono" style={{ fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{t.start}–{t.end}</span>
              <StatusPill tone="neutral" mono>{t.days}h</StatusPill>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/** Inline SVG area chart — rendering only (maps cumulative % to pixels). */
function SCurveChart() {
  const W = 760, H = 240, padL = 40, padR = 16, padT = 16, padB = 30;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const n = sCurve.length;
  const x = (i: number) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (pct: number) => padT + innerH - (Math.max(0, Math.min(100, pct)) / 100) * innerH;
  const pts = sCurve.map((p, i) => `${x(i)},${y(p.cumulative)}`);
  const line = `M ${pts.join(' L ')}`;
  const area = `M ${x(0)},${y(0)} L ${pts.join(' L ')} L ${x(n - 1)},${y(0)} Z`;

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 480 }} role="img" aria-label="Grafik Kurva S kumulatif (contoh)">
        <defs>
          <linearGradient id="paxSc" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {[0, 25, 50, 75, 100].map((g) => (
          <g key={g}>
            <line x1={padL} y1={y(g)} x2={W - padR} y2={y(g)} stroke="var(--border)" strokeWidth={1} />
            <text x={padL - 6} y={y(g) + 4} textAnchor="end" fontSize={10} fill="var(--text3)">{g}%</text>
          </g>
        ))}
        <path d={area} fill="url(#paxSc)" />
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth={2.4} />
        {sCurve.map((p, i) => (
          <g key={p.week}>
            <circle cx={x(i)} cy={y(p.cumulative)} r={3.5} fill="var(--accent)" />
            <text x={x(i)} y={H - padB + 16} textAnchor="middle" fontSize={10} fill="var(--text3)">M{p.week}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}
