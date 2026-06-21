import { z } from "zod";
export const ChatMessageSchema = z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string()
});
