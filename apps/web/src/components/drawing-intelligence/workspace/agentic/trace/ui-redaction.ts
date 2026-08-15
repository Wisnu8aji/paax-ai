// UI-only projection for runtime data.
//
// The event contract deliberately keeps provider/model fields for audit and
// replay. They must not leak into the operator console, however: the console
// describes the work being performed, not the vendor selected to perform it.

const HIDDEN_KEYS = /^(?:provider|provider_id|provider_name|model|model_id|model_name|vendor|llm|engine|base_url|api_key|access_token)$/i
const AI_IDENTIFIER = /\b(?:deepseek(?:[-\s]?v[\d.]+)?|mimo(?:[-\s]?v[\d.]+)?|qwen(?:[-\s]?v[\d.]+)?|gemini(?:[-\s]?v[\d.]+)?|opencode(?:[-\s]?go)?|openai|anthropic)\b/gi

export function redactUiText(value: string): string {
  return value.replace(AI_IDENTIFIER, 'runtime component')
}

export function redactUiValue(value: unknown): unknown {
  if (typeof value === 'string') return redactUiText(value)
  if (Array.isArray(value)) return value.map(redactUiValue)
  if (value && typeof value === 'object') {
    const projected: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value)) {
      if (HIDDEN_KEYS.test(key)) continue
      projected[key] = redactUiValue(child)
    }
    return projected
  }
  return value
}

export function safeUiJson(value: unknown): string {
  try {
    return JSON.stringify(redactUiValue(value), null, 2) ?? ''
  } catch {
    return '[payload tidak dapat ditampilkan]'
  }
}

export function runtimeRoleLabel(kind: 'agent' | 'subagent' | 'task' | 'retry' | 'error' | 'approval'): string {
  switch (kind) {
    case 'agent': return 'orchestration'
    case 'subagent': return 'worker'
    case 'task': return 'task'
    case 'retry': return 'retry'
    case 'error': return 'error'
    case 'approval': return 'approval'
  }
}
