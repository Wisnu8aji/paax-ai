import { z } from "zod";
export const RabItemSchema = z.object({
    id: z.string(),
    uraianPekerjaan: z.string(),
    satuan: z.string(),
    volume: z.number(),
    hargaSatuan: z.number()
});
