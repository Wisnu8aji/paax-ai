import { z } from "zod";
export const DrawingSchema = z.object({
    id: z.string(),
    url: z.string(),
    type: z.string()
});
