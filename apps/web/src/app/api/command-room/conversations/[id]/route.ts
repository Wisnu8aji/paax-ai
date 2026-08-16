import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const UpdatePayload = z.object({
  projectId: z.string().nullable().optional(),
  title: z.string().trim().max(240).optional(),
  archived: z.boolean().optional(),
  pinned: z.boolean().optional(),
  modelAlias: z.enum(["lucent", "arete", "noir"]).optional(),
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

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const base = baseUrl();
  if (!base) return NextResponse.json({ error: "Server persistence belum dikonfigurasi.", durable: false }, { status: 503 });
  const parsed = UpdatePayload.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Conversation update tidak valid." }, { status: 400 });
  const { id } = await context.params;
  try {
    const response = await fetch(`${base}/conversations/${encodeURIComponent(id)}`, {
      method: "PUT", headers: headers(request),
      body: JSON.stringify({ project_id: parsed.data.projectId, title: parsed.data.title, archived: parsed.data.archived, pinned: parsed.data.pinned, model_alias: parsed.data.modelAlias }),
    });
    const body = await response.json().catch(() => ({ error: "DB response tidak valid." }));
    if (!response.ok) return NextResponse.json({ error: body.detail ?? body.error ?? "Conversation update gagal.", durable: false }, { status: response.status });
    return NextResponse.json({ ...body, durable: true });
  } catch {
    return NextResponse.json({ error: "DB persistence tidak tersedia.", durable: false }, { status: 503 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const base = baseUrl();
  if (!base) return NextResponse.json({ error: "Server persistence belum dikonfigurasi.", durable: false }, { status: 503 });
  const { id } = await context.params;
  try {
    const response = await fetch(`${base}/conversations/${encodeURIComponent(id)}`, { method: "DELETE", headers: headers(request) });
    const body = await response.json().catch(() => ({ error: "DB response tidak valid." }));
    if (!response.ok) return NextResponse.json({ error: body.detail ?? body.error ?? "Conversation delete gagal.", durable: false }, { status: response.status });
    return NextResponse.json({ ...body, durable: true });
  } catch {
    return NextResponse.json({ error: "DB persistence tidak tersedia.", durable: false }, { status: 503 });
  }
}
