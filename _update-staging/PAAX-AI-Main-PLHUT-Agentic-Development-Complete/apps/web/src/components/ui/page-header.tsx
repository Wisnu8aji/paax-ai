'use client';

import type { ReactNode } from 'react';

/** Standard screen header: title + subtitle on the left, actions on the right. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap',
      }}
    >
      <div>
        <h1 className="pax-display" style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)' }}>
          {title}
        </h1>
        {subtitle && <p style={{ margin: '5px 0 0', fontSize: 12.5, color: 'var(--text2)' }}>{subtitle}</p>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 9 }}>{actions}</div>}
    </div>
  );
}
