import * as XLSX from "xlsx";
import type { ToolDefinition } from "@paax/ai-orchestrator/tools";
import { writeChatArtifact } from "../artifacts/artifact-storage";

export const GENERAL_CHAT_TOOL_NAMES = ["search_web", "calculate_expression", "create_markdown_artifact", "create_xlsx_artifact"] as const;

type GeneralToolContext = {
  conversationId: string;
  turnId: string;
};

function declaration(name: string, description: string, properties: Record<string, unknown>, required: string[] = []) {
  return {
    name,
    description,
    parameters: { type: "OBJECT" as const, properties, required },
  };
}

class ArithmeticParser {
  private index = 0;
  constructor(private readonly source: string) {}

  parse(): number {
    const value = this.expression();
    this.skipWhitespace();
    if (this.index !== this.source.length || !Number.isFinite(value)) throw new Error("ekspresi tidak valid");
    return value;
  }

  private expression(): number {
    let value = this.term();
    while (true) {
      this.skipWhitespace();
      const operator = this.source[this.index];
      if (operator !== "+" && operator !== "-") return value;
      this.index++;
      const right = this.term();
      value = operator === "+" ? value + right : value - right;
    }
  }

  private term(): number {
    let value = this.factor();
    while (true) {
      this.skipWhitespace();
      const operator = this.source[this.index];
      if (operator !== "*" && operator !== "/" && operator !== "%") return value;
      this.index++;
      const right = this.factor();
      if ((operator === "/" || operator === "%") && right === 0) throw new Error("pembagian dengan nol");
      value = operator === "*" ? value * right : operator === "/" ? value / right : value % right;
    }
  }

  private factor(): number {
    this.skipWhitespace();
    const char = this.source[this.index];
    if (char === "+" || char === "-") {
      this.index++;
      const value = this.factor();
      return char === "-" ? -value : value;
    }
    if (char === "(") {
      this.index++;
      const value = this.expression();
      this.skipWhitespace();
      if (this.source[this.index] !== ")") throw new Error("kurung tidak berpasangan");
      this.index++;
      return value;
    }
    const identifier = this.source.slice(this.index).match(/^(pi|e)\b/i)?.[0];
    if (identifier) {
      this.index += identifier.length;
      return identifier.toLowerCase() === "pi" ? Math.PI : Math.E;
    }
    const number = this.source.slice(this.index).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i)?.[0];
    if (!number) throw new Error("angka tidak ditemukan");
    this.index += number.length;
    return Number(number);
  }

  private skipWhitespace() {
    while (/\s/.test(this.source[this.index] ?? "")) this.index++;
  }
}

function calculateExpression(expression: string): Record<string, unknown> {
  const trimmed = expression.trim();
  if (!trimmed || trimmed.length > 500 || !/^[0-9eE+\-*/%().\spi]+$/.test(trimmed)) return { error: "Ekspresi hanya boleh berisi operasi aritmetika dasar." };
  try {
    const value = new ArithmeticParser(trimmed).parse();
    return { expression: trimmed, value, unit: "dimensionless", deterministic: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Ekspresi tidak dapat dihitung." };
  }
}

async function searchWeb(query: string, maxResults: number): Promise<Record<string, unknown>> {
  const trimmed = query.trim();
  if (!trimmed) return { error: "Query pencarian kosong." };
  const limit = Math.max(1, Math.min(5, Math.floor(maxResults || 5)));
  const language = process.env.COMMAND_ROOM_WIKI_LANGUAGE?.trim().toLowerCase() || "id";
  const endpoint = `https://${/^[a-z]{2}$/.test(language) ? language : "id"}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(trimmed)}&srlimit=${limit}&format=json&origin=*`;
  try {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(12_000) });
    if (!response.ok) return { error: `Pencarian web gagal (${response.status}).` };
    const body = await response.json() as { query?: { search?: Array<{ title?: string; snippet?: string; pageid?: number }> } };
    const rows = body.query?.search ?? [];
    const sources = rows.map((row, index) => ({
      source_id: `wiki-${row.pageid ?? index}`,
      title: row.title || "Wikipedia",
      uri: `https://${language}.wikipedia.org/wiki/${encodeURIComponent((row.title || "").replaceAll(" ", "_"))}`,
      snippet: (row.snippet || "").replace(/<[^>]+>/g, ""),
      provenance: "wikipedia_search",
    }));
    return { query: trimmed, sources, result_count: sources.length, summary: sources.map((source) => `${source.title}: ${source.snippet}`).join("\n") };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Pencarian web gagal." };
  }
}

