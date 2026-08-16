import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const MessagePayload = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().max(48_000),
  parts: z.array(z.record(z.string(), z.unknown())).default([]),
  sources: z.array(z.record(z.string(), z.unknown())).default([]),
  artifacts: z.array(z.record(z.string(), z.unknown())).default([]),
  modelAlias: z.enum(["lucent", "arete", "noir"]).optional(),
  turnId: z.string().max(160).optional(),
  sequence: z.number().int().nonnegative(),
});

function dbUrl(): string | null {
  const value = process.env.DB_API_URL?.trim().replace(/\/+$/, "");
  return value || null;
}

function headers(request: NextRequest): HeadersInit {
  const next: Record<string, string> = { "Content-Type": "application/json" };
  const authorization = request.headers.get("authorization");
  if (authorization) next.Authorization = authorization;
  const internalKey = process.env.INTERNAL_SERVICE_KEY?.trim();
  if (internalKey) {
    next["X-Internal-Key"] = internalKey;
    next["X-User-Id"] = process.env.PAAX_PORTABLE_ACTOR_ID?.trim() || "paax-web";
  }
  return next;
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const base = dbUrl();
  if (!base) return NextResponse.json({ error: "Server persistence belum dikonfigurasi.", durable: false }, { status: 503 });
  const parsed = MessagePayload.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Message payload tidak valid." }, { status: 400 });
  const { id } = await context.params;
  try {
    const response = await fetch(`${base}/conversations/${encodeURIComponent(id)}/messages`, {
      method: "POST",
      headers: headers(request),
      body: JSON.stringify({
        role: parsed.data.role,
        content: parsed.data.content,
        parts: parsed.data.parts,
        sources: parsed.data.sources,
        artifacts: parsed.data.artifacts,
        model_alias: parsed.data.modelAlias,
        turn_id: parsed.data.turnId,
        sequence: parsed.data.sequence,
      }),
    });
    const body = await response.json().catch(() => ({ error: "DB response tidak valid." }));
    if (!response.ok) return NextResponse.json({ error: body.detail ?? body.error ?? "Message gagal disimpan.", durable: false }, { status: response.status });
    return NextResponse.json({ ...body, durable: true });
  } catch {
    return NextResponse.json({ error: "DB persistence tidak tersedia.", durable: false }, { status: 503 });
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const base = dbUrl();
  if (!base) return NextResponse.json({ messages: [], durable: false }, { status: 200 });
  const { id } = await context.params;
  try {
    const response = await fetch(`${base}/conversations/${encodeURIComponent(id)}/messages`, { headers: headers(request), cache: "no-store" });
    const body = await response.json().catch(() => []);
    if (!response.ok) return NextResponse.json({ error: "Message tidak dapat dimuat.", durable: false }, { status: response.status });
    return NextResponse.json({ messages: body, durable: true });
  } catch {
    return NextResponse.json({ messages: [], durable: false }, { status: 200 });
  }
}
