import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const QueuePayload = z.object({
  turnId: z.string().min(1).max(160),
  sequence: z.number().int().nonnegative(),
  state: z.enum(["queued", "parked"]).default("queued"),
  payload: z.record(z.string(), z.unknown()).default({}),
});

function baseUrl(): string | null {
  return process.env.DB_API_URL?.trim().replace(/\/+$/, "") || null;
}

function headers(request: NextRequest): HeadersInit {
  const result: Record<string, string> = { "Content-Type": "application/json" };
  const authorization = request.headers.get("authorization");
  if (authorization) result.Authorization = authorization;
  const internalKey = process.env.INTERNAL_SERVICE_KEY?.trim();
  if (internalKey) {
    result["X-Internal-Key"] = internalKey;
    result["X-User-Id"] = process.env.PAAX_PORTABLE_ACTOR_ID?.trim() || "paax-web";
  }
  return result;
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const base = baseUrl();
  if (!base) return NextResponse.json({ entries: [], durable: false });
  const { id } = await context.params;
  try {
    const response = await fetch(`${base}/conversations/${encodeURIComponent(id)}/queue`, { headers: headers(request), cache: "no-store" });
    const body = await response.json().catch(() => []);
    if (!response.ok) return NextResponse.json({ error: "Queue tidak dapat dimuat.", durable: false }, { status: response.status });
    return NextResponse.json({ entries: body, durable: true });
  } catch {
    return NextResponse.json({ entries: [], durable: false });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const base = baseUrl();
  if (!base) return NextResponse.json({ error: "Server persistence belum dikonfigurasi.", durable: false }, { status: 503 });
  const parsed = QueuePayload.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Queue payload tidak valid." }, { status: 400 });
  const { id } = await context.params;
  try {
    const response = await fetch(`${base}/conversations/${encodeURIComponent(id)}/queue`, {
      method: "POST", headers: headers(request),
      body: JSON.stringify({ turn_id: parsed.data.turnId, sequence: parsed.data.sequence, state: parsed.data.state, payload: parsed.data.payload }),
    });
    const body = await response.json().catch(() => ({ error: "DB response tidak valid." }));
    if (!response.ok) return NextResponse.json({ error: body.detail ?? body.error ?? "Queue gagal disimpan.", durable: false }, { status: response.status });
    return NextResponse.json({ entry: body, durable: true });
  } catch {
    return NextResponse.json({ error: "DB persistence tidak tersedia.", durable: false }, { status: 503 });
  }
}
