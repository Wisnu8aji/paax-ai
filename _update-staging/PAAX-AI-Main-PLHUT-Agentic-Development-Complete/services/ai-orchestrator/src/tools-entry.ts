/**
 * Entry point publik paket @paax/ai-orchestrator untuk konsumen lain di monorepo
 * (khususnya apps/web/src/app/api/command-room/chat/route.ts).
 *
 * Hanya tool registry + type + konverter schema yang diekspos di sini -- BUKAN
 * server Express (index.ts) atau tool-loop Gemini-nya (gemini/tool-loop.ts),
 * karena Command Room memanggil Lucent/Arete/Noir langsung (DeepSeek/Qwen/provider native),
 * bukan Gemini. registry.ts sendiri provider-agnostic (execute() cuma terima
 * args+context, return JSON) -- yang perlu dikonversi cuma declaration-nya via
 * json-schema.ts.
 */
export { createToolRegistry } from "./tools/registry";
export type { ChatContext, RabLineSnapshot, ScheduleSnapshot, ScheduleTaskSnapshot, ToolDefinition, ToolExecutionParams } from "./tools/types";
export { summarizeResult } from "./tools/types";
export { toAnthropicTool, toOpenRouterTool, toJsonSchemaTool } from "./tools/json-schema";
export type { JsonSchemaTool } from "./tools/json-schema";
