import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const ConversationPayload = z.object({
  id: z.string().uuid().optional(),
  projectId: z.string().nullable().optional(),
  modelAlias: z.enum(["lucent", "arete", "noir"]),
  title: z.string().trim().max(240).optional(),
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

export async function POST(request: NextRequest) {
  const base = dbUrl();
  if (!base) return NextResponse.json({ error: "Server persistence belum dikonfigurasi.", durable: false }, { status: 503 });
  const parsed = ConversationPayload.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Conversation payload tidak valid." }, { status: 400 });
  try {
    const response = await fetch(`${base}/conversations`, {
      method: "POST",
      headers: headers(request),
      body: JSON.stringify({
        id: parsed.data.id,
        project_id: parsed.data.projectId ?? null,
        model_alias: parsed.data.modelAlias,
        title: parsed.data.title,
      }),
    });
    const body = await response.json().catch(() => ({ error: "DB response tidak valid." }));
    if (!response.ok) return NextResponse.json({ error: body.detail ?? body.error ?? "Conversation gagal disimpan.", durable: false }, { status: response.status });
    return NextResponse.json({ ...body, durable: true });
  } catch {
    return NextResponse.json({ error: "DB persistence tidak tersedia.", durable: false }, { status: 503 });
  }
}

export async function GET(request: NextRequest) {
  const base = dbUrl();
  if (!base) return NextResponse.json({ conversations: [], durable: false }, { status: 200 });
  try {
    const projectId = request.nextUrl.searchParams.get("projectId");
    const query = projectId ? `?project_id=${encodeURIComponent(projectId)}` : "";
    const response = await fetch(`${base}/conversations${query}`, { headers: headers(request), cache: "no-store" });
    const body = await response.json().catch(() => []);
    if (!response.ok) return NextResponse.json({ error: "Conversation tidak dapat dimuat.", durable: false }, { status: response.status });
    return NextResponse.json({ conversations: body, durable: true });
  } catch {
    return NextResponse.json({ conversations: [], durable: false }, { status: 200 });
  }
}
