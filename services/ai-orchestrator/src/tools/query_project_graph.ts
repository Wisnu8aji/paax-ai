import type { ChatContext, ToolDefinition } from "./types";

const MISSING_GRAPH_MESSAGE =
  "Data gambar kerja (project graph) belum tersedia untuk proyek ini -- belum ada snapshot yang disintesis, atau query tidak menemukan elemen yang cocok.";

async function executeQueryProjectGraph(
  args: Record<string, unknown>,
  context?: ChatContext,
): Promise<Record<string, unknown>> {
  const dbUrl = process.env.DB_API_URL;
  const projectId = context?.project_id;
  const query = typeof args.query === "string" ? args.query.trim() : "";

  if (!dbUrl || !projectId || !query) {
    return { available: false, message: MISSING_GRAPH_MESSAGE };
  }

  try {
    const res = await fetch(`${dbUrl}/projects/${projectId}/project-graph/retrieve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        depth: typeof args.depth === "number" ? args.depth : 2,
        traversal_mode: typeof args.traversal_mode === "string" ? args.traversal_mode : "bfs",
      }),
    });
    if (!res.ok) {
      return { available: false, message: MISSING_GRAPH_MESSAGE };
    }
    const data = await res.json();
    if (data.status !== "success" || !Array.isArray(data.nodes) || data.nodes.length === 0) {
      return { available: false, message: MISSING_GRAPH_MESSAGE };
    }
    return {
      available: true,
      nodes: data.nodes.map((node: Record<string, unknown>) => ({
        node_id: node.node_id,
        name: node.name,
        type: node.type,
        discipline: node.discipline,
        confidence: node.confidence,
      })),
      // evidence membawa sitasi [sheet_id p.halaman] -- model WAJIB mengutip ini
      // untuk setiap klaim faktual, sesuai TOOL_SYSTEM_SUFFIX di tools.ts (Command Room).
      evidence: (data.evidence ?? []).map((item: Record<string, unknown>) => ({
        sheet_id: item.sheet_id,
        page_number: typeof item.page_index === "number" ? item.page_index + 1 : null,
        raw_text: item.raw_text,
        evidence_id: item.evidence_id,
      })),
      note:
        "Jawab hanya dari data ini. Sertakan sitasi [sheet_id p.halaman] untuk setiap klaim. " +
        "Jika elemen yang ditanya tidak ada di sini, katakan tidak ditemukan -- jangan menebak.",
    };
  } catch (err) {
    console.warn("Gagal mengambil data project graph dari DB API:", err);
    return { available: false, message: MISSING_GRAPH_MESSAGE };
  }
}

export const queryProjectGraphTool: ToolDefinition = {
  declaration: {
    name: "query_project_graph",
    description:
      "Cari fakta tentang elemen/komponen di gambar kerja proyek (pintu, jendela, instalasi listrik, dst) dari graf pengetahuan yang sudah disintesis dari hasil analisis gambar. Setiap hasil membawa sitasi sumber (sheet + halaman) -- WAJIB dikutip di jawaban. Gunakan ini untuk pertanyaan tentang isi gambar kerja, BUKAN untuk RAB/HSP/volume/durasi (pakai query_rab/query_schedule untuk itu). PENTING untuk pertanyaan yang menyebut lokasi/lantai (mis. \"struktur di lantai 2\", \"kolom lantai 1\"): kirim HANYA nama lantainya persis (contoh: query=\"Lantai 2\", BUKAN query=\"struktur lantai 2\") -- query berisi nama lantai persis akan mengembalikan SEMUA elemen di lantai itu secara akurat (traversal khusus lokasi). Kalau perlu mempersempit ke jenis elemen tertentu (mis. hanya kolom), panggil tool ini SEKALI LAGI dengan query nama elemen itu (mis. query=\"kolom\") dan bandingkan hasilnya -- jangan gabungkan dua kata kunci berbeda jenis (nama lantai + jenis elemen) dalam satu query string karena itu tidak akan cocok apa pun.",
    parameters: {
      type: "OBJECT",
      properties: {
        query: { type: "STRING", description: "SATU kata kunci per panggilan: kode elemen (P2, J2), nama elemen (pintu, kolom, stop kontak), ATAU nama lantai persis (Lantai 1, Lantai 2) -- jangan gabungkan nama lantai dengan jenis elemen dalam satu string" },
        depth: { type: "NUMBER", description: "Kedalaman penelusuran graf, default 2" },
      },
      required: ["query"],
    },
  },
  execute: async (args, params) => executeQueryProjectGraph(args, params?.context),
  summarize: (result) => {
    if (result.available === false) return "data gambar kerja tidak tersedia untuk query ini";
    const nodeCount = Array.isArray(result.nodes) ? result.nodes.length : 0;
    return `${nodeCount} elemen ditemukan di gambar kerja`;
  },
};
