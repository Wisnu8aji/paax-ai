import { z } from "zod";
import type { GatewayCommandRoomSessionSource } from "@paax/schemas";

export const WORK_SYSTEM_PROMPT = [
  "Anda adalah agent kerja umum PAAX untuk membantu pengguna menyelesaikan tugas lokal secara aman dan dapat diaudit.",
  "Gunakan siklus amati, rencanakan, lakukan satu tindakan yang dapat diverifikasi, lalu laporkan hasilnya.",
  "Gunakan task ledger untuk pekerjaan multi-langkah; hanya satu task boleh berstatus in_progress pada satu waktu.",
  "Gunakan tool baca-saja untuk memahami workspace. Jangan mengarang hasil tool, file, command, atau kemajuan.",
  "Tindakan menulis, menghapus, menjalankan proses yang tidak diizinkan, akses jaringan, atau elevasi harus berhenti dan meminta approval eksplisit.",
  "Berikan komentar singkat berkala selama pekerjaan berjalan dan jawaban akhir yang berdiri sendiri dalam Bahasa Indonesia profesional.",
].join(" ");

const workMessage = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(32_000),
}).strict();

const workSessionBinding = z.object({
  channel: z.literal("command_room"),
  conversationId: z.string().min(1).max(256),
  projectId: z.string().min(1).max(256).optional(),
  threadId: z.string().min(1).max(256).optional(),
  workspaceId: z.string().min(1).max(256).optional(),
  snapshotId: z.string().min(1).max(256).optional(),
  documentRevisionId: z.string().min(1).max(256).optional(),
}).strict();

const WorkRequestInputSchema = z.object({
  mode: z.literal("work"),
  runId: z.string().min(1).max(256).optional(),
  session: workSessionBinding.optional(),
  conversationId: z.string().min(1).max(256).optional(),
  projectId: z.string().min(1).max(256).optional(),
  messages: z.array(workMessage).min(1).max(40),
  modelAlias: z.string().min(1).max(64).default("lucent"),
  reasoningEffort: z.enum(["low", "medium", "high", "max"]).default("high"),
  thinking: z.enum(["on", "off"]).default("on"),
  clientCorrelationId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/).optional(),
}).strict();

export const WorkRequestSchema = WorkRequestInputSchema;

type WorkRequestInput = z.infer<typeof WorkRequestInputSchema>;
export type WorkRequest = Omit<WorkRequestInput, "session"> & { session: GatewayCommandRoomSessionSource };

function invalidRequest(message: string, path: (string | number)[] = ["session"]): { success: false; error: z.ZodError } {
  return { success: false, error: new z.ZodError([{ code: z.ZodIssueCode.custom, path, message }]) };
}

export function parseWorkRequest(value: unknown):
  | { success: true; data: WorkRequest }
  | { success: false; error: z.ZodError } {
  const parsed = WorkRequestInputSchema.safeParse(value);
  if (!parsed.success) return parsed;
  const input = parsed.data;
  if (!input.session && !input.conversationId?.trim()) return invalidRequest("session or conversationId is required");
  if (input.session && input.conversationId && input.session.conversationId !== input.conversationId) {
    return invalidRequest("flat conversationId conflicts with session.conversationId", ["conversationId"]);
  }
  if (input.session && input.projectId && input.session.projectId !== input.projectId) {
    return invalidRequest("flat projectId conflicts with session.projectId", ["projectId"]);
  }

  const session: GatewayCommandRoomSessionSource = input.session ?? {
    channel: "command_room",
    conversationId: input.conversationId as string,
    ...(input.projectId ? { projectId: input.projectId } : {}),
  };
  return { success: true, data: { ...input, session } };
}

export function buildWorkMessages(messages: WorkRequest["messages"] | Array<{ role: "user" | "assistant" | "system"; content: string }>) {
  const conversation = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({ role: message.role as "user" | "assistant", content: message.content }));
  return [{ role: "system" as const, content: WORK_SYSTEM_PROMPT }, ...conversation];
}
