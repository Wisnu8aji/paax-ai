import type { ChatContext, ToolDefinition } from "./types";

const MISSING_RAB_MESSAGE = "Data RAB tidak tersedia di konteks percakapan ini - user perlu membuka halaman RAB proyek dulu.";

async function executeQueryRab(args: Record<string, unknown>, context?: ChatContext): Promise<Record<string, unknown>> {
  let lines = context?.rab_lines;

  // db-api fetch
  const dbUrl = process.env.DB_API_URL;
  const projectId = context?.project_id;
  if (dbUrl && projectId) {
    try {
      const res = await fetch(`${dbUrl}/projects/${projectId}/rab`);
      if (res.ok) {
        const data = await res.json();
        // payload may contain lines
        if (data.payload && Array.isArray(data.payload.lines)) {
          lines = data.payload.lines;
        }
      }
    } catch (err) {
      console.warn("Gagal mengambil data RAB dari DB API:", err);
    }
  }

  if (!lines || lines.length === 0) {
    return { available: false, message: MISSING_RAB_MESSAGE };
  }
  const filter = typeof args.filter_ahsp_code === "string" ? args.filter_ahsp_code.toLowerCase() : "";
  const filtered = filter
    ? lines.filter((line: any) => typeof line.ahsp_code === "string" && line.ahsp_code.toLowerCase().includes(filter))
    : lines;
  return {
    available: true,
    lines: filtered.map((line) => ({
      ahsp_code: line.ahsp_code,
      volume: line.volume,
      duration_days: line.duration_days,
    })),
    total_lines: filtered.length,
  };
}

export const queryRabTool: ToolDefinition = {
  declaration: {
    name: "query_rab",
    description: "Baca snapshot draft RAB yang dikirim caller di context percakapan.",
    parameters: {
      type: "OBJECT",
      properties: {
        filter_ahsp_code: { type: "STRING", description: "Filter substring kode AHSP, opsional" },
      },
    },
  },
  execute: async (args, params) => executeQueryRab(args, params?.context),
  summarize: (result) => {
    if (result.available === false) return "data RAB tidak tersedia";
    return `${String(result.total_lines ?? 0)} baris RAB ditemukan`;
  },
};
