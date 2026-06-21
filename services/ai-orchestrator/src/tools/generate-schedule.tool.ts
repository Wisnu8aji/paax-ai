import { defineTool } from "@genkit-ai/ai/tool";
import { z } from "zod";

export const generateScheduleTool = defineTool(
    {
        name: "generateSchedule",
        description: "Generate project schedule",
        inputSchema: z.object({ projectId: z.string() }),
        outputSchema: z.object({ scheduleId: z.string() })
    },
    async (input) => {
        return { scheduleId: "sch-123" };
    }
);
