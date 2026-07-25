import type { ChatContext, ToolDefinition } from "./types";

const MISSING_GRAPH_MESSAGE =
  "Data gambar kerja (project graph) belum tersedia untuk proyek ini -- belum ada snapshot yang disintesis, atau query tidak menemukan elemen yang cocok.";

/**
 * Backend retrieve v2 (services/db, SPEC B5) memahami filter lokasi/disiplin/jenis
 * elemen HANYA lewat parser intent rule-based yang membaca teks `query` -- endpoint
 * POST /project-graph/retrieve TIDAK punya field body terpisah untuk level/discipline/
 * node_types (lihat services/db/src/paax_db/schemas.py ProjectGraphRetrievalRequest:
 * query, use_intent, depth, budget_tokens, relations, traversal_mode, target_node_id
 * -- tidak lebih). Karena itu param opsional level/discipline/node_types di declaration
 * tool ini (§B6 SPEC_WAVE_B_QUERY_UNDERSTANDING) dilipat sebagai klausa tambahan ke
 * dalam teks query yang benar-benar dikirim -- itulah satu-satunya jalur yang memengaruhi
 * parser B4 di backend. Mengirimnya sebagai field body terpisah akan diam-diam diabaikan
 * Pydantic (silent no-op) dan menyesatkan pemanggil tool.
 */
function buildEnrichedQuery(baseQuery: string, args: Record<string, unknown>): string {
  const extras: string[] = [];
  if (typeof args.level === "string" && args.level.trim()) extras.push(args.level.trim());
  if (typeof args.discipline === "string" && args.discipline.trim()) extras.push(args.discipline.trim());
  if (Array.isArray(args.node_types)) {
    for (const item of args.node_types) {
      if (typeof item === "string" && item.trim()) extras.push(item.trim());
    }
  }
  if (extras.length === 0) return baseQuery;
  return `${baseQuery} ${extras.join(" ")}`.trim();
}

/**
 * `limit` tidak punya padanan di endpoint retrieve (tidak ada node-count cap di backend,
 * hanya budget_tokens yang unitnya token -- bukan jumlah node, jadi memetakan limit ke
 * budget_tokens akan salah satuan dan menyesatkan). Dipotong di sisi tool ini saja
 * sesudah backend menjawab -- murni slicing array, bukan perhitungan/agregasi, jadi
 * tidak melanggar Aturan Emas.
 */

interface HumanDrawingView {
  run_id: string;
  document_name: string | null;
  summary: Record<string, unknown>;
  safety: Record<string, unknown>;
  work_items: Record<string, unknown>[];
  needs_clarification: Record<string, unknown>[];
}

const CATEGORY_TERMS: Record<string, string[]> = {
  column: ["kolom", "column"],
  beam: ["balok", "beam", "girder", "sloof", "sloop", "lintel"],
  slab: ["pelat", "slab"],
  wall: ["dinding", "wall", "partisi", "partition"],
  door: ["pintu", "door"],
  window: ["jendela", "window"],
  foundation: ["fondasi", "pondasi", "foundation", "footing", "footplat", "pile cap"],
  roof: ["atap", "roof", "gording", "rafter", "kuda-kuda"],
  ceiling: ["plafon", "plafond", "ceiling"],
  plumbing: ["plumbing", "air bersih", "air kotor", "air hujan", "sanitary"],
  electrical: ["elektrikal", "electrical", "lampu", "saklar", "stop kontak"],
  abutment: ["abutment"],
  pier: ["pier", "pilar jembatan"],
  girder: ["girder", "gelagar"],
  bearing: ["bearing", "perletakan"],
  bridge_deck: ["bridge deck", "deck jembatan", "lantai jembatan"],
  pavement: ["perkerasan", "pavement", "aspal"],
  drainage: ["drainase", "drainage", "saluran"],
};

function normalizedText(value: unknown): string {
  return String(value ?? "").toLocaleLowerCase("id-ID").replace(/[^a-z0-9]+/g, " ").trim();
}

