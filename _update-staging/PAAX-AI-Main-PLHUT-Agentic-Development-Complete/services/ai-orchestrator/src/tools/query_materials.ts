import type { ToolDefinition } from "./types";

const RESULT = {
  available: false,
  message: "Prediksi & pengingat kebutuhan material belum dibangun (rencana v1.5, docs/MASTER_PLAN.md §16) - fitur ini belum tersedia.",
};

export const queryMaterialsTool: ToolDefinition = {
  declaration: {
    name: "query_materials",
    description: "Cek kebutuhan material. Saat ini selalu mengembalikan status belum tersedia.",
    parameters: { type: "OBJECT", properties: {} },
  },
  execute: async () => RESULT,
  summarize: () => "prediksi material belum tersedia",
};
