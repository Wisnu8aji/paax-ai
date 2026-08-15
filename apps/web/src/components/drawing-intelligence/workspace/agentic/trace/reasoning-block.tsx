// paax/web — ReasoningBlock (F2 #3, trace).
//
// Menampilkan reasoning HANYA dari reasoning.delta / reasoning.available
// nyata (payload_summary.delta|text|content|reasoning dari runtime F1).
// DILARANG menampilkan reasoning sintetis (Owner §0.15, EI §8.3).

import { redactUiText } from './ui-redaction'

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
  void model
  void provider
  return (
    <details
      data-testid="reasoning-block"
      open
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
      <summary style={{ cursor: 'pointer', color: 'var(--di-text3)', fontSize: 10, fontWeight: 700 }}>
        THINKING PROCESS{label ? ` · ${redactUiText(label)}` : ''}
      </summary>
      <div style={{ marginTop: 6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{redactUiText(content)}</div>
    </details>
  )
}
