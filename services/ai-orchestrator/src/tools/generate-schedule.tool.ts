import { defineTool } from '../genkit-placeholder';

import { z } from "zod";

export const generateScheduleTool = defineTool(
    {
        name: "generateSchedule",
        description: "Generate project schedule",
        inputSchema: z.object({ projectId: z.string() }),
        outputSchema: z.object({ scheduleId: z.string() })
    },
    async (input: any) => {
        return { scheduleId: "sch-123" };
    }
);
