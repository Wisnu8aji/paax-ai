import { defineTool } from "@genkit-ai/ai/tool";
import { z } from "zod";

export const editRabDraftTool = defineTool(
    {
        name: "editRabDraft",
        description: "Edit RAB items",
        inputSchema: z.object({ rabId: z.string(), items: z.array(z.any()) }),
        outputSchema: z.object({ status: z.string() })
    },
    async (input) => {
        return { status: "success" };
    }
);
