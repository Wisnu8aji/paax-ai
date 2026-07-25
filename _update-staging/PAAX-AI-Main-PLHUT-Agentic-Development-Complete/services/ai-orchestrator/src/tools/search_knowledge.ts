import { GEMINI_MODEL } from "../config";
import type { ChatContext, ToolDefinition } from "./types";
import type { GeminiFunctionDeclaration } from "../gemini/types";

export const searchKnowledgeDeclaration: GeminiFunctionDeclaration = {
  name: "search_knowledge",
  description: "Cari data/pengetahuan dari database (contoh: katalog AHSP atau referensi proyek). WAJIB gunakan tool ini ketika ditanya tentang kode AHSP, harga, atau detail dokumen. WAJIB kutip source_ref di jawaban akhir.",
  parameters: {
    type: "OBJECT",
    properties: {
      query: { type: "STRING", description: "Pertanyaan atau kata kunci pencarian" },
      source_type: { type: "STRING", description: "Tipe sumber, misal 'ahsp' atau 'project_tkg'. Kosongkan untuk semua." },
    },
    required: ["query"],
  },
};

async function executeSearchKnowledge(args: Record<string, unknown>, options?: { context?: ChatContext; dbApiUrl?: string; geminiApiKey?: string; fetchImpl?: typeof fetch }): Promise<Record<string, unknown>> {
  const query = typeof args.query === "string" ? args.query : "";
  const source_type = typeof args.source_type === "string" ? args.source_type : undefined;
  
  if (!query) {
    return { error: "query harus diisi" };
  }
  
  const apiKey = options?.geminiApiKey;
  if (!apiKey) {
    return { error: "GEMINI_API_KEY tidak tersedia untuk embedding." };
  }
  const dbApiUrl = options?.dbApiUrl || process.env.DB_API_URL || "http://localhost:8001";
  const fetchImpl = options?.fetchImpl ?? fetch;

  try {
    // 1. Get embedding for the query
    const embedUrl = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`;
    const embedRes = await fetchImpl(embedUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "models/text-embedding-004",
        content: { parts: [{ text: query }] }
      })
    });
    
    if (!embedRes.ok) {
      const errTxt = await embedRes.text();
      return { error: `Gagal mendapatkan embedding: ${embedRes.status} ${errTxt}` };
    }
    
    const embedData = await embedRes.json();
    const embedding = embedData.embedding?.values;
    if (!embedding) {
      return { error: "Tidak ada nilai embedding yang dikembalikan Gemini." };
    }
    
    // 2. Search knowledge in DB API
    const searchPayload: Record<string, unknown> = {
      query_embedding: embedding,
      top_k: 5
    };
    if (source_type) {
      searchPayload.source_type = source_type;
    }
    
    const searchRes = await fetchImpl(`${dbApiUrl}/knowledge/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(searchPayload)
    });
    
    if (!searchRes.ok) {
      const errTxt = await searchRes.text();
      return { error: `Gagal mencari di DB API: ${searchRes.status} ${errTxt}` };
    }
    
    const results = await searchRes.json();
    return { results };
  } catch (err: any) {
    return { error: `Terjadi kesalahan saat search_knowledge: ${err.message}` };
  }
}

export function createSearchKnowledgeTool(params: { dbApiUrl: string; geminiApiKey: string; fetchImpl?: typeof fetch }): ToolDefinition {
  return {
    declaration: searchKnowledgeDeclaration,
    execute: (args, context) => executeSearchKnowledge(args, { ...params, context: context?.context }),
    summarize: (res) => {
      if (res.error) return `Error: ${res.error}`;
      const arr = Array.isArray(res.results) ? res.results : [];
      return `Ditemukan ${arr.length} referensi.`;
    }
  };
}
