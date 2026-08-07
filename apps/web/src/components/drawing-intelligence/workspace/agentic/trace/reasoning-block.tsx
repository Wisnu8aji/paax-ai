// paax/web — ReasoningBlock (F2 #3, trace).
//
// Menampilkan reasoning HANYA dari reasoning.delta / reasoning.available
// nyata (payload_summary.delta|text|content|reasoning dari runtime F1).
// DILARANG menampilkan reasoning sintetis (Owner §0.15, EI §8.3).

export interface ReasoningBlockProps {
  /** Konten reasoning akumulasi per task (dari store.reasoningByTask). */
  content?: string
  model?: string | null
  provider?: string | null
  label?: string
}

export function ReasoningBlock({ content, model, provider, label }: ReasoningBlockProps): React.ReactElement | null {
  if (!content || content.trim().length === 0) {
    return null
  }
  return (
    <div
      data-testid="reasoning-block"
      style={{
        margin: '4px 0',
        padding: '8px 10px',
        borderRadius: 8,
        background: 'rgba(234, 179, 8, 0.06)',
        border: '1px solid rgba(234, 179, 8, 0.25)',
        fontSize: 11.5,
        lineHeight: 1.55,
        color: 'var(--di-text2)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 10, color: 'var(--di-text3)' }}>
        <span style={{ fontWeight: 700, color: '#eab308' }}>reasoning</span>
        {label && <span>{label}</span>}
        {provider && model && (
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--di-mono, monospace)' }}>
            {provider} · {model}
          </span>
        )}
      </div>
      <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{content}</div>
    </div>
  )
}
