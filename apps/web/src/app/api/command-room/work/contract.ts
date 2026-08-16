import { z } from "zod";

export const WORK_SYSTEM_PROMPT = [
  "Anda adalah agent kerja umum PAAX untuk membantu pengguna menyelesaikan tugas lokal secara aman dan dapat diaudit.",
  "Gunakan siklus amati, rencanakan, lakukan satu tindakan yang dapat diverifikasi, lalu laporkan hasilnya.",
  "Gunakan task ledger untuk pekerjaan multi-langkah; hanya satu task boleh berstatus in_progress pada satu waktu.",
  "Gunakan tool baca-saja untuk memahami workspace. Jangan mengarang hasil tool, file, command, atau kemajuan.",
  "Tindakan menulis, menghapus, menjalankan proses yang tidak diizinkan, akses jaringan, atau elevasi harus berhenti dan meminta approval eksplisit.",
  "Berikan komentar singkat berkala selama pekerjaan berjalan dan jawaban akhir yang berdiri sendiri dalam Bahasa Indonesia profesional.",
].join(" ");

const workMessage = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().min(1).max(32_000),
});

export const WorkRequestSchema = z.object({
  mode: z.literal("work"),
  runId: z.string().optional(),
  conversationId: z.string().optional(),
  messages: z.array(workMessage).min(1).max(40),
  modelAlias: z.enum(["lucent", "arete", "noir"]).default("lucent"),
  reasoningEffort: z.enum(["low", "medium", "high", "max"]).default("high"),
  thinking: z.enum(["on", "off"]).default("on"),
}).strict();

export type WorkRequest = z.infer<typeof WorkRequestSchema>;

export function parseWorkRequest(value: unknown) {
  return WorkRequestSchema.safeParse(value);
}

export function buildWorkMessages(messages: WorkRequest["messages"] | Array<{ role: "user" | "assistant" | "system"; content: string }>) {
  const conversation = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({ role: message.role as "user" | "assistant", content: message.content }));
  return [{ role: "system" as const, content: WORK_SYSTEM_PROMPT }, ...conversation];
}
