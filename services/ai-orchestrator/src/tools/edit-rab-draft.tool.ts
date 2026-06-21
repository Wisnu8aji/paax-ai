import { defineTool } from '../genkit-placeholder';

import { z } from "zod";

export const editRabDraftTool = defineTool(
    {
        name: "editRabDraft",
        description: "Edit RAB items",
        inputSchema: z.object({ rabId: z.string(), items: z.array(z.any()) }),
        outputSchema: z.object({ status: z.string() })
    },
    async (input: any) => {
        return { status: "success" };
    }
);
