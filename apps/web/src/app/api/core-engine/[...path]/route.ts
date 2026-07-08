const CORE_ENGINE_UPSTREAM_URL =
  process.env.CORE_ENGINE_URL ||
  process.env.NEXT_PUBLIC_CORE_ENGINE_URL ||
  "http://127.0.0.1:8081";

const INTERNAL_SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || "test-internal-key";

type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

async function getPath(context: RouteContext): Promise<string> {
  const params = await context.params;
  return (params.path ?? []).map(encodeURIComponent).join("/");
}

async function proxyCoreEngine(request: Request, context: RouteContext): Promise<Response> {
  const path = await getPath(context);
  const url = new URL(request.url);
  const target = `${CORE_ENGINE_UPSTREAM_URL.replace(/\/+$/, "")}/${path}${url.search}`;

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  headers.set("X-Internal-Key", INTERNAL_SERVICE_KEY);
  headers.set("X-User-Id", "paax-web");

  const method = request.method.toUpperCase();
  const body = method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();
  const upstream = await fetch(target, {
    method,
    headers,
    body,
    cache: "no-store",
  });

  const responseHeaders = new Headers();
  const upstreamContentType = upstream.headers.get("content-type");
  if (upstreamContentType) responseHeaders.set("content-type", upstreamContentType);

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export async function GET(request: Request, context: RouteContext) {
  return proxyCoreEngine(request, context);
}

export async function POST(request: Request, context: RouteContext) {
  return proxyCoreEngine(request, context);
}
