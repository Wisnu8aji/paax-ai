/**
 * Tool-calling untuk Command Room (Lucent/Arete/Noir) — Fase 0 PLAN.md
 * (skill command-room-intelligence PLAN.md).
 *
 * Memakai ulang tool registry dari @paax/ai-orchestrator (query_rab, query_schedule,
 * lookup_ahsp, run_scenario, dst) secara in-process — BUKAN HTTP call
 * ke port 8082, karena ai-orchestrator/gemini/tool-loop.ts hardcoded ke Gemini API dan
 * Command Room tidak lagi memakai Gemini sama sekali. Tool declarations dikonversi dari
 * format Gemini ke JSON Schema OpenRouter/Anthropic via toOpenRouterTool/toAnthropicTool.
 *
 * Dikendalikan feature-flag COMMAND_ROOM_TOOLS_ENABLED (lihat isToolsEnabled()) —
 * kalau off atau tool-loop gagal, route.ts jatuh ke jalur direct-stream lama tanpa tools.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { NextRequest } from "next/server";
import {
  createToolRegistry,
  toAnthropicTool,
  toOpenRouterTool,
  type ChatContext,
  type ToolDefinition,
} from "@paax/ai-orchestrator/tools";
import type { CommandRoomConnector } from "./connector-permissions";
import { allowedCommandRoomTools } from "./connector-permissions";
import type { ModelAlias, ReasoningEffort, ThinkingMode } from "@/lib/paax-models";
import { getModel } from "@/lib/paax-models";
import { CHAT_CONTEXT_LIMITS } from "./context";
import { redactWorkPayload } from "@/lib/command-room/work-agent-redaction";

export const MAX_TOOL_TURNS = CHAT_CONTEXT_LIMITS.maxToolTurns;

export interface ToolChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string | null;
  tool_calls?: OpenAiToolCallShape[];
  tool_call_id?: string;
}

interface OpenAiToolCallShape {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type SendEvent = (type: string, data: Record<string, unknown>) => void;

export function isToolsEnabled(): boolean {
  // Default ON kalau core-engine URL dikonfigurasi (tool tanpa core-engine tidak berguna);
  // eksplisit "0"/"false" mematikan tools dan mengembalikan Command Room ke direct-stream murni.
  const flag = process.env.COMMAND_ROOM_TOOLS_ENABLED?.trim().toLowerCase();
  if (flag === "0" || flag === "false") return false;
  if (flag === "1" || flag === "true") return true;
  return Boolean(process.env.CORE_ENGINE_URL?.trim());
}

function getCoreEngineUrl(): string {
  return process.env.CORE_ENGINE_URL?.trim().replace(/\/+$/, "") || "http://localhost:8081";
}

function getDocumentIntelligenceUrl(): string {
  return process.env.DOCUMENT_INTELLIGENCE_URL?.trim().replace(/\/+$/, "") || "http://localhost:8083";
}

/**
 * core-engine (services/core-engine/app/auth.py) mewajibkan auth di SEMUA endpoint
 * lewat get_current_user -- termasuk /ahsp dan /scenario/simulate yang dipakai
 * lookup_ahsp/run_scenario. Tanpa header ini, tool selalu gagal dgn 401 "Missing
 * authentication token" walau core-engine hidup dan datanya benar. Pola persis sama
 * dgn customFetch di services/ai-orchestrator/src/routes/chat.ts -- disalin di sini
 * karena route.ts Command Room tidak lewat Express request yang sama.
 *
 * Seluruh service portable wajib memakai actor yang sama dengan owner project.
 * Default actor adalah `paax-web`; dapat dioverride melalui PAAX_PORTABLE_ACTOR_ID.
 * Menggunakan actor berbeda (mis. service-account) membuat project binding pecah dan
 * retrieval project-scoped dapat 403 walau project telah dipilih user.
 */
function buildAuthedFetch(): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const internalKey = process.env.INTERNAL_SERVICE_KEY;
    if (internalKey) {
      headers.set("X-Internal-Key", internalKey);
      headers.set("X-User-Id", process.env.PAAX_PORTABLE_ACTOR_ID?.trim() || "paax-web");
    }
    return fetch(input, { ...init, headers });
  };
}

