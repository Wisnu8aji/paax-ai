import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const UpdatePayload = z.object({
  state: z.enum(["queued", "parked", "running", "completed", "cancelled", "failed"]),
  error: z.string().max(2_000).nullable().optional(),
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

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string; entryId: string }> }) {
  const base = baseUrl();
  if (!base) return NextResponse.json({ error: "Server persistence belum dikonfigurasi.", durable: false }, { status: 503 });
  const parsed = UpdatePayload.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Queue update tidak valid." }, { status: 400 });
  const { id, entryId } = await context.params;
  try {
    const response = await fetch(`${base}/conversations/${encodeURIComponent(id)}/queue/${encodeURIComponent(entryId)}`, {
      method: "PUT", headers: headers(request), body: JSON.stringify({ state: parsed.data.state, error: parsed.data.error ?? null }),
    });
    const body = await response.json().catch(() => ({ error: "DB response tidak valid." }));
    if (!response.ok) return NextResponse.json({ error: body.detail ?? body.error ?? "Queue update gagal.", durable: false }, { status: response.status });
    return NextResponse.json({ entry: body, durable: true });
  } catch {
    return NextResponse.json({ error: "DB persistence tidak tersedia.", durable: false }, { status: 503 });
  }
}
