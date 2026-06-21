import { defineFlow } from "@genkit-ai/flow";
import { z } from "zod";

export const estimateReviewerFlow = defineFlow(
    {
        name: "estimateReviewerFlow",
        inputSchema: z.object({ rabId: z.string() }),
        outputSchema: z.object({ review: z.string() })
    },
    async (input) => {
        return { review: "Harga besi terlalu tinggi 15% dari standar. Angka final dihitung oleh core-engine, bukan LLM." };
    }
);