// Tool yang HANYA berguna kalau ada data proyek nyata (projectId/rabLines) --
// tanpa itu, tool ini SELALU gagal ("data tidak tersedia") tapi model (tool_choice
// "auto") tetap sering mencobanya dulu untuk pertanyaan umum yang tidak perlu data
// proyek sama sekali. Ditemukan lewat live-test (2026-07-18): pertanyaan teknis
// generik (mis. "bandingkan metode galian tanah") memicu Lucent memanggil
// lookup_ahsp/query_rab/query_schedule/project_diagnostics berkali-kali, semuanya
// gagal, sebelum akhirnya menjawab dari pengetahuan umum -- membuang waktu &
// token untuk manfaat nol. Difilter dari daftar tool SAMA SEKALI (bukan cuma
// diberi tahu "akan gagal") kalau context project tidak ada, supaya model tidak
// punya opsi untuk mencobanya.
const PROJECT_SCOPED_TOOLS = new Set([
  "query_rab",
  "query_schedule",
  "project_diagnostics",
  "query_project_graph",
  "export_rab_xlsx",
]);

function buildToolRegistry(
  context: ChatContext | undefined,
  connectors: readonly CommandRoomConnector[],
  explicitToolNames?: readonly string[],
  overrideTools?: ToolDefinition[],
): ToolDefinition[] {
  const allowedTools = new Set(explicitToolNames ?? allowedCommandRoomTools(connectors));
  if (allowedTools.size === 0) return [];
  if (overrideTools) {
    return overrideTools.filter((tool) => allowedTools.has(tool.declaration.name));
  }
  const tools = createToolRegistry({
    coreEngineUrl: getCoreEngineUrl(),
    documentIntelligenceUrl: getDocumentIntelligenceUrl(),
    fetchImpl: buildAuthedFetch(),
    // geminiApiKey sengaja tidak diisi -- tapi createToolRegistry tetap fallback ke
    // process.env.GEMINI_API_KEY kalau ada (dipakai fitur lain: Smart Import). Filter
    // eksplisit di bawah supaya Command Room TIDAK PERNAH memuat search_knowledge --
    // endpoint embeddingnya (text-embedding-004 v1beta) sudah 404 dan Command Room
    // memang tidak lagi memakai Gemini sama sekali (lihat PLAN.md).
  });
  // analyze_drawing dimatikan 2026-07-14: backend-nya (drawing_routes.py,
  // /drawings/analyze/*) dipindah ke G:\paax-cleanup-archive bersama jalur
  // analisa gambar lama (ConsolidatedExtraction/perception pipeline), digantikan
  // DEM/PCKM (docs/plans/drawing intelligence/). Aktifkan lagi tool pengganti
  // setelah Fase 2-5 (job orchestrator + synthesis + query tool) selesai.
  return tools.filter((t) => {
    if (t.declaration.name === "search_knowledge" || t.declaration.name === "analyze_drawing") return false;
    if (!allowedTools.has(t.declaration.name)) return false;
    if (PROJECT_SCOPED_TOOLS.has(t.declaration.name) && !context?.project_id) return false;
    return true;
  });
}

export interface ToolArtifact {
  tool: string;
  filename: string;
  dataUri?: string;
  artifactId?: string;
  mediaType?: string;
  downloadUrl?: string;
  sizeBytes: number;
}

/**
 * Tool yang menghasilkan file (mis. export_rab_xlsx) mengembalikan data_uri
 * base64 -- bisa puluhan KB. Kalau dikirim mentah ke history percakapan
 * (JSON.stringify(result) ke model di giliran berikutnya), itu memboroskan
 * token secara masif dan berisiko melebihi context window untuk manfaat nol
 * (model tidak perlu "membaca" isi binary file). Di sini data_uri dipisah:
 * model hanya lihat metadata (filename, size) di history; data_uri penuh
 * dikembalikan terpisah sebagai ToolArtifact untuk dikirim ke client via SSE.
 */
function extractArtifact(toolName: string, result: Record<string, unknown>): { forModel: Record<string, unknown>; artifact: ToolArtifact | null } {
  if (typeof result.data_uri !== "string") {
    if (typeof result.artifact_id === "string" && typeof result.download_url === "string") {
      return {
        forModel: { ...result, file_ready: true },
        artifact: {
          tool: toolName,
          filename: typeof result.filename === "string" ? result.filename : "artifact.bin",
          artifactId: result.artifact_id,
          mediaType: typeof result.media_type === "string" ? result.media_type : "application/octet-stream",
          downloadUrl: result.download_url,
          sizeBytes: typeof result.size_bytes === "number" ? result.size_bytes : 0,
        },
      };
    }
    return { forModel: result, artifact: null };
  }
  const { data_uri, ...rest } = result;
  return {
    forModel: { ...rest, file_ready: true, note: "File sudah dibuat dan siap diunduh user lewat UI -- Anda TIDAK perlu menampilkan data_uri, cukup beri tahu user filenya sudah siap." },
    artifact: {
      tool: toolName,
      filename: typeof result.filename === "string" ? result.filename : "export.xlsx",
      dataUri: data_uri,
      sizeBytes: typeof result.size_bytes === "number" ? result.size_bytes : 0,
    },
  };
}

