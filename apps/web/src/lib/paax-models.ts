/**
 * paax-models.ts — Single source of truth untuk model internal PAAX AI.
 *
 * 3 model aktif (Command Room):
 *   - Lucent → Mimo v2.5 (default harian, thinking bisa on/off)
 *   - Arete  → Mimo v2.5 (thinking bisa on/off)
 *   - Noir   → Mimo v2.5 (thinking bisa on/off, panel reasoning eksplisit)
 *
 * ATURAN EMAS: File ini hanya berisi definisi model dan routing.
 * Tidak ada kalkulasi angka RAB/HSP/volume di sini.
 */

export type ModelAlias = "lucent" | "arete" | "noir";
export type ModelProvider = "opencode-go" | "deepseek" | "qwen" | "anthropic";
export type ReasoningEffort = "high" | "max";
export type ThinkingMode = "on" | "off";
export type TaskType = "daily_chat" | "planning" | "execution" | "review" | "complex_reasoning";

export interface PaaxModelDef {
  id: ModelAlias;
  displayName: string;
  provider: ModelProvider;
  apiModel: string;
  /** Jika false, thinking selalu off dan toggle disabled. */
  supportsThinking: boolean;
  /** Jika supportsThinking false, nilai ini dipakai secara paksa. */
  forcedThinking: "off" | null;
  allowedReasoningEfforts: ReasoningEffort[];
  defaultReasoningEffort: ReasoningEffort;
  defaultThinking: ThinkingMode;
  description: string;
  descriptionLong: string;
  thinkingOnLabel: string;
  thinkingOffLabel: string;
  effortHighLabel: string;
  effortMaxLabel: string;
}

export const PAAX_MODELS: Record<ModelAlias, PaaxModelDef> = {
  lucent: {
    id: "lucent",
    displayName: "Lucent",
    provider: "opencode-go",
    apiModel: "mimo-v2.5",
    supportsThinking: true,
    forcedThinking: null,
    allowedReasoningEfforts: ["high", "max"],
    defaultReasoningEffort: "high",
    defaultThinking: "on",
    description: "Fast, capable default for daily engineering chat.",
    descriptionLong: "Mimo v2.5 via opencode-go. Model penalaran cepat untuk konsultasi harian, analisa struktur, dan audit teknis.",
    thinkingOnLabel: "Deeper analysis for complex tasks.",
    thinkingOffLabel: "Faster response. No visible reasoning mode.",
    effortHighLabel: "Balanced reasoning.",
    effortMaxLabel: "Maximum reasoning depth.",
  },
  arete: {
    id: "arete",
    displayName: "Arete",
    provider: "opencode-go",
    apiModel: "mimo-v2.5",
    supportsThinking: true,
    forcedThinking: null,
    allowedReasoningEfforts: ["high", "max"],
    defaultReasoningEffort: "high",
    defaultThinking: "on",
    description: "Alternative reasoning mode — Mimo v2.5.",
    descriptionLong: "Mimo v2.5 via opencode-go. Model penalaran mendalam untuk analisa kompleks dengan thinking yang bisa diatur.",
    thinkingOnLabel: "Deeper analysis for complex tasks.",
    thinkingOffLabel: "Faster response. No visible reasoning mode.",
    effortHighLabel: "Balanced reasoning.",
    effortMaxLabel: "Maximum reasoning depth.",
  },
  noir: {
    id: "noir",
    displayName: "Noir",
    provider: "opencode-go",
    apiModel: "mimo-v2.5",
    supportsThinking: true,
    forcedThinking: null,
    allowedReasoningEfforts: ["high", "max"],
    defaultReasoningEffort: "high",
    defaultThinking: "on",
    description: "Mimo v2.5 — reasoning mendalam dengan panel eksplisit.",
    descriptionLong: "Mimo v2.5 via opencode-go. Mode reasoning eksplisit dengan panel berpikir untuk tugas agentic dan coding berat.",
    thinkingOnLabel: "Deep reasoning with visible trace.",
    thinkingOffLabel: "Faster response. No visible reasoning mode.",
    effortHighLabel: "Balanced reasoning.",
    effortMaxLabel: "Maximum reasoning depth.",
  },
} as const;

export function getModel(alias: ModelAlias): PaaxModelDef {
  return PAAX_MODELS[alias];
}

/** Reset-to-default Command Room: Lucent, effort High, thinking On. */
export const DEFAULT_MODEL_ALIAS: ModelAlias = "lucent";
export const DEFAULT_REASONING_EFFORT: ReasoningEffort = "high";
export const DEFAULT_THINKING: ThinkingMode = "on";

/** Model Task Routing Presets */
export interface ModelRoutingPreset {
  alias: ModelAlias;
  thinking: ThinkingMode;
  effort: ReasoningEffort;
  label: string;
  description: string;
}

export const MODEL_ROUTING_PRESETS: Record<TaskType, ModelRoutingPreset> = {
  daily_chat: {
    alias: "lucent",
    thinking: "on",
    effort: "high",
    label: "Daily Chat",
    description: "Lucent Mimo v2.5 — respons cepat untuk tanya jawab teknis harian",
  },
  planning: {
    alias: "noir",
    thinking: "on",
    effort: "max",
    label: "Strategic Planning",
    description: "Noir Mimo v2.5 (Max) — penalaran mendalam untuk strategi proyek & WBS",
  },
  execution: {
    alias: "lucent",
    thinking: "on",
    effort: "high",
    label: "Task Execution",
    description: "Lucent Mimo v2.5 — eksekusi cepat untuk kalkulasi RAB dan query data",
  },
  review: {
    alias: "arete",
    thinking: "on",
    effort: "high",
    label: "Quality Review",
    description: "Arete Mimo v2.5 — audit seimbang untuk review gambar dan spesifikasi",
  },
  complex_reasoning: {
    alias: "noir",
    thinking: "on",
    effort: "max",
    label: "Deep Agentic Reasoning",
    description: "Noir Mimo v2.5 (Max) — penalaran maksimal dengan visualisasi trace eksplisit",
  },
};

/** Resolve model alias for a specific engineering task type */
export function routeModelForTask(taskType: TaskType): ModelAlias {
  return MODEL_ROUTING_PRESETS[taskType]?.alias ?? DEFAULT_MODEL_ALIAS;
}

/** Get recommended model, thinking mode, and effort for a task */
export function getRecommendedSettingsForTask(taskType: TaskType): ModelRoutingPreset {
  return MODEL_ROUTING_PRESETS[taskType] ?? MODEL_ROUTING_PRESETS.daily_chat;
}

/** Resolve thinking mode dengan memperhatikan constraint model. */
export function resolveThinking(
  alias: ModelAlias,
  requested: ThinkingMode,
): ThinkingMode {
  const model = getModel(alias);
  if (!model.supportsThinking) return "off";
  return requested;
}

/** Buat badge label untuk ditampilkan di composer. */
export function composerBadge(
  alias: ModelAlias,
  thinking: ThinkingMode,
  effort: ReasoningEffort,
): string {
  const model = getModel(alias);
  const thinkingLabel = thinking === "on" ? "Ultra" : "Standard";
  const effortLabel = effort === "max" ? "Max" : "High";
  return `${model.displayName} · ${thinkingLabel} · ${effortLabel}`;
}
