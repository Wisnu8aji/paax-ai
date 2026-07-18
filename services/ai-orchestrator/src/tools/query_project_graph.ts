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
function applyLimit<T>(items: T[], limit: unknown): T[] {
  if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) return items;
  return items.slice(0, Math.floor(limit));
}

async function executeQueryProjectGraph(
  args: Record<string, unknown>,
  context: ChatContext | undefined,
  fetchImpl: typeof fetch,
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
      return { available: false, message: MISSING_GRAPH_MESSAGE };
    }
    const data = await res.json();
    // Top-level `status` (services/db ProjectGraphRetrievalResponse, tipe bebas `str`)
    // BUKAN selalu "success" walau backend menjawab valid -- retrieve_project_graph()
    // mengembalikan status="calculation_required" langsung di top-level (bukan cuma di
    // data_status) untuk jalur Aturan Emas fail-closed, dan status="not_ready" saat belum
    // ada snapshot. Hanya "not_ready" yang benar-benar gagal; "calculation_required" wajib
    // diteruskan ke cabang data_status di bawah, jangan dianggap gagal di sini.
    if (data.status === "not_ready") {
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

    const rawNodes: Record<string, unknown>[] = Array.isArray(data.nodes) ? data.nodes : [];
    const nodes = applyLimit(rawNodes, args.limit);
    if (nodes.length === 0 && !data.summary_view) {
      return {
        available: false,
        data_status: dataStatus ?? "empty",
        intent: data.intent ?? null,
        notes: Array.isArray(data.notes) ? data.notes : [],
        message: MISSING_GRAPH_MESSAGE,
      };
    }

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
      // evidence membawa sitasi [sheet_id p.halaman] -- model WAJIB mengutip ini
      // untuk setiap klaim faktual, sesuai TOOL_SYSTEM_SUFFIX di tools.ts (Command Room).
      evidence: (data.evidence ?? []).map((item: Record<string, unknown>) => ({
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
      notes: Array.isArray(data.notes) ? data.notes : [],
      missing_information: Array.isArray(data.missing_information) ? data.missing_information : [],
      note:
        "Jawab hanya dari data ini. Sertakan sitasi [sheet_id p.halaman] untuk setiap klaim. " +
        "Jika elemen yang ditanya tidak ada di sini, katakan tidak ditemukan -- jangan menebak.",
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
export function createQueryProjectGraphTool(params?: { fetchImpl?: typeof fetch }): ToolDefinition {
  return {
    declaration: {
      name: "query_project_graph",
      description:
        "Cari fakta tentang elemen/komponen di gambar kerja proyek (pintu, jendela, kolom, instalasi listrik, dst) dari graf pengetahuan yang sudah disintesis dari hasil analisis gambar. Kirim pertanyaan user apa adanya dalam bahasa natural (mis. \"struktur di lantai 2\", \"dimensi kolom K1\", \"ada konflik apa\") -- backend memahami maksudnya sendiri (lokasi, disiplin, jenis kalkulasi) lewat parser intent, jadi TIDAK perlu memecah atau menyederhanakan frasa. Setiap hasil membawa sitasi sumber (sheet + halaman) -- WAJIB dikutip di jawaban. Gunakan ini untuk pertanyaan tentang isi gambar kerja, BUKAN untuk RAB/HSP/durasi (pakai query_rab/query_schedule untuk itu). Jika hasil membawa data_status=\"calculation_required\" (mis. pertanyaan volume/biaya/kebutuhan material): JANGAN menghitung sendiri -- sampaikan guidance yang tool berikan ke user apa adanya dan arahkan ke fitur RAB/Core Engine dengan approval untuk angka final. Jika data_status=\"unknown_level\": katakan ke user level/lantai yang disebut tidak dikenali di gambar kerja, jangan menebak.",
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
    execute: async (args, callParams) => executeQueryProjectGraph(args, callParams?.context, params?.fetchImpl ?? fetch),
    summarize: (result) => {
      if (result.available === false) return "data gambar kerja tidak tersedia untuk query ini";
      if (result.data_status === "calculation_required") return "kalkulasi diperlukan -- guidance RAB/Core Engine diteruskan (tool tidak menghitung)";
      const nodeCount = Array.isArray(result.nodes) ? result.nodes.length : 0;
      return `${nodeCount} elemen ditemukan di gambar kerja`;
    },
  };
}
