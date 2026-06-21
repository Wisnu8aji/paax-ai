import { defineTool } from "@genkit-ai/core";
import { z } from "zod";

export const analyzeDrawingTool = defineTool(
    {
        name: "analyzeDrawing",
        description: "Send drawing to document intelligence",
        inputSchema: z.object({ fileId: z.string() }),
        outputSchema: z.object({ summary: z.string() })
    },
    async (input) => {
        return { summary: "Analysis complete." };
    }
);
