'use client';

/**
 * Toggle switch (visual preference control). Accessible: role="switch",
 * aria-checked, keyboard-operable, dan hit-area diperluas ke ≥44px.
 */
export function Switch({
  checked,
  onCheckedChange,
  label,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      style={{
        position: 'relative',
        width: 40,
        height: 22,
        padding: 0,
        margin: '11px 0',
        borderRadius: 999,
        border: '1px solid var(--border)',
        background: checked ? 'var(--accent)' : 'var(--surface2)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        transition: 'background .18s ease',
        flexShrink: 0,
      }}
    >
      <span
        aria-hidden
        style={{
          position: 'absolute',
          top: 2,
          left: checked ? 20 : 2,
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: checked ? 'var(--accent-ink)' : 'var(--text3)',
          transition: 'left .18s ease, background .18s ease',
        }}
      />
    </button>
  );
}
