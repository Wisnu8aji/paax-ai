import type { ToolDefinition } from "./types";

interface AhspCatalogItem {
  code: string;
  name: string;
  unit: string;
  bidang?: string;
}

interface LookupOptions {
  coreEngineUrl: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

const TTL_MS = 5 * 60 * 1000;

function tokens(text: string): string[] {
  return text.toLowerCase().split(/\s+/).map((item) => item.trim()).filter(Boolean);
}

export function createLookupAhspTool(options: LookupOptions): ToolDefinition {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  let cachedAt = 0;
  let cachedCatalog: AhspCatalogItem[] | null = null;

  async function catalog(): Promise<AhspCatalogItem[]> {
    if (cachedCatalog && now() - cachedAt < TTL_MS) return cachedCatalog;
    const response = await fetchImpl(`${options.coreEngineUrl.replace(/\/+$/, "")}/ahsp`, { method: "GET" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    cachedCatalog = await response.json() as AhspCatalogItem[];
    cachedAt = now();
    return cachedCatalog;
  }

  return {
    declaration: {
      name: "lookup_ahsp",
      description: "Cari kode AHSP dari kata kunci nama pekerjaan.",
      parameters: {
        type: "OBJECT",
        properties: {
          query: { type: "STRING", description: "Kata kunci nama pekerjaan, mis. 'cat dinding'" },
          limit: { type: "NUMBER", description: "Jumlah kandidat maksimum" },
        },
        required: ["query"],
      },
    },
    execute: async (rawArgs) => {
      const query = String(rawArgs.query ?? "").trim();
      const limit = Math.min(Math.max(Number(rawArgs.limit ?? 5), 1), 10);
      try {
        const queryTokens = tokens(query);
        const items = await catalog();
        const matched = items
          .map((item) => {
            const name = item.name.toLowerCase();
            const score = queryTokens.filter((token) => name.includes(token)).length;
            const exact = query && name.includes(query.toLowerCase());
            return { item, score: exact ? score + 100 : score };
          })
          .filter(({ score }) => score > 0 && (queryTokens.length === 0 || score >= queryTokens.length || score >= 100))
          .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name));
        return {
          candidates: matched.slice(0, limit).map(({ item }) => ({
            code: item.code,
            name: item.name,
            unit: item.unit,
          })),
          total_matched: matched.length,
        };
      } catch {
        return { candidates: [], total_matched: 0, error: "core-engine tidak dapat dihubungi" };
      }
    },
    summarize: (result) => {
      if (typeof result.error === "string") return `error: ${result.error}`;
      return `${Array.isArray(result.candidates) ? result.candidates.length : 0} kandidat ditemukan`;
    },
  };
}
