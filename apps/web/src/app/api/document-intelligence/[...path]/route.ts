const DOCUMENT_INTELLIGENCE_URL =
  process.env.DOCUMENT_INTELLIGENCE_URL ||
  process.env.NEXT_PUBLIC_DOCUMENT_INTELLIGENCE_URL ||
  "http://127.0.0.1:8083";

const INTERNAL_SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || "live-test-key";

type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

async function getPath(context: RouteContext): Promise<string> {
  const params = await context.params;
  return (params.path ?? []).map(encodeURIComponent).join("/");
}

async function proxyDocumentIntelligence(request: Request, context: RouteContext): Promise<Response> {
  const path = await getPath(context);
  const url = new URL(request.url);
  const target = `${DOCUMENT_INTELLIGENCE_URL.replace(/\/+$/, "")}/${path}${url.search}`;

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  for (const name of ["range", "if-range", "if-none-match"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("X-Internal-Key", process.env.INTERNAL_SERVICE_KEY || INTERNAL_SERVICE_KEY);
  headers.set("X-User-Id", process.env.PAAX_PORTABLE_ACTOR_ID?.trim() || "paax-web");

  const method = request.method.toUpperCase();
  const body = method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();
  const upstream = await fetch(target, {
    method,
    headers,
    body,
    cache: "no-store",
  });

  const responseHeaders = new Headers();
  for (const name of ["content-type", "content-length", "content-range", "accept-ranges", "etag", "cache-control"]) {
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
  return proxyDocumentIntelligence(request, context);
}

export async function POST(request: Request, context: RouteContext) {
  return proxyDocumentIntelligence(request, context);
}
