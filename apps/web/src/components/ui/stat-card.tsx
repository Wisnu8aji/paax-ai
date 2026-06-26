'use client';

import type { ReactNode } from 'react';
import { Card } from './card';

/**
 * Compact metric card: uppercase label + monospace value + sub line, with an
 * optional status dot. Matches the dashboard/proyek stat tiles in the design.
 */
export function StatCard({
  label,
  value,
  sub,
  dot,
  icon,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  dot?: string;
  icon?: ReactNode;
}) {
  return (
    <Card padding="15px 17px" radius={14}>
      <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--text2)',
          }}
        >
          {label}
        </span>
        {dot ? (
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: dot }} />
        ) : icon ? (
          <span style={{ color: 'var(--text3)' }}>{icon}</span>
        ) : null}
      </div>
      <div
        className="pax-mono"
        style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)', lineHeight: 1 }}
      >
        {value}
      </div>
      {sub != null && (
        <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 5 }}>{sub}</div>
      )}
    </Card>
  );
}
