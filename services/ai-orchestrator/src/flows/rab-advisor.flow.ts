import { defineFlow } from "@genkit-ai/flow";
import { z } from "zod";

export const rabAdvisorFlow = defineFlow(
    {
        name: "rabAdvisorFlow",
        inputSchema: z.object({ rabId: z.string() }),
        outputSchema: z.object({ advice: z.string() })
    },
    async (input) => {
        return { advice: "Gunakan semen lokal untuk menghemat budget. Angka final dihitung oleh core-engine, bukan LLM." };
    }
);
