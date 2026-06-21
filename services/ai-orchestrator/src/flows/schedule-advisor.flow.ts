import { defineFlow } from "@genkit-ai/flow";
import { z } from "zod";

export const scheduleAdvisorFlow = defineFlow(
    {
        name: "scheduleAdvisorFlow",
        inputSchema: z.object({ scheduleId: z.string() }),
        outputSchema: z.object({ advice: z.string() })
    },
    async (input) => {
        return { advice: "Pertimbangkan overlap pekerjaan struktur dan arsitektur." };
    }
);
