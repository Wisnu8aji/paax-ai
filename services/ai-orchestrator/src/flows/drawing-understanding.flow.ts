import { defineFlow } from '../genkit-placeholder';

import { z } from "zod";

export const drawingUnderstandingFlow = defineFlow(
    {
        name: "drawingUnderstandingFlow",
        inputSchema: z.object({ imageId: z.string() }),
        outputSchema: z.object({ description: z.string() })
    },
    async (input: any) => {
        return { description: "Denah lantai 1 dengan 3 kamar tidur." };
    }
);