function requestedLevel(query: string): string | null {
  const source = normalizedText(query);
  const basement = source.match(/\b(?:basement|b)\s*(\d{1,2})\b/);
  if (basement) return `b${Number(basement[1])}`;
  const floor = source.match(/\b(?:lantai|lt|level|floor|l)\s*(\d{1,2})\b/);
  if (floor) return `l${Number(floor[1])}`;
  if (/\b(?:atap|roof|rooftop)\b/.test(source)) return "roof";
  if (/\b(?:fondasi|pondasi|foundation|substructure)\b/.test(source)) return "foundation";
  if (/\b(?:site|tapak|situasi)\b/.test(source)) return "site";
  return null;
}

function requestedCategories(query: string): string[] {
  const source = normalizedText(query);
  return Object.entries(CATEGORY_TERMS)
    .filter(([, aliases]) => aliases.some((alias) => source.includes(normalizedText(alias))))
    .map(([category]) => category);
}

function requestsAuditLayer(query: string): boolean {
  const source = normalizedText(query);
  return [
    "audit", "evidence", "bukti", "bbox", "bounding box", "confidence", "konflik",
    "node", "edge", "provenance", "sumber mentah", "data mentah",
  ].some((term) => source.includes(normalizedText(term)));
}

function compactHumanItem(item: Record<string, unknown>): Record<string, unknown> {
  const sourceSheets = Array.isArray(item.source_sheets)
    ? item.source_sheets.map((sheet) => {
        const row = sheet as Record<string, unknown>;
        return {
          sheet_number: row.sheet_number ?? null,
          title: row.title ?? row.sheet_title ?? null,
          page_number: row.page_number ?? null,
          discipline: row.discipline ?? null,
          drawing_type: row.drawing_type ?? null,
          level: row.level ?? null,
        };
      })
    : [];
  const citations = sourceSheets.map((sheet) => {
    const label = sheet.title || sheet.sheet_number || "lembar";
    return `[${label} p.${sheet.page_number ?? "?"}]`;
  });
  return {
    work_item_id: item.work_item_id,
    category: item.category,
    discipline: item.discipline,
    code: item.code,
    display_name: item.display_name,
    plain_name: item.plain_name,
    plain_description: item.plain_description,
    level: item.level,
    level_label: item.level_label,
    status: item.status,
    status_label: item.status_label,
    readiness_score: item.readiness_score,
    observed_label_count: item.observed_label_count,
    verified_physical_count: item.verified_physical_count,
    count_label: item.count_label,
    count_is_final: item.count_is_final,
    dimensions_text: item.dimensions_text,
    known_facts: item.known_facts,
    blockers: item.blockers,
    recommended_actions: item.recommended_actions,
    source_sheets: sourceSheets,
    citations,
    evidence_refs: item.evidence_refs,
    user_accepted: item.user_accepted,
  };
}

function filterHumanItems(query: string, items: Record<string, unknown>[]): Record<string, unknown>[] {
  const source = normalizedText(query);
  const level = requestedLevel(query);
  const categories = requestedCategories(query);
  const codeTokens = [...source.matchAll(/\b[a-z]{1,4}[- ]?\d{1,3}[a-z]?\b/g)].map((match) => match[0].replace(/\s+/g, ""));

  const scored = items.map((item) => {
    const haystack = normalizedText([
      item.category, item.discipline, item.code, item.display_name, item.plain_name,
      item.plain_description, item.level, item.level_label, item.dimensions_text,
    ].join(" "));
    const itemLevel = normalizedText(item.level);
    const itemCategory = normalizedText(item.category);
    let score = 0;
    if (level) {
      if (itemLevel !== level && !haystack.includes(normalizedText(level))) return { item, score: -1 };
      score += 8;
    }
    if (categories.length) {
      const matchesCategory = categories.some((category) =>
        itemCategory.includes(category) || CATEGORY_TERMS[category]?.some((alias) => haystack.includes(normalizedText(alias))),
      );
      if (!matchesCategory) return { item, score: -1 };
      score += 8;
    }
    if (codeTokens.length) {
      const code = normalizedText(item.code).replace(/\s+/g, "");
      if (codeTokens.includes(code)) score += 12;
      else if (codeTokens.some((token) => haystack.includes(token))) score += 4;
    }
    for (const token of source.split(" ").filter((token) => token.length >= 3)) {
      if (haystack.includes(token)) score += 1;
    }
    return { item, score };
  });

  const positive = scored.filter((entry) => entry.score >= 0 && (entry.score > 0 || (!level && categories.length === 0 && codeTokens.length === 0)));
  return positive
    .sort((a, b) => b.score - a.score || Number(b.item.readiness_score ?? 0) - Number(a.item.readiness_score ?? 0))
    .slice(0, 24)
    .map(({ item }) => compactHumanItem(item));
}

