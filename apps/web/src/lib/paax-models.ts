/**
 * paax-models.ts — Single source of truth untuk model internal PAAX AI.
 *
 * Hanya 2 model aktif:
 *   - Lucent  → DeepSeek V4 Flash  (cepat, thinking off)
 *   - Solace  → DeepSeek V4 Pro    (reasoning berat, thinking on/off)
 *
 * ATURAN EMAS: File ini hanya berisi definisi model.
 * Tidak ada kalkulasi angka RAB/HSP/volume di sini.
 */

export type ModelAlias = "lucent" | "solace";
export type ReasoningEffort = "high" | "max";
export type ThinkingMode = "on" | "off";

export interface PaaxModelDef {
  id: ModelAlias;
  displayName: string;
  provider: "deepseek";
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
    apiModel: "deepseek-chat",
    supportsThinking: false,
    forcedThinking: "off",
    allowedReasoningEfforts: ["high", "max"],
    defaultReasoningEffort: "high",
    defaultThinking: "off",
    description: "Fast command model for daily engineering chat.",
    descriptionLong: "Cepat, ringan, dan responsif. Cocok untuk tanya jawab harian dan konsultasi singkat.",
    thinkingOnLabel: "Thinking On",
    thinkingOffLabel: "Faster response. No visible reasoning mode.",
    effortHighLabel: "Balanced reasoning.",
    effortMaxLabel: "Maximum reasoning depth.",
  },
  solace: {
    id: "solace",
    displayName: "Solace",
    provider: "deepseek",
    apiModel: "deepseek-reasoner",
    supportsThinking: true,
    forcedThinking: null,
    allowedReasoningEfforts: ["high", "max"],
    defaultReasoningEffort: "high",
    defaultThinking: "on",
    description: "Deep reasoning model for complex technical analysis.",
    descriptionLong: "Model penalaran berat untuk analisa struktur, audit teknis, dan tugas kompleks.",
    thinkingOnLabel: "Deeper analysis for complex tasks.",
    thinkingOffLabel: "Faster response. No visible reasoning mode.",
    effortHighLabel: "Balanced reasoning.",
    effortMaxLabel: "Maximum reasoning depth.",
  },
} as const;

export function getModel(alias: ModelAlias): PaaxModelDef {
  return PAAX_MODELS[alias];
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
  const thinkingLabel = thinking === "on" ? "Thinking On" : "Thinking Off";
  const effortLabel = effort === "max" ? "Max" : "High";
  return `${model.displayName} · ${thinkingLabel} · ${effortLabel}`;
}
