/**
 * Entry point publik paket @paax/ai-orchestrator untuk modul Intelligence Runtime
 * (router/*.ts) -- dipakai konsumen lain di monorepo, khususnya
 * apps/web/src/app/api/command-room/chat/route.ts.
 *
 * Lihat tools-entry.ts untuk kontrak yang sama pada tool registry.
 */
export * from "./router/types";
export { evaluateEvidenceGate } from "./router/evidence-gate";
export type { EvidenceGateInput } from "./router/evidence-gate";
export { buildIntentFrame, planDepthStatusMessage, buildExecutionPlan } from "./router/capability-router";
export { distillTurn } from "./router/memory-distiller";
export { recallContext } from "./router/context-recall";
export type { RecallContextParams } from "./router/context-recall";
