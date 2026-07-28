// Proxy tipis ke DB API (services/db) untuk Drawing Intelligence Workspace (C9).
// Mengikuti pola apps/web/src/app/api/core-engine/[...path]/route.ts dan
// apps/web/src/app/api/document-intelligence/[...path]/route.ts — hanya
// meneruskan request, tidak pernah menghitung/mengubah data (Aturan Emas).

const DB_API_UPSTREAM_URL =
  process.env.DB_API_URL ||
  process.env.NEXT_PUBLIC_DB_API_URL ||
  "http://127.0.0.1:8001";

const INTERNAL_SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || "live-test-key";

type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

async function getPath(context: RouteContext): Promise<string> {
  const params = await context.params;
  return (params.path ?? []).map(encodeURIComponent).join("/");
}

async function proxyDbApi(request: Request, context: RouteContext): Promise<Response> {
  const path = await getPath(context);
  const url = new URL(request.url);
  const target = `${DB_API_UPSTREAM_URL.replace(/\/+$/, "")}/${path}${url.search}`;

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  headers.set("X-Internal-Key", INTERNAL_SERVICE_KEY);
  headers.set("X-User-Id", process.env.PAAX_PORTABLE_ACTOR_ID || "paax-web");

  const method = request.method.toUpperCase();
  const body = method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();
  const upstream = await fetch(target, {
    method,
    headers,
    body,
    cache: "no-store",
  });

  const responseHeaders = new Headers();
  for (const name of ["content-type", "content-disposition", "cache-control", "x-paax-source-page", "x-correlation-id"]) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export async function GET(request: Request, context: RouteContext) {
  return proxyDbApi(request, context);
}

export async function POST(request: Request, context: RouteContext) {
  return proxyDbApi(request, context);
}