/**
 * Fase 9 observability primitif (PLAN.md §9 Fase 9): catat tiap tool call ke
 * tool_call_audit (services/db, tabel & endpoint SUDAH ADA -- dibangun R7,
 * dipakai gemini/tool-loop.ts, tapi Command Room baru tidak pernah menulis ke
 * situ sebelumnya). Fire-and-forget: audit gagal TIDAK BOLEH pernah
 * menggagalkan/memperlambat chat -- ini murni observability, bukan jalur kritis.
 */
function logToolCallAudit(params: {
  toolName: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
  latencyMs: number;
  success: boolean;
  modelAlias: string;
  conversationId: string | undefined;
  projectId: string | undefined;
}): void {
  const dbUrl = process.env.DB_API_URL;
  if (!dbUrl) return;
  const internalKey = process.env.INTERNAL_SERVICE_KEY;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (internalKey) {
    headers["X-Internal-Key"] = internalKey;
    headers["X-User-Id"] = process.env.PAAX_PORTABLE_ACTOR_ID?.trim() || "paax-web";
  }
  fetch(`${dbUrl.replace(/\/+$/, "")}/audit/tool-call`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      id: crypto.randomUUID(),
      conversation_id: params.conversationId ?? "unknown",
      project_id: params.projectId,
      tool_name: params.toolName,
      input_json: params.args,
      output_json: params.result,
      model: params.modelAlias,
      latency_ms: params.latencyMs,
    }),
  }).catch(() => { /* audit non-kritis -- diamkan kegagalan */ });
}

async function executeTool(
  tools: ToolDefinition[],
  name: string,
  args: Record<string, unknown>,
  context: ChatContext | undefined,
  auditMeta?: { modelAlias: string; conversationId: string | undefined },
): Promise<{ result: Record<string, unknown>; summary: string; artifact: ToolArtifact | null }> {
  const tool = tools.find((item) => item.declaration.name === name);
  if (!tool) {
    const error = `tool tidak dikenal: ${name}`;
    return { result: { error }, summary: `error: ${error}`, artifact: null };
  }
  const startedAt = Date.now();
  try {
    const rawResult = await tool.execute(args, { context });
    const latencyMs = Date.now() - startedAt;
    if (auditMeta) {
      logToolCallAudit({
        toolName: name, args, result: rawResult, latencyMs,
        success: !("error" in rawResult), modelAlias: auditMeta.modelAlias,
        conversationId: auditMeta.conversationId, projectId: context?.project_id,
      });
    }
    const { forModel, artifact } = extractArtifact(name, rawResult);
    const summary = tool.summarize?.(rawResult) ?? "hasil tool diterima";
    return { result: forModel, summary, artifact };
  } catch (err) {
    const message = err instanceof Error ? err.message : "tool gagal";
    if (auditMeta) {
      logToolCallAudit({
        toolName: name, args, result: { error: message }, latencyMs: Date.now() - startedAt,
        success: false, modelAlias: auditMeta.modelAlias,
        conversationId: auditMeta.conversationId, projectId: context?.project_id,
      });
    }
    return { result: { error: message }, summary: `error: ${message}`, artifact: null };
  }
}

const DRAWING_TOOL_INSTRUCTIONS = " query_project_graph (baca fakta DEM/PCKM dari gambar kerja proyek yang dipilih; kutip sheet/halaman untuk setiap fakta; jangan memakai atau menyebut RAB, AHSP, atau Schedule kecuali konektor tersebut juga aktif),";

