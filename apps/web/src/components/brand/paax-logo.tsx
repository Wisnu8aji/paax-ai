'use client';

import type { CSSProperties } from 'react';

/**
 * Logo PAAX — vektor mengikuti brand sheet (bahan/logo.png):
 * letterform geometris — P berkepala lipatan, A tanpa palang (Λ), X diagonal.
 * Semua memakai currentColor supaya ikut token tema.
 */

/** Huruf P tunggal (mark). Dipakai di kotak logo rail & header panel. */
export function PaaxMark({ size = 18, style }: { size?: number; style?: CSSProperties }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 26 30"
      fill="none"
      aria-hidden="true"
      style={style}
    >
      <path
        d="M5 28 V3 H15 L22 10 L15 17 H5"
        stroke="currentColor"
        strokeWidth={5}
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </svg>
  );
}

/** Wordmark PAAX penuh. `height` menentukan skala; warna via currentColor. */
export function PaaxWordmark({ height = 15, style }: { height?: number; style?: CSSProperties }) {
  const width = (height / 30) * 118;
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 118 30"
      fill="none"
      role="img"
      aria-label="PAAX"
      style={style}
    >
      {/* P */}
      <path
        d="M4 29 V3 H14 L21 10 L14 17 H4"
        stroke="currentColor"
        strokeWidth={5}
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      {/* A A */}
      <path d="M29 29 L40 2 L51 29" stroke="currentColor" strokeWidth={5} strokeLinecap="square" strokeLinejoin="miter" />
      <path d="M57 29 L68 2 L79 29" stroke="currentColor" strokeWidth={5} strokeLinecap="square" strokeLinejoin="miter" />
      {/* X */}
      <path d="M87 2 L113 29 M113 2 L87 29" stroke="currentColor" strokeWidth={5} strokeLinecap="square" />
    </svg>
  );
}

/** Kotak logo (mark putih di kotak gelap) — identitas utama di shell. */
export function PaaxLogoBox({ size = 38, radius = 12 }: { size?: number; radius?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: 'var(--brand-box)',
        color: 'var(--brand-ink)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        boxShadow: 'var(--emboss-sm)',
      }}
    >
      <PaaxMark size={Math.round(size * 0.52)} />
    </span>
  );
}
