import { defineTool } from '../genkit-placeholder';

import { z } from "zod";

export const getProjectContextTool = defineTool(
    {
        name: "getProjectContext",
        description: "Get project background and details",
        inputSchema: z.object({ projectId: z.string() }),
        outputSchema: z.object({ context: z.string() })
    },
    async (input: any) => {
        return { context: "Proyek pembangunan rumah 2 lantai di Jakarta." };
    }
);
