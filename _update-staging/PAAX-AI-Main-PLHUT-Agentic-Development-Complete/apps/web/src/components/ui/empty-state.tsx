'use client';

import type { ReactNode } from 'react';

/** Centered icon + message for empty lists. */
export function EmptyState({
  icon,
  title,
  message,
}: {
  icon?: ReactNode;
  title: string;
  message?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: 8,
        padding: '40px 20px',
        color: 'var(--text3)',
      }}
    >
      {icon && <div style={{ color: 'var(--text3)' }}>{icon}</div>}
      <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text2)' }}>{title}</div>
      {message && <div style={{ fontSize: 12, maxWidth: 360 }}>{message}</div>}
    </div>
  );
}
