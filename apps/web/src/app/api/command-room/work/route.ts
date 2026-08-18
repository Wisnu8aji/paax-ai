import { NextResponse } from "next/server";
import { buildWorkCatalog } from "./catalog";
import { streamGatewayTurn, GatewayClientError } from "./gateway-client";
import { parseWorkRequest } from "./contract";
import { POST as chatPost } from "../chat/route";

export const runtime = "nodejs";
export const maxDuration = 600;

export async function POST(req: Request) {
  const mode = process.env.PAAX_COMMAND_ROOM_GATEWAY_MODE?.trim() || "service";
  if (mode === "legacy") return chatPost(req as never);
  const body = await req.json().catch(() => null);
  if (mode !== "service") {
    return NextResponse.json({ error: "Gateway mode tidak didukung." }, { status: 400 });
  }

  const parsed = parseWorkRequest(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Work request tidak valid.", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  try {
    const serviceResponse = await streamGatewayTurn({
      mode: "work",
      runId: parsed.data.runId,
      session: parsed.data.session,
      messages: parsed.data.messages,
      modelAlias: parsed.data.modelAlias,
      reasoningEffort: parsed.data.reasoningEffort,
      thinking: parsed.data.thinking,
      clientCorrelationId: parsed.data.clientCorrelationId,
    }, { requestHeaders: new Headers(req.headers), signal: req.signal });
    const headers = new Headers();
    for (const name of ["content-type", "cache-control", "connection"]) {
      const value = serviceResponse.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(serviceResponse.body, { status: serviceResponse.status, headers });
  } catch (error) {
    const gatewayError = error instanceof GatewayClientError ? error : null;
    return NextResponse.json(
      { error: gatewayError?.message ?? "Gateway service unavailable" },
      { status: gatewayError?.status && gatewayError.status >= 400 && gatewayError.status < 600 ? gatewayError.status : 503 },
    );
  }
}

/** Keep the Work endpoint neutral; provider/model inventories belong elsewhere. */
export async function GET() {
  return NextResponse.json(buildWorkCatalog());
}