async function fetchLatestHumanDrawingView(input: {
  dbUrl: string;
  documentIntelligenceUrl?: string;
  projectId: string;
  query: string;
  fetchImpl: typeof fetch;
}): Promise<HumanDrawingView | null> {
  const documentIntelligenceUrl = input.documentIntelligenceUrl?.trim().replace(/\/+$/, "");
  if (!documentIntelligenceUrl) return null;
  try {
    const runsResponse = await input.fetchImpl(`${input.dbUrl}/projects/${input.projectId}/dem/runs`, { method: "GET" });
    if (!runsResponse.ok) return null;
    const runs = await runsResponse.json();
    if (!Array.isArray(runs)) return null;
    const candidates = runs
      .filter((run: Record<string, unknown>) => !["failed", "cancelled", "synthesis_failed"].includes(String(run.status ?? "").toLowerCase()))
      .sort((left: Record<string, unknown>, right: Record<string, unknown>) => {
        const leftAt = Date.parse(String(left.completed_at ?? left.updated_at ?? left.created_at ?? "")) || 0;
        const rightAt = Date.parse(String(right.completed_at ?? right.updated_at ?? right.created_at ?? "")) || 0;
        return rightAt - leftAt;
      })
      .slice(0, 5);
    for (const run of candidates) {
      if (!run?.id) continue;
      const response = await input.fetchImpl(
        `${documentIntelligenceUrl}/drawings/dem/${run.id}/intelligence?view=human`,
        { method: "GET" },
      );
      if (!response.ok) continue;
      const payload = await response.json();
      const allItems = Array.isArray(payload.work_items) ? payload.work_items : [];
      const clarification = Array.isArray(payload.needs_clarification) ? payload.needs_clarification : [];
      return {
        run_id: String(run.id),
        document_name: typeof payload.document_name === "string" ? payload.document_name : null,
        summary: payload.summary && typeof payload.summary === "object" ? payload.summary : {},
        safety: payload.safety && typeof payload.safety === "object" ? payload.safety : {},
        work_items: filterHumanItems(input.query, allItems),
        needs_clarification: filterHumanItems(input.query, clarification).slice(0, 8),
      };
    }
  } catch {
    return null;
  }
  return null;
}

function applyLimit<T>(items: T[], limit: unknown): T[] {
  if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) return items;
  return items.slice(0, Math.floor(limit));
}

