import type { GatewayModelProfile } from "@paax/schemas";
import type { ModelAlias } from "@/lib/paax-models";

export interface LegacyWorkProfile {
  modelAlias: ModelAlias;
  apiModel: string;
  openRouterModelSlug: string;
}

const SUPPORTED_ALIASES = new Set<ModelAlias>(["lucent", "arete", "noir"]);

export function resolveLegacyProfile(profile: GatewayModelProfile): LegacyWorkProfile | null {
  if (profile.transport !== "openai-compatible") return null;
  if (profile.provider !== "deepseek") return null;
  if (!SUPPORTED_ALIASES.has(profile.alias as ModelAlias)) return null;
  const model = profile.model.trim();
  if (!model) return null;
  return {
    modelAlias: profile.alias as ModelAlias,
    apiModel: model,
    openRouterModelSlug: model.includes("/") ? model : `deepseek/${model}`,
  };
}
