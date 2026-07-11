/**
 * Helper SSE murni (dipisah dari route.ts — Next.js Route Handlers hanya
 * boleh mengekspor GET/POST/dll, export lain gagal typecheck .next/types).
 */

// Baik DeepSeek maupun DashScope (Qwen) mengembalikan reasoning lewat salah
// satu dari `reasoning` / `reasoning_content` / `reasoning_details` pada
// delta yang SAMA — jangan dijumlahkan (root cause bug historis: OpenRouter
// pernah mengirim `reasoning` DAN `reasoning_details` untuk konten yang sama
// pada delta yang sama, menjumlahkan keduanya menghasilkan teks dobel).
// Pilih satu sumber saja per prioritas.
export function extractDelta(delta: any): { content: string; reasoning: string; finishReason?: string } {
  let reasoning = "";
  if (typeof delta?.reasoning === "string" && delta.reasoning) {
    reasoning = delta.reasoning;
  } else if (typeof delta?.reasoning_content === "string" && delta.reasoning_content) {
    reasoning = delta.reasoning_content;
  } else if (Array.isArray(delta?.reasoning_details)) {
    for (const item of delta.reasoning_details) {
      if (item?.type === "reasoning.text" && typeof item.text === "string") reasoning += item.text;
      if (item?.type === "reasoning.summary" && typeof item.summary === "string") reasoning += item.summary;
    }
  }
  return { content: typeof delta?.content === "string" ? delta.content : "", reasoning };
}
