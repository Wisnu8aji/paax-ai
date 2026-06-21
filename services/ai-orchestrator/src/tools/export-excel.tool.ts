import { defineTool } from "@genkit-ai/core";
import { z } from "zod";

export const exportExcelTool = defineTool(
    {
        name: "exportExcel",
        description: "Export data to Excel",
        inputSchema: z.object({ projectId: z.string(), type: z.string() }),
        outputSchema: z.object({ url: z.string() })
    },
    async (input) => {
        return { url: "https://example.com/export.xlsx" };
    }
);
