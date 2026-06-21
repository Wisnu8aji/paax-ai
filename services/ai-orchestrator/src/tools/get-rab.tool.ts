import { defineTool } from '../genkit-placeholder';

import { z } from "zod";

export const getRabTool = defineTool(
    {
        name: "getRab",
        description: "Fetch current RAB data",
        inputSchema: z.object({ rabId: z.string() }),
        outputSchema: z.object({ data: z.any() })
    },
    async (input: any) => {
        return { data: { id: input.rabId, total: 500000000 } };
    }
);
