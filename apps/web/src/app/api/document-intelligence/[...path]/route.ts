import { getPortableServiceKey } from "@/lib/portable-service-auth";

const DOCUMENT_INTELLIGENCE_URL =
  process.env.DOCUMENT_INTELLIGENCE_URL ||
  process.env.NEXT_PUBLIC_DOCUMENT_INTELLIGENCE_URL ||
  "http://127.0.0.1:8083";

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
  const internalServiceKey = getPortableServiceKey();
  if (internalServiceKey) {
    headers.set("X-Internal-Key", internalServiceKey);
  }
  headers.set("X-User-Id", process.env.PAAX_PORTABLE_ACTOR_ID?.trim() || "local-desktop-user");

  const method = request.method.toUpperCase();
  const body = method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method,
      headers,
      body,
      cache: "no-store",
    });
  } catch (err) {
    // The hop to document-intelligence failed before a status existed
    // (connection refused, DNS, TLS, socket timeout). Log the hop without
    // leaking internal routing details (target URL, credentials) to the UI.
    const reason = err instanceof Error ? err.name : typeof err;
    console.error(
      `[document-intelligence proxy] upstream unreachable: path=/${path} reason=${reason}`
    );
    return new Response(
      JSON.stringify({ detail: "document intelligence service is unavailable" }),
      {
        status: 503,
        headers: { "content-type": "application/json" },
      }
    );
  }

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

export async function DELETE(request: Request, context: RouteContext) {
  return proxyDocumentIntelligence(request, context);
}
