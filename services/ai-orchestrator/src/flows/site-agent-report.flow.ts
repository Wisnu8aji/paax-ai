import { defineFlow } from "@genkit-ai/flow";
import { z } from "zod";

export const siteAgentReportFlow = defineFlow(
    {
        name: "siteAgentReportFlow",
        inputSchema: z.object({ projectId: z.string(), date: z.string() }),
        outputSchema: z.object({ summary: z.string() })
    },
    async (input) => {
        return { summary: "Pengecoran berjalan lancar hari ini." };
    }
);