export function withToolSystemPrompt(systemPrompt: string, toolNames: readonly string[]): string {
  const tools = new Set(toolNames);
  if (tools.size === 0) return systemPrompt;
  const descriptions: string[] = [];
  if (tools.has("query_project_graph")) descriptions.push(DRAWING_TOOL_INSTRUCTIONS);
  if (tools.has("query_rab")) descriptions.push(" query_rab (baca snapshot RAB proyek yang dipilih),");
  if (tools.has("lookup_ahsp")) descriptions.push(" lookup_ahsp (cari kode AHSP yang relevan),");
  if (tools.has("export_rab_xlsx")) descriptions.push(" export_rab_xlsx (hanya bila user eksplisit meminta file/unduh),");
  if (tools.has("query_schedule")) descriptions.push(" query_schedule (baca snapshot jadwal proyek yang dipilih),");
  if (tools.has("run_scenario")) descriptions.push(" run_scenario (simulasi waktu-biaya deterministik melalui Core Engine),");
  return `${systemPrompt}\n\nAnda hanya boleh memakai sumber data yang diaktifkan pengguna untuk proyek yang dipilih. Tool yang tersedia:${descriptions.join("")}`;
}

// ─── OpenRouter / DeepSeek / DashScope (OpenAI-compatible tool_calls) ─────────
// Format history WAJIB mengikuti spesifikasi OpenAI-compatible persis: assistant
// message membawa tool_calls sebagai array terstruktur (content: null), diikuti
// SATU pesan role:"tool" + tool_call_id per hasil. Versi awal menyimpan tool_calls
// sebagai string JSON di role:"assistant" content dan hasil sebagai role:"user"
// teks berprefix -- model lalu "meniru" pola JSON aneh itu di respons berikutnya
// (ditemukan lewat live-test: model menulis {"tool_calls":[...]} sebagai teks
// jawaban ke user). Format asli OpenAI mencegah ini karena tool_calls/tool result
// punya slot skema sendiri, bukan dicampur ke content bebas.

