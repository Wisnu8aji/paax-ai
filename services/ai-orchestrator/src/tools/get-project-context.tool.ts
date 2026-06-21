import { defineTool } from "@genkit-ai/ai/tool";
import { z } from "zod";

export const getProjectContextTool = defineTool(
    {
        name: "getProjectContext",
        description: "Get project background and details",
        inputSchema: z.object({ projectId: z.string() }),
        outputSchema: z.object({ context: z.string() })
    },
    async (input) => {
        return { context: "Proyek pembangunan rumah 2 lantai di Jakarta." };
    }
);
