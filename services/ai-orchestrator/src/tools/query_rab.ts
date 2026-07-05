import type { ChatContext, ToolDefinition } from "./types";

const MISSING_RAB_MESSAGE = "Data RAB tidak tersedia di konteks percakapan ini - user perlu membuka halaman RAB proyek dulu.";

function executeQueryRab(args: Record<string, unknown>, context?: ChatContext): Record<string, unknown> {
  const lines = context?.rab_lines;
  if (!lines || lines.length === 0) {
    return { available: false, message: MISSING_RAB_MESSAGE };
  }
  const filter = typeof args.filter_ahsp_code === "string" ? args.filter_ahsp_code.toLowerCase() : "";
  const filtered = filter
    ? lines.filter((line) => line.ahsp_code.toLowerCase().includes(filter))
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
