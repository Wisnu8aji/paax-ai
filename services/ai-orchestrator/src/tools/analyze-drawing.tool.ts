import { defineTool } from '../genkit-placeholder';

import { z } from "zod";

export const analyzeDrawingTool = defineTool(
    {
        name: "analyzeDrawing",
        description: "Send drawing to document intelligence",
        inputSchema: z.object({ fileId: z.string() }),
        outputSchema: z.object({ summary: z.string() })
    },
    async (input: any) => {
        return { summary: "Analysis complete." };
    }
);
