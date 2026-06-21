import { defineFlow } from "@genkit-ai/flow";
import { z } from "zod";

export const engineeringChatFlow = defineFlow(
    {
        name: "engineeringChatFlow",
        inputSchema: z.object({ message: z.string(), projectId: z.string() }),
        outputSchema: z.object({ reply: z.string(), actions: z.array(z.string()).optional() })
    },
    async (input) => {
        // Mock implementation
        const reply = Menerima pesan: . Angka final dihitung oleh core-engine, bukan LLM.;
        return { reply, actions: ["recalculate_rab"] };
    }
);
