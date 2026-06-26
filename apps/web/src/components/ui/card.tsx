'use client';

import type { CSSProperties, ReactNode } from 'react';

/**
 * Elevated surface card for the workspace redesign. Token-driven (uses --elev,
 * --border, --shadow-card). `emboss` swaps the flat shadow for the neumorphic one.
 */
export function Card({
  children,
  className = '',
  style,
  emboss = false,
  hover = false,
  padding = 18,
  radius = 16,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  emboss?: boolean;
  hover?: boolean;
  padding?: number | string;
  radius?: number | string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`${hover ? 'pax-card-hover' : ''} ${onClick ? 'cursor-pointer' : ''} ${className}`}
      style={{
        background: 'var(--elev)',
        border: '1px solid var(--border)',
        borderRadius: radius,
        padding,
        boxShadow: emboss ? 'var(--emboss-sm)' : 'var(--shadow-card)',
        transition: 'all .15s',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
