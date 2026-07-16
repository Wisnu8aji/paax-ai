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
import type { ModelAlias, ReasoningEffort, ThinkingMode } from "@/lib/paax-models";
import { getModel } from "@/lib/paax-models";

export const MAX_TOOL_TURNS = 5;

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
 */
function buildAuthedFetch(): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const internalKey = process.env.INTERNAL_SERVICE_KEY;
    if (internalKey) {
      headers.set("X-Internal-Key", internalKey);
      headers.set("X-User-Id", "command-room-service");
    }
    return fetch(input, { ...init, headers });
  };
}

function buildToolRegistry(): ToolDefinition[] {
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
  return tools.filter((t) => t.declaration.name !== "search_knowledge" && t.declaration.name !== "analyze_drawing");
}

export interface ToolArtifact {
  tool: string;
  filename: string;
  dataUri: string;
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
  if (typeof result.data_uri !== "string") return { forModel: result, artifact: null };
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
    headers["X-User-Id"] = "command-room-service";
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

const TOOL_SYSTEM_SUFFIX =
  "\n\nAnda punya akses ke tool: query_rab (baca snapshot RAB proyek), query_schedule (baca snapshot jadwal proyek), lookup_ahsp (cari kode AHSP dari kata kunci), run_scenario (simulasi skenario waktu-biaya via core-engine -- SATU panggilan sudah mengembalikan SEMUA kandidat skenario sekaligus: baseline, tambah_crew, lembur, paralel; jangan memanggilnya berkali-kali untuk tiap skenario), project_diagnostics (cross-check konsistensi RAB dan jadwal dalam satu snapshot -- item RAB tanpa kode AHSP/volume, task jadwal tidak konsisten, dst; gunakan ini kalau user bertanya kenapa ada masalah/ketidaksesuaian di proyeknya, BUKAN untuk membandingkan revisi RAB dari waktu ke waktu karena data historis revisi tidak tersedia), query_project_graph (cari fakta tentang elemen/komponen di gambar kerja proyek -- pintu, jendela, kolom, instalasi listrik, dst -- dari hasil analisis gambar yang sudah tersimpan; kirim pertanyaan user apa adanya dalam bahasa natural, backend memahami sendiri maksud lokasi/disiplin/jenis kalkulasinya, JANGAN memecah atau menyederhanakan frasa jadi satu kata kunci; SETIAP hasil dari tool ini membawa sitasi sumber [sheet_id p.halaman] yang WAJIB Anda kutip persis di jawaban akhir untuk setiap klaim faktual tentang gambar kerja; jika tool bilang data tidak tersedia atau elemen yang ditanya tidak muncul di hasil, katakan tidak ditemukan ke user -- JANGAN PERNAH mengarang detail gambar kerja dari pengetahuan umum; jika hasil membawa data_status \"calculation_required\" (pertanyaan volume/biaya/kebutuhan material), JANGAN PERNAH menghitung angka itu sendiri -- sampaikan guidance yang tool berikan apa adanya dan arahkan user ke fitur RAB/Core Engine dengan approval untuk angka final; jika data_status \"unknown_level\", katakan ke user level/lantai yang disebut tidak dikenali di gambar kerja proyek ini, jangan menebak lantai mana yang dimaksud), export_rab_xlsx (buat file Excel RAB siap unduh -- HANYA panggil kalau user eksplisit minta file/export/unduh, bukan untuk sekadar melihat data). WAJIB gunakan tool ini kalau pertanyaan butuh data proyek nyata -- JANGAN PERNAH mengarang/mengira-ngira angka RAB, HSP, volume, durasi, atau hasil analisa gambar sendiri. Kalau tool mengembalikan data tidak tersedia, katakan itu apa adanya ke user -- jangan ditutupi dengan estimasi sendiri. PENTING: tool call HANYA boleh dilakukan lewat mekanisme function-calling asli yang disediakan API -- JANGAN PERNAH menuliskan niat memanggil tool sebagai teks/JSON di dalam jawaban Anda (mis. menulis blok kode berisi {\"name\": \"run_scenario\", ...}).\n\nATURAN JAWABAN AKHIR (paling penting, sering dilanggar): jawaban akhir yang Anda tulis untuk user adalah SATU-SATUNYA yang mereka lihat -- mereka TIDAK melihat reasoning/pemikiran internal Anda. Karena itu jawaban akhir WAJIB memuat ulang semua angka konkret secara eksplisit (kode AHSP, durasi hari, biaya rupiah, dst) dalam bentuk tabel atau daftar -- JANGAN PERNAH menulis kalimat seperti 'hasil di atas', 'seperti sudah dihitung', 'sesuai analisis sebelumnya', atau 'lihat data yang sudah ditampilkan' karena user tidak melihat apa pun sebelum jawaban akhir ini. Bayangkan jawaban akhir Anda adalah laporan tertulis lengkap yang berdiri sendiri, bukan kesimpulan dari sesuatu yang sudah ditunjukkan.";

export function withToolSystemPrompt(systemPrompt: string): string {
  return `${systemPrompt}${TOOL_SYSTEM_SUFFIX}`;
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
  req: NextRequest;
  sendEvent: SendEvent;
  runId: string | undefined;
  conversationId: string | undefined;
}): Promise<{ finalMessages: ToolChatMessage[]; usedTool: boolean }> {
  const tools = buildToolRegistry();
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
        tool: call.function.name, timestamp: new Date().toISOString(),
      });
      const { result, summary, artifact } = await executeTool(tools, call.function.name, args, params.context, { modelAlias: params.modelAlias, conversationId: params.conversationId });
      params.sendEvent("message", {
        type: "tool_result", runId: params.runId, conversationId: params.conversationId,
        tool: call.function.name, summary, timestamp: new Date().toISOString(),
      });
      if (artifact) {
        params.sendEvent("message", {
          type: "artifact", runId: params.runId, conversationId: params.conversationId,
          tool: artifact.tool, filename: artifact.filename, dataUri: artifact.dataUri, sizeBytes: artifact.sizeBytes,
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
      max_tokens: 4096,
    }),
    messages: params.messages,
    context: params.context,
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
      max_tokens: 4096,
    }),
    messages: params.messages,
    context: params.context,
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
  req: NextRequest;
  sendEvent: SendEvent;
  runId: string | undefined;
  conversationId: string | undefined;
}): Promise<{ messages: { role: "user" | "assistant"; content: string }[]; usedTool: boolean }> {
  const client = new Anthropic({ apiKey: params.apiKey });
  const tools = buildToolRegistry();
  const toolsSchema = tools.map((t) => toAnthropicTool(t.declaration));
  let currentMessages: AnthropicMsg[] = [...params.messages];
  let usedTool = false;

  for (let turn = 0; turn <= MAX_TOOL_TURNS; turn += 1) {
    const response = await client.messages.create(
      {
        model: params.apiModel,
        max_tokens: 4096,
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
        tool: block.name, timestamp: new Date().toISOString(),
      });
      const { result, summary, artifact } = await executeTool(tools, block.name, block.input as Record<string, unknown>, params.context, { modelAlias: params.modelAlias, conversationId: params.conversationId });
      params.sendEvent("message", {
        type: "tool_result", runId: params.runId, conversationId: params.conversationId,
        tool: block.name, summary, timestamp: new Date().toISOString(),
      });
      if (artifact) {
        params.sendEvent("message", {
          type: "artifact", runId: params.runId, conversationId: params.conversationId,
          tool: artifact.tool, filename: artifact.filename, dataUri: artifact.dataUri, sizeBytes: artifact.sizeBytes,
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
