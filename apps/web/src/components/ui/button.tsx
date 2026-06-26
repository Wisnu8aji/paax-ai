'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';

const base: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  height: 38,
  padding: '0 16px',
  borderRadius: 10,
  fontWeight: 700,
  fontSize: 12.5,
  cursor: 'pointer',
  transition: 'all .15s',
  whiteSpace: 'nowrap',
};

const variants: Record<Variant, React.CSSProperties> = {
  primary: {
    background: 'var(--accent)',
    color: 'var(--accent-ink)',
    border: 'none',
    boxShadow: 'var(--shadow-card)',
  },
  secondary: {
    background: 'var(--surface)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
  },
  ghost: { background: 'transparent', color: 'var(--text2)', border: '1px solid transparent' },
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

export function Button({ variant = 'primary', children, style, className, ...rest }: Props) {
  return (
    <button
      className={`pax-btn-${variant} ${className ?? ''}`}
      style={{ ...base, ...variants[variant], ...style }}
      {...rest}
    >
      {children}
    </button>
  );
}
