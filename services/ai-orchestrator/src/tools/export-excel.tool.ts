import { defineTool } from '../genkit-placeholder';

import { z } from "zod";

export const exportExcelTool = defineTool(
    {
        name: "exportExcel",
        description: "Export data to Excel",
        inputSchema: z.object({ projectId: z.string(), type: z.string() }),
        outputSchema: z.object({ url: z.string() })
    },
    async (input: any) => {
        return { url: "https://example.com/export.xlsx" };
    }
);