async function createMarkdownArtifact(context: GeneralToolContext, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const content = typeof args.content === "string" ? args.content : "";
  if (!content.trim()) return { error: "Isi artifact kosong." };
  const name = typeof args.filename === "string" && args.filename.trim() ? args.filename : "paax-chat-note.md";
  try {
    const artifact = await writeChatArtifact({ conversationId: context.conversationId, turnId: context.turnId, name, mediaType: "text/markdown", bytes: Buffer.from(content, "utf8") });
    return { artifact_id: artifact.artifact_id, filename: artifact.name, media_type: artifact.media_type, size_bytes: artifact.size_bytes, download_url: artifact.download_url, file_ready: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Artifact gagal disimpan." };
  }
}

async function createXlsxArtifact(context: GeneralToolContext, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const rows = Array.isArray(args.rows) ? args.rows : [];
  if (!rows.length || rows.length > 10_000) return { error: "rows wajib berisi 1 sampai 10.000 baris." };
  const normalized = rows.map((row) => Array.isArray(row) ? row.map((cell) => typeof cell === "string" || typeof cell === "number" || typeof cell === "boolean" ? cell : JSON.stringify(cell ?? "")) : [JSON.stringify(row ?? "")]);
  try {
    const sheet = XLSX.utils.aoa_to_sheet(normalized);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "PAAX Chat");
    const bytes = XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const name = typeof args.filename === "string" && args.filename.trim() ? args.filename : "paax-chat-export.xlsx";
    const artifact = await writeChatArtifact({ conversationId: context.conversationId, turnId: context.turnId, name, mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bytes });
    return { artifact_id: artifact.artifact_id, filename: artifact.name, media_type: artifact.media_type, size_bytes: artifact.size_bytes, download_url: artifact.download_url, file_ready: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "XLSX gagal dibuat." };
  }
}

export function createGeneralChatToolRegistry(context: GeneralToolContext): ToolDefinition[] {
  return [
    {
      declaration: declaration("search_web", "Cari sumber web umum saat jawaban membutuhkan informasi terkini atau rujukan eksternal. Jangan gunakan untuk data operasional project PAAX.", {
        query: { type: "string", description: "Pertanyaan pencarian." },
        max_results: { type: "integer", description: "Jumlah hasil, maksimal 5." },
      }, ["query"]),
      execute: (args) => searchWeb(String(args.query ?? ""), typeof args.max_results === "number" ? args.max_results : 5),
      summarize: (result) => typeof result.error === "string" ? `Pencarian gagal: ${result.error}` : `${Array.isArray(result.sources) ? result.sources.length : 0} sumber web ditemukan`,
    },
    {
      declaration: declaration("calculate_expression", "Hitung ekspresi aritmetika umum secara deterministik. Tidak membaca atau mengubah data RAB/Schedule/Core Engine.", {
        expression: { type: "string", description: "Ekspresi + - * / % dan kurung." },
      }, ["expression"]),
      execute: (args) => calculateExpression(String(args.expression ?? "")),
      summarize: (result) => typeof result.error === "string" ? `Kalkulasi gagal: ${result.error}` : `Hasil kalkulasi ${String(result.value)}`,
    },
    {
      declaration: declaration("create_markdown_artifact", "Buat catatan Markdown durable yang dapat diunduh user.", {
        filename: { type: "string", description: "Nama file .md." },
        content: { type: "string", description: "Isi Markdown." },
      }, ["content"]),
      execute: (args) => createMarkdownArtifact(context, args),
      summarize: (result) => typeof result.error === "string" ? `Artifact gagal: ${result.error}` : "Artifact Markdown siap diunduh",
    },
    {
      declaration: declaration("create_xlsx_artifact", "Buat workbook XLSX durable dari rows yang diberikan user/model. Gunakan hanya saat user meminta file spreadsheet.", {
        filename: { type: "string", description: "Nama file .xlsx." },
        rows: { type: "array", description: "Array baris; setiap baris array nilai." },
      }, ["rows"]),
      execute: (args) => createXlsxArtifact(context, args),
      summarize: (result) => typeof result.error === "string" ? `XLSX gagal: ${result.error}` : "Workbook XLSX siap diunduh",
    },
  ];
}