async function executeQueryProjectGraph(
  args: Record<string, unknown>,
  context: ChatContext | undefined,
  fetchImpl: typeof fetch,
  documentIntelligenceUrl?: string,
): Promise<Record<string, unknown>> {
  const dbUrl = process.env.DB_API_URL;
  const projectId = context?.project_id;
  const query = typeof args.query === "string" ? args.query.trim() : "";

  if (!dbUrl || !projectId || !query) {
    return { available: false, message: MISSING_GRAPH_MESSAGE };
  }

  const enrichedQuery = buildEnrichedQuery(query, args);

  try {
    const res = await fetchImpl(`${dbUrl}/projects/${projectId}/project-graph/retrieve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: enrichedQuery,
        use_intent: true,
      }),
    });
    if (!res.ok) {
      const humanOnly = await fetchLatestHumanDrawingView({
        dbUrl, documentIntelligenceUrl, projectId, query: enrichedQuery, fetchImpl,
      });
      if (humanOnly?.work_items.length) {
        return {
          available: true,
          data_status: "human_projection_only",
          intent: "DRAWING_INTELLIGENCE_LOOKUP",
          human_drawing_view: humanOnly,
          audit_nodes_available: false,
          note: "Project graph belum tersedia, tetapi projection Drawing Intelligence terbaru tersedia. Jawab hanya dari item dan citation pada human_drawing_view.",
        };
      }
      return { available: false, message: MISSING_GRAPH_MESSAGE };
    }
    const data = await res.json();
    // Top-level `status` (services/db ProjectGraphRetrievalResponse, tipe bebas `str`)
    // BUKAN selalu "success" walau backend menjawab valid -- retrieve_project_graph()
    // mengembalikan status="calculation_required" langsung di top-level (bukan cuma di
    // data_status) untuk jalur Aturan Emas fail-closed, dan status="not_ready" saat belum
    // ada snapshot. Hanya "not_ready" yang benar-benar gagal; "calculation_required" wajib
    // diteruskan ke cabang data_status di bawah, jangan dianggap gagal di sini.
    const humanDrawingView = await fetchLatestHumanDrawingView({
      dbUrl, documentIntelligenceUrl, projectId, query: enrichedQuery, fetchImpl,
    });
    if (data.status === "not_ready") {
      if (humanDrawingView?.work_items.length) {
        return {
          available: true,
          data_status: "human_projection_only",
          intent: "DRAWING_INTELLIGENCE_LOOKUP",
          human_drawing_view: humanDrawingView,
          audit_nodes_available: false,
          note: "PCKM belum siap, tetapi hasil Drawing Intelligence terbaru tersedia. Gunakan item dan citation tersebut; jangan membuat fakta tambahan.",
        };
      }
      return { available: false, message: MISSING_GRAPH_MESSAGE };
    }

    const dataStatus = typeof data.data_status === "string" ? data.data_status : null;

    // CALCULATION_REQUIRED (Aturan Emas): tool TIDAK PERNAH menghitung angka RAB/volume
    // sendiri -- backend menolak mencari-cari dan sudah menyiapkan guidance siap-pakai.
    // Diteruskan apa adanya, model wajib menyampaikan arahan ini ke user, bukan menghitung.
    if (dataStatus === "calculation_required") {
      return {
        available: true,
        data_status: dataStatus,
        intent: data.intent ?? null,
        guidance:
          typeof data.guidance === "string"
            ? data.guidance
            : "Angka final (volume/biaya/material) harus dihitung lewat Core Engine dan menunggu approval -- tool ini tidak menghitung.",
        rab_bridge_available: data.rab_bridge_available ?? null,
        notes: Array.isArray(data.notes) ? data.notes : [],
        human_drawing_view: humanDrawingView,
        note:
          "JANGAN menghitung angka apa pun sendiri. Sampaikan guidance ini ke user apa adanya, " +
          "dan arahkan ke fitur RAB/Core Engine (dengan approval) untuk angka final.",
      };
    }

    // unknown_level: backend tidak mengenali nama lantai yang disebut -- jujur kosong,
    // bukan ditutupi dengan tebakan.
    if (dataStatus === "unknown_level") {
      return {
        available: false,
        data_status: dataStatus,
        intent: data.intent ?? null,
        notes: Array.isArray(data.notes) ? data.notes : [],
        message:
          "Level/lantai yang disebut tidak dikenali di gambar kerja proyek ini. Katakan ke user " +
          "bahwa level tersebut tidak ditemukan -- jangan menebak lantai mana yang dimaksud.",
      };
    }

    const auditLayerRequested = requestsAuditLayer(enrichedQuery);
    const rawNodes: Record<string, unknown>[] = Array.isArray(data.nodes) ? data.nodes : [];
    const humanItemsAvailable = Boolean(humanDrawingView?.work_items.length);
    const nodes = humanItemsAvailable && !auditLayerRequested ? [] : applyLimit(rawNodes, args.limit);
    if (nodes.length === 0 && !data.summary_view && !humanItemsAvailable) {
      return {
        available: false,
        data_status: dataStatus ?? "empty",
        intent: data.intent ?? null,
        notes: Array.isArray(data.notes) ? data.notes : [],
        message: MISSING_GRAPH_MESSAGE,
      };
    }

    const humanEvidenceRefs = new Set(
      (humanDrawingView?.work_items ?? []).flatMap((item) =>
        Array.isArray(item.evidence_refs) ? item.evidence_refs.map(String) : [],
      ),
    );
    const rawEvidence: Record<string, unknown>[] = Array.isArray(data.evidence) ? data.evidence : [];
    const evidenceRows = humanItemsAvailable && !auditLayerRequested && humanEvidenceRefs.size > 0
      ? rawEvidence.filter((item) => humanEvidenceRefs.has(String(item.evidence_id ?? "")))
      : rawEvidence;

    return {
      available: true,
      data_status: dataStatus ?? "grounded",
      intent: data.intent ?? null,
      applied_filters: data.applied_filters ?? {},
      nodes: nodes.map((node: Record<string, unknown>) => ({
        node_id: node.node_id,
        name: node.name,
        type: node.type,
        discipline: node.discipline,
        confidence: node.confidence,
      })),
      audit_node_count: rawNodes.length,
      audit_nodes_included: auditLayerRequested || !humanItemsAvailable,
      // evidence membawa sitasi [sheet_id p.halaman] -- model WAJIB mengutip ini
      // untuk setiap klaim faktual, sesuai TOOL_SYSTEM_SUFFIX di tools.ts (Command Room).
      evidence: evidenceRows.map((item: Record<string, unknown>) => ({
        evidence_id: item.evidence_id,
        sheet_id: item.sheet_id,
        sheet: item.sheet_id,
        page_number: typeof item.page_index === "number" ? item.page_index + 1 : null,
        page: typeof item.page_index === "number" ? item.page_index + 1 : null,
        bbox: item.bbox_source ?? item.bbox_json ?? item.bbox ?? null,
        raw_text: item.raw_text,
        raw_excerpt: item.raw_content ?? item.raw_text ?? null,
        status: item.status ?? "extracted",
        source_modality: item.modality ?? null,
      })),
      // Ringkasan per-level (element_type_index, discipline_counts, fakta ukuran tertulis)
      // saat backend menjawab dari project_graph_summary_views -- hanya ada bila intent
      // LIST_FILTER/ELEMENT_LOOKUP dengan filter level cocok view yang tersedia.
      summary_view: data.summary_view ?? null,
      query_view: data.query_view ?? null,
      human_drawing_view: humanDrawingView,
      notes: Array.isArray(data.notes) ? data.notes : [],
      missing_information: Array.isArray(data.missing_information) ? data.missing_information : [],
      note: humanItemsAvailable
        ? "Prioritaskan human_drawing_view. Gunakan count_label persis sebagai observasi gambar, bukan jumlah fisik. Kutip field citations pada item. Nodes hanya disertakan bila query meminta audit/evidence."
        : "Jawab hanya dari data ini. Sertakan sitasi [sheet_id p.halaman] untuk setiap klaim. Jika elemen yang ditanya tidak ada, katakan tidak ditemukan -- jangan menebak.",
    };
  } catch (err) {
    console.warn("Gagal mengambil data project graph dari DB API:", err);
    return { available: false, message: MISSING_GRAPH_MESSAGE };
  }
}

/**
 * Factory (bukan konstanta) karena butuh fetchImpl yang disuntik pemanggil --
 * services/db/.../project-graph/retrieve mewajibkan header X-Internal-Key/X-User-Id
 * (lihat services/db/src/paax_db/main.py auth), sama seperti core-engine. fetch
 * global TANPA header ini selalu 401 "Missing authentication token" walau DB API
 * hidup dan datanya benar -- pola persis createSearchKnowledgeTool/buildAuthedFetch
 * di apps/web/src/app/api/command-room/chat/tools.ts.
 */
export function createQueryProjectGraphTool(params?: { fetchImpl?: typeof fetch; documentIntelligenceUrl?: string }): ToolDefinition {
  return {
    declaration: {
      name: "query_project_graph",
      description:
        "Cari fakta tentang elemen/komponen di gambar kerja proyek (pintu, jendela, kolom, instalasi listrik, dst) dari graf pengetahuan yang sudah disintesis dari hasil analisis gambar. Kirim pertanyaan user apa adanya dalam bahasa natural (mis. \"struktur di lantai 2\", \"dimensi kolom K1\", \"ada konflik apa\") -- backend memahami maksudnya sendiri (lokasi, disiplin, jenis kalkulasi) lewat parser intent, jadi TIDAK perlu memecah atau menyederhanakan frasa. Setiap hasil membawa sitasi sumber (sheet + halaman) dan bila tersedia `human_drawing_view` yang sudah memakai bahasa user -- prioritaskan projection tersebut daripada menafsirkan node audit mentah. WAJIB kutip sumber di jawaban. Gunakan ini untuk pertanyaan tentang isi gambar kerja, BUKAN untuk RAB/HSP/durasi (pakai query_rab/query_schedule untuk itu). Jika hasil membawa data_status=\"calculation_required\" (mis. pertanyaan volume/biaya/kebutuhan material): JANGAN menghitung sendiri -- sampaikan guidance yang tool berikan ke user apa adanya dan arahkan ke fitur RAB/Core Engine dengan approval untuk angka final. Jika data_status=\"unknown_level\": katakan ke user level/lantai yang disebut tidak dikenali di gambar kerja, jangan menebak.",
      parameters: {
        type: "OBJECT",
        properties: {
          query: { type: "STRING", description: "Pertanyaan user dalam bahasa natural, apa adanya (mis. \"kolom di lantai 2\", \"dimensi K1\", \"berapa volume beton lantai 2\", \"ada konflik apa\")" },
          level: { type: "STRING", description: "Opsional -- nama lantai/level bila sudah diketahui pasti dari konteks percakapan (mis. \"Lantai 2\"), untuk memperkuat filter lokasi" },
          discipline: { type: "STRING", description: "Opsional -- disiplin bila sudah diketahui pasti (structure/architecture/mep), untuk memperkuat filter disiplin" },
          node_types: { type: "ARRAY", description: "Opsional -- jenis elemen yang ingin ditekankan (mis. [\"kolom\", \"balok\"])", items: { type: "STRING" } },
          limit: { type: "NUMBER", description: "Opsional -- batas jumlah elemen yang dikembalikan (pemotongan sisi tool, bukan backend)" },
        },
        required: ["query"],
      },
    },
    execute: async (args, callParams) => executeQueryProjectGraph(args, callParams?.context, params?.fetchImpl ?? fetch, params?.documentIntelligenceUrl),
    summarize: (result) => {
      if (result.available === false) return "data gambar kerja tidak tersedia untuk query ini";
      if (result.data_status === "calculation_required") return "kalkulasi diperlukan -- guidance RAB/Core Engine diteruskan (tool tidak menghitung)";
      const humanView = result.human_drawing_view as { work_items?: unknown[] } | null | undefined;
      const humanCount = Array.isArray(humanView?.work_items) ? humanView.work_items.length : 0;
      if (humanCount > 0) return `${humanCount} item Drawing Intelligence relevan ditemukan dengan sumber gambar`;
      const nodeCount = Array.isArray(result.nodes) ? result.nodes.length : 0;
      return `${nodeCount} elemen ditemukan di gambar kerja`;
    },
  };
}
