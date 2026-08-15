/**
 * paax-models.ts — Single source of truth untuk model internal PAAX AI.
 *
 * 3 model aktif (Command Room):
 *   - Lucent → DeepSeek V4 Flash (default harian, thinking bisa on/off)
 *   - Arete  → DeepSeek V4 Pro   (thinking bisa on/off)
 *   - Noir   → DeepSeek V4 Pro   (thinking bisa on/off, panel reasoning eksplisit)
 *
 * ATURAN EMAS: File ini hanya berisi definisi model.
 * Tidak ada kalkulasi angka RAB/HSP/volume di sini.
 */

export type ModelAlias = "lucent" | "arete" | "noir";
export type ModelProvider = "deepseek" | "qwen" | "anthropic";
export type ReasoningEffort = "high" | "max";
export type ThinkingMode = "on" | "off";

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
    provider: "deepseek",
    apiModel: "deepseek-v4-flash",
    supportsThinking: true,
    forcedThinking: null,
    allowedReasoningEfforts: ["high", "max"],
    defaultReasoningEffort: "high",
    defaultThinking: "on",
    description: "Fast, capable default for daily engineering chat.",
    descriptionLong: "DeepSeek V4 Flash. Model penalaran cepat untuk konsultasi harian, analisa struktur, dan audit teknis.",
    thinkingOnLabel: "Deeper analysis for complex tasks.",
    thinkingOffLabel: "Faster response. No visible reasoning mode.",
    effortHighLabel: "Balanced reasoning.",
    effortMaxLabel: "Maximum reasoning depth.",
  },
  arete: {
    id: "arete",
    displayName: "Arete",
    provider: "deepseek",
    apiModel: "deepseek-v4-pro",
    supportsThinking: true,
    forcedThinking: null,
    allowedReasoningEfforts: ["high", "max"],
    defaultReasoningEffort: "high",
    defaultThinking: "on",
    description: "Alternative reasoning model — DeepSeek V4 Pro.",
    descriptionLong: "DeepSeek V4 Pro (via opencode-go). Model penalaran mendalam untuk analisa kompleks dengan thinking yang bisa diatur.",
    thinkingOnLabel: "Deeper analysis for complex tasks.",
    thinkingOffLabel: "Faster response. No visible reasoning mode.",
    effortHighLabel: "Balanced reasoning.",
    effortMaxLabel: "Maximum reasoning depth.",
  },
  noir: {
    id: "noir",
    displayName: "Noir",
    provider: "deepseek",
    apiModel: "deepseek-v4-pro",
    supportsThinking: true,
    forcedThinking: null,
    allowedReasoningEfforts: ["high", "max"],
    defaultReasoningEffort: "high",
    defaultThinking: "on",
    description: "DeepSeek V4 Pro — reasoning mendalam dengan panel eksplisit.",
    descriptionLong: "DeepSeek V4 Pro (via opencode-go). Mode reasoning eksplisit dengan panel berpikir untuk tugas agentic dan coding berat.",
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
