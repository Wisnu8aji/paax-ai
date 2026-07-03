'use client';

import type { ReactNode } from 'react';

/**
 * Chart SVG/CSS tanpa dependency untuk dashboard bisnis.
 *
 * ATURAN EMAS: komponen di file ini HANYA memetakan nilai yang sudah tersimpan
 * (metadata proyek / hasil engine) ke koordinat piksel. Tidak ada perhitungan
 * RAB/HSP/bobot/durasi di sini — murni rendering.
 */

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

/** Donut proporsi (mis. komposisi status proyek) + legend. */
export function DonutChart({
  slices,
  size = 164,
  thickness = 20,
  centerValue,
  centerLabel,
}: {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  centerValue?: ReactNode;
  centerLabel?: string;
}) {
  const total = slices.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  const r = (size - thickness) / 2;
  const C = 2 * Math.PI * r;
  let acc = 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} role="img" aria-label={`Donut: ${slices.map((s) => `${s.label} ${s.value}`).join(', ')}`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={thickness}
            style={{ stroke: 'color-mix(in srgb, var(--text) 8%, transparent)' }}
          />
          {total > 0 &&
            slices
              .filter((s) => s.value > 0)
              .map((s) => {
                const dash = (s.value / total) * C;
                const el = (
                  <circle
                    key={s.label}
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    fill="none"
                    strokeWidth={thickness}
                    strokeDasharray={`${dash} ${C - dash}`}
                    strokeDashoffset={-acc}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                    style={{ stroke: s.color }}
                  >
                    <title>{`${s.label}: ${s.value}`}</title>
                  </circle>
                );
                acc += dash;
                return el;
              })}
        </svg>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            pointerEvents: 'none',
          }}
        >
          <span className="pax-mono" style={{ fontSize: 24, fontWeight: 600, color: 'var(--text)', lineHeight: 1 }}>
            {centerValue}
          </span>
          {centerLabel && (
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text3)' }}>
              {centerLabel}
            </span>
          )}
        </div>
      </div>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 120, flex: 1 }}>
        {slices.map((s) => (
          <li key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 3, background: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: 'var(--text2)', flex: 1 }}>{s.label}</span>
            <span className="pax-mono" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
              {s.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface HBarRow {
  label: string;
  /** 0–100, nilai tersimpan (bukan dihitung di sini) */
  pct: number;
  valueLabel: string;
  color?: string;
}

/** Bar horizontal per baris (mis. progres tersimpan per proyek). */
export function HBarList({ rows }: { rows: HBarRow[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
      {rows.map((row) => (
        <div key={row.label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 5 }}>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--text)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {row.label}
            </span>
            <span className="pax-mono" style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text2)', flexShrink: 0 }}>
              {row.valueLabel}
            </span>
          </div>
          <div
            role="img"
            aria-label={`${row.label}: ${row.valueLabel}`}
            style={{ height: 8, borderRadius: 5, background: 'color-mix(in srgb, var(--text) 8%, transparent)', overflow: 'hidden' }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.max(0, Math.min(100, row.pct))}%`,
                borderRadius: 5,
                background: row.color ?? 'var(--chart-1)',
                transition: 'width .5s cubic-bezier(.22,1,.36,1)',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export interface ColumnDatum {
  label: string;
  /** Nilai tersimpan; null = belum dihitung engine */
  value: number | null;
  valueLabel: string;
  color?: string;
}

/** Kolom vertikal sederhana (mis. nilai draft RAB tersimpan per proyek). */
export function ColumnChart({ data, height = 150 }: { data: ColumnDatum[]; height?: number }) {
  const max = Math.max(...data.map((d) => d.value ?? 0), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, height: height + 46, paddingTop: 4 }}>
      {data.map((d) => {
        const h = d.value === null ? 0 : Math.max(4, (d.value / max) * height);
        return (
          <div key={d.label} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <span className="pax-mono" style={{ fontSize: 10.5, fontWeight: 600, color: d.value === null ? 'var(--text3)' : 'var(--text)' }}>
              {d.valueLabel}
            </span>
            <div
              role="img"
              aria-label={`${d.label}: ${d.valueLabel}`}
              title={`${d.label}: ${d.valueLabel}`}
              style={{
                width: '100%',
                maxWidth: 54,
                height: d.value === null ? 4 : h,
                borderRadius: '7px 7px 3px 3px',
                background: d.value === null ? 'color-mix(in srgb, var(--text) 10%, transparent)' : (d.color ?? 'var(--chart-1)'),
                transition: 'height .5s cubic-bezier(.22,1,.36,1)',
              }}
            />
            <span
              style={{
                fontSize: 10.5,
                color: 'var(--text3)',
                textAlign: 'center',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                width: '100%',
              }}
            >
              {d.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Cincin persentase tunggal (mis. health tersimpan per proyek). */
export function RingGauge({
  pct,
  size = 46,
  thickness = 5,
  color = 'var(--chart-1)',
}: {
  pct: number;
  size?: number;
  thickness?: number;
  color?: string;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  const r = (size - thickness) / 2;
  const C = 2 * Math.PI * r;
  const dash = (clamped / 100) * C;
  return (
    <span style={{ position: 'relative', width: size, height: size, display: 'inline-flex', flexShrink: 0 }}>
      <svg width={size} height={size} role="img" aria-label={`${clamped}%`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={thickness}
          style={{ stroke: 'color-mix(in srgb, var(--text) 9%, transparent)' }}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${C - dash}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ stroke: color }}
        />
      </svg>
      <span
        className="pax-mono"
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: size >= 46 ? 10.5 : 9,
          fontWeight: 700,
          color: 'var(--text)',
        }}
      >
        {clamped}
      </span>
    </span>
  );
}
