import type { ModelAlias } from "@/lib/paax-models";

/**
 * Product boundary for provider-supplied reasoning text.
 *
 * Arete and Lucent expose only safe observable activities produced from
 * server/tool milestones. Their raw reasoning deltas never leave the server.
 * Noir keeps its explicit reasoning panel for users who select that mode.
 */
export function shouldStreamRawReasoningToClient(modelAlias?: ModelAlias): boolean {
  return modelAlias === "noir";
}
