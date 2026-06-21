import { defineFlow } from '../genkit-placeholder';

import { z } from "zod";

export const projectSetupFlow = defineFlow(
    {
        name: "projectSetupFlow",
        inputSchema: z.object({ projectName: z.string() }),
        outputSchema: z.object({ status: z.string(), projectId: z.string() })
    },
    async (input: any) => {
        return { status: "setup_complete", projectId: "proj-123" };
    }
);
