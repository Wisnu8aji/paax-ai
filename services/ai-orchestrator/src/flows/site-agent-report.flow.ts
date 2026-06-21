import { defineFlow } from '../genkit-placeholder';

import { z } from "zod";

export const siteAgentReportFlow = defineFlow(
    {
        name: "siteAgentReportFlow",
        inputSchema: z.object({ projectId: z.string(), date: z.string() }),
        outputSchema: z.object({ summary: z.string() })
    },
    async (input: any) => {
        return { summary: "Pengecoran berjalan lancar hari ini." };
    }
);