async function runOpenAiCompatibleToolLoop(params: {
  baseUrl: string;
  apiKey: string;
  modelAlias: string;
  buildPayload: (messages: ToolChatMessage[], toolsSchema: Record<string, unknown>[]) => Record<string, unknown>;
  messages: ToolChatMessage[];
  context: ChatContext | undefined;
  connectors: readonly CommandRoomConnector[];
  toolNames: readonly string[];
  toolRegistry?: ToolDefinition[];
  req: NextRequest;
  sendEvent: SendEvent;
  runId: string | undefined;
  conversationId: string | undefined;
}): Promise<{ finalMessages: ToolChatMessage[]; usedTool: boolean }> {
  const tools = buildToolRegistry(params.context, params.connectors, params.toolNames, params.toolRegistry);
  const toolsSchema = tools.map((t) => toOpenRouterTool(t.declaration));
  let currentMessages = [...params.messages];
  let usedTool = false;

  for (let turn = 0; turn <= MAX_TOOL_TURNS; turn += 1) {
    const payload = { ...params.buildPayload(currentMessages, toolsSchema), stream: false, tool_choice: turn < MAX_TOOL_TURNS ? "auto" : "none" };
    const res = await fetch(params.baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${params.apiKey}` },
      body: JSON.stringify(payload),
      signal: params.req.signal,
    });
    if (!res.ok) {
      let errMessage = `HTTP ${res.status} ${res.statusText}`;
      try {
        const errBody = await res.json();
        if (errBody.error?.message) errMessage = errBody.error.message;
      } catch { /* body bukan JSON */ }
      throw new Error(errMessage);
    }
    const data = await res.json();
    const choice = data.choices?.[0];
    const toolCalls: OpenAiToolCallShape[] | undefined = choice?.message?.tool_calls;

    if (!toolCalls || toolCalls.length === 0) {
      const content = typeof choice?.message?.content === "string" ? choice.message.content : "";
      currentMessages.push({ role: "assistant", content });
      return { finalMessages: currentMessages, usedTool };
    }

    usedTool = true;
    currentMessages.push({ role: "assistant", content: null, tool_calls: toolCalls });
    for (const call of toolCalls) {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(call.function.arguments || "{}"); } catch { /* args kosong/invalid */ }
      params.sendEvent("message", {
        type: "tool_call", runId: params.runId, conversationId: params.conversationId,
        tool: call.function.name, toolCallId: call.id, args: redactWorkPayload(args), timestamp: new Date().toISOString(),
      });
      const { result, summary, artifact } = await executeTool(tools, call.function.name, args, params.context, { modelAlias: params.modelAlias, conversationId: params.conversationId });
      params.sendEvent("message", {
        // `result` (the tool's real structured output) is captured here so
        // route.ts's sendEvent wrapper can bind per-claim provenance against
        // it (Target 3, final remediation wave) -- it must never reach the
        // client as part of the outgoing SSE payload, only `summary` is
        // client-facing; the wrapper strips `result` before forwarding.
        type: "tool_result", runId: params.runId, conversationId: params.conversationId,
        tool: call.function.name, toolCallId: call.id, summary, result, timestamp: new Date().toISOString(),
      });
      if (artifact) {
        params.sendEvent("message", {
          type: "artifact", runId: params.runId, conversationId: params.conversationId,
          tool: artifact.tool, filename: artifact.filename, dataUri: artifact.dataUri, artifact_id: artifact.artifactId, media_type: artifact.mediaType, download_url: artifact.downloadUrl, sizeBytes: artifact.sizeBytes,
          timestamp: new Date().toISOString(),
        });
      }
      currentMessages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }

  return { finalMessages: currentMessages, usedTool };
}

export async function runOpenRouterWithTools(params: {
  modelSlug: string;
  modelAlias: string;
  apiKey: string;
  messages: ToolChatMessage[];
  context: ChatContext | undefined;
  connectors: readonly CommandRoomConnector[];
  toolNames: readonly string[];
  toolRegistry?: ToolDefinition[];
  req: NextRequest;
  sendEvent: SendEvent;
  runId: string | undefined;
  conversationId: string | undefined;
}): Promise<{ messages: ToolChatMessage[]; usedTool: boolean }> {
  const { finalMessages, usedTool } = await runOpenAiCompatibleToolLoop({
    baseUrl: "https://openrouter.ai/api/v1/chat/completions",
    apiKey: params.apiKey,
    modelAlias: params.modelAlias,
    buildPayload: (messages, toolsSchema) => ({
      model: params.modelSlug,
      messages,
      tools: toolsSchema,
      temperature: 0.2,
      max_tokens: CHAT_CONTEXT_LIMITS.maxOutputTokens,
    }),
    messages: params.messages,
    context: params.context,
    connectors: params.connectors,
    toolNames: params.toolNames,
    toolRegistry: params.toolRegistry,
    req: params.req,
    sendEvent: params.sendEvent,
    runId: params.runId,
    conversationId: params.conversationId,
  });
  return { messages: finalMessages, usedTool };
}

export async function runDeepSeekNativeWithTools(params: {
  apiModel: string;
  modelAlias: string;
  baseUrl: string;
  apiKey: string;
  messages: ToolChatMessage[];
  context: ChatContext | undefined;
  connectors: readonly CommandRoomConnector[];
  toolNames: readonly string[];
  toolRegistry?: ToolDefinition[];
  req: NextRequest;
  sendEvent: SendEvent;
  runId: string | undefined;
  conversationId: string | undefined;
}): Promise<{ messages: ToolChatMessage[]; usedTool: boolean }> {
  const { finalMessages, usedTool } = await runOpenAiCompatibleToolLoop({
    baseUrl: `${params.baseUrl}/chat/completions`,
    apiKey: params.apiKey,
    modelAlias: params.modelAlias,
    buildPayload: (messages, toolsSchema) => ({
      model: params.apiModel,
      messages,
      tools: toolsSchema,
      temperature: 0.2,
      max_tokens: CHAT_CONTEXT_LIMITS.maxOutputTokens,
    }),
    messages: params.messages,
    context: params.context,
    connectors: params.connectors,
    toolNames: params.toolNames,
    toolRegistry: params.toolRegistry,
    req: params.req,
    sendEvent: params.sendEvent,
    runId: params.runId,
    conversationId: params.conversationId,
  });
  return { messages: finalMessages, usedTool };
}

// ─── Anthropic native (Noir) — tools parameter Messages API ──────────────────
// Format history WAJIB memakai content block asli Anthropic (bukan stringify ke
// teks polos) -- sama alasannya dengan catatan di runOpenAiCompatibleToolLoop:
// assistant message membawa content: response.content mentah (termasuk block
// tool_use), lalu giliran berikut membalas dengan role:"user" + content berupa
// array [{type:"tool_result", tool_use_id, content}] per hasil. Anthropic API
// menolak/salah-paham kalau tool_use/tool_result disamarkan jadi teks biasa.

type AnthropicMsg = { role: "user" | "assistant"; content: string | Array<Record<string, unknown>> };

export async function runAnthropicWithTools(params: {
  apiModel: string;
  modelAlias: string;
  apiKey: string;
  system: string | undefined;
  messages: { role: "user" | "assistant"; content: string }[];
  context: ChatContext | undefined;
  connectors: readonly CommandRoomConnector[];
  toolNames: readonly string[];
  toolRegistry?: ToolDefinition[];
  req: NextRequest;
  sendEvent: SendEvent;
  runId: string | undefined;
  conversationId: string | undefined;
}): Promise<{ messages: { role: "user" | "assistant"; content: string }[]; usedTool: boolean }> {
  const client = new Anthropic({ apiKey: params.apiKey });
  const tools = buildToolRegistry(params.context, params.connectors, params.toolNames, params.toolRegistry);
  const toolsSchema = tools.map((t) => toAnthropicTool(t.declaration));
  let currentMessages: AnthropicMsg[] = [...params.messages];
  let usedTool = false;

  for (let turn = 0; turn <= MAX_TOOL_TURNS; turn += 1) {
    const response = await client.messages.create(
      {
        model: params.apiModel,
        max_tokens: CHAT_CONTEXT_LIMITS.maxOutputTokens,
        system: params.system,
        messages: currentMessages as any,
        tools: toolsSchema as any,
        tool_choice: turn < MAX_TOOL_TURNS ? { type: "auto" } : { type: "none" },
      },
      { signal: params.req.signal },
    );

    const toolUseBlocks = response.content.filter((block): block is Extract<typeof block, { type: "tool_use" }> => block.type === "tool_use");
    if (toolUseBlocks.length === 0) {
      const textBlocks = response.content.filter((block): block is Extract<typeof block, { type: "text" }> => block.type === "text");
      const content = textBlocks.map((b) => b.text).join("");
      currentMessages.push({ role: "assistant", content });
      break;
    }

    usedTool = true;
    currentMessages.push({ role: "assistant", content: response.content as unknown as Array<Record<string, unknown>> });
    const toolResultBlocks: Array<Record<string, unknown>> = [];
    for (const block of toolUseBlocks) {
      params.sendEvent("message", {
        type: "tool_call", runId: params.runId, conversationId: params.conversationId,
        tool: block.name, toolCallId: block.id, args: redactWorkPayload(block.input), timestamp: new Date().toISOString(),
      });
      const { result, summary, artifact } = await executeTool(tools, block.name, block.input as Record<string, unknown>, params.context, { modelAlias: params.modelAlias, conversationId: params.conversationId });
      params.sendEvent("message", {
        // See the OpenRouter loop's identical comment above: `result` is
        // captured for per-claim provenance binding and stripped by route.ts
        // before the event reaches the client.
        type: "tool_result", runId: params.runId, conversationId: params.conversationId,
        tool: block.name, toolCallId: block.id, summary, result, timestamp: new Date().toISOString(),
      });
      if (artifact) {
        params.sendEvent("message", {
          type: "artifact", runId: params.runId, conversationId: params.conversationId,
          tool: artifact.tool, filename: artifact.filename, dataUri: artifact.dataUri, artifact_id: artifact.artifactId, media_type: artifact.mediaType, download_url: artifact.downloadUrl, sizeBytes: artifact.sizeBytes,
          timestamp: new Date().toISOString(),
        });
      }
      toolResultBlocks.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
    }
    currentMessages.push({ role: "user", content: toolResultBlocks });
    if (turn === MAX_TOOL_TURNS) break;
  }

  // route.ts (flattenToolHistoryToChatMessages) hanya paham {role, content: string} --
  // ratakan block tool_use/tool_result Anthropic jadi teks ringkas di sini, di titik
  // keluar fungsi ini, supaya format Anthropic asli tetap dipakai SELAMA loop (di atas)
  // tapi caller di luar tidak perlu tahu bentuk internal Anthropic content block.
  const flatMessages = currentMessages.map((msg): { role: "user" | "assistant"; content: string } => {
    if (typeof msg.content === "string") return { role: msg.role, content: msg.content };
    const parts = msg.content.map((block) => {
      if (block.type === "text") return String(block.text ?? "");
      if (block.type === "tool_use") return `[memanggil tool ${block.name}(${JSON.stringify(block.input)})]`;
      if (block.type === "tool_result") return `[hasil tool] ${String(block.content ?? "")}`;
      return "";
    });
    return { role: msg.role, content: parts.filter(Boolean).join("\n") };
  });

  return { messages: flatMessages, usedTool };
}
