import { defineFlow } from "@genkit-ai/flow";
import { z } from "zod";

export const projectSetupFlow = defineFlow(
    {
        name: "projectSetupFlow",
        inputSchema: z.object({ projectName: z.string() }),
        outputSchema: z.object({ status: z.string(), projectId: z.string() })
    },
    async (input) => {
        return { status: "setup_complete", projectId: "proj-123" };
    }
);
