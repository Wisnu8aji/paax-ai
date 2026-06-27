'use client';

/** Thin track + accent fill. `value` is a 0–100 percentage. */
export function ProgressBar({ value, height = 6 }: { value: number; height?: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      style={{
        height,
        borderRadius: 4,
        background: 'color-mix(in srgb,var(--text) 8%,transparent)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{ height: '100%', width: `${pct}%`, borderRadius: 4, background: 'var(--accent)' }}
      />
    </div>
  );
}
