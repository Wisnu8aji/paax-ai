'use client';

import type { CSSProperties, ReactNode } from 'react';

export type PillTone = 'ok' | 'warn' | 'dng' | 'neutral';

const TONES: Record<PillTone, { fg: string; bg: string; bd: string }> = {
  ok: { fg: 'var(--ok-fg)', bg: 'var(--ok-bg)', bd: 'var(--ok-bd)' },
  warn: { fg: 'var(--warn-fg)', bg: 'var(--warn-bg)', bd: 'var(--warn-bd)' },
  dng: { fg: 'var(--dng-fg)', bg: 'var(--dng-bg)', bd: 'var(--dng-bd)' },
  neutral: {
    fg: 'var(--text2)',
    bg: 'color-mix(in srgb,var(--text) 5%,transparent)',
    bd: 'color-mix(in srgb,var(--text) 10%,transparent)',
  },
};

/** Status pill / badge. Tones map to the design's ok/warn/dng/neutral tokens. */
export function StatusPill({
  children,
  tone = 'neutral',
  mono = false,
  style,
}: {
  children: ReactNode;
  tone?: PillTone;
  mono?: boolean;
  style?: CSSProperties;
}) {
  const t = TONES[tone];
  return (
    <span
      className={mono ? 'pax-mono' : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 9.5,
        fontWeight: 700,
        borderRadius: 7,
        padding: '3px 8px',
        color: t.fg,
        background: t.bg,
        border: `1px solid ${t.bd}`,
        ...style,
      }}
    >
      {children}
    </span>
  );
}
