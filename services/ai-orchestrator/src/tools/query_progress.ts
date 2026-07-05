import type { ToolDefinition } from "./types";

const RESULT = {
  available: false,
  message: "Monitoring progres lapangan (Site Agent) belum dibangun (rencana v2.0, docs/MASTER_PLAN.md §16) - fitur ini belum tersedia.",
};

export const queryProgressTool: ToolDefinition = {
  declaration: {
    name: "query_progress",
    description: "Cek progres lapangan. Saat ini selalu mengembalikan status belum tersedia.",
    parameters: { type: "OBJECT", properties: {} },
  },
  execute: async () => RESULT,
  summarize: () => "monitoring progres belum tersedia",
};
