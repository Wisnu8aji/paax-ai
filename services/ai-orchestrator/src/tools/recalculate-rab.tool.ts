import { defineTool } from '../genkit-placeholder';

import { z } from "zod";

export const recalculateRabTool = defineTool(
    {
        name: "recalculateRab",
        description: "Call core-engine to recalculate RAB",
        inputSchema: z.object({ rabId: z.string() }),
        outputSchema: z.object({ newTotal: z.number() })
    },
    async (input: any) => {
        return { newTotal: 510000000 };
    }
);
