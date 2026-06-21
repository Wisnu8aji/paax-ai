import { defineFlow } from '../genkit-placeholder';

import { z } from "zod";

export const estimateReviewerFlow = defineFlow(
    {
        name: "estimateReviewerFlow",
        inputSchema: z.object({ rabId: z.string() }),
        outputSchema: z.object({ review: z.string() })
    },
    async (input: any) => {
        return { review: "Harga besi terlalu tinggi 15% dari standar. Angka final dihitung oleh core-engine, bukan LLM." };
    }
);
