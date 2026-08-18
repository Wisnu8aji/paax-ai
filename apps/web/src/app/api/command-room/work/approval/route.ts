import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveWorkApproval } from "../approval";
import { GatewayClientError, resolveGatewayApproval } from "../gateway-client";

const ApprovalSchema = z.object({
  sessionId: z.string().min(1),
  approvalId: z.string().min(1),
  decision: z.enum(["approved", "denied"]),
}).strict();

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = ApprovalSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Approval request tidak valid." }, { status: 400 });
  const mode = process.env.PAAX_COMMAND_ROOM_GATEWAY_MODE?.trim() || "service";
  if (mode === "service") {
    try {
      const result = await resolveGatewayApproval(parsed.data, { requestHeaders: new Headers(request.headers), signal: request.signal });
      return NextResponse.json(result);
    } catch (error) {
      const gatewayError = error instanceof GatewayClientError ? error : null;
      return NextResponse.json(
        { error: gatewayError?.message ?? "Gateway approval unavailable" },
        { status: gatewayError?.status && gatewayError.status >= 400 && gatewayError.status < 600 ? gatewayError.status : 503 },
      );
    }
  }
  if (mode !== "legacy") return NextResponse.json({ error: "Gateway mode tidak didukung." }, { status: 400 });
  const resolved = resolveWorkApproval(parsed.data.approvalId, parsed.data.sessionId, parsed.data.decision);
  if (!resolved) return NextResponse.json({ error: "Approval tidak ditemukan atau bukan milik session ini." }, { status: 404 });
  return NextResponse.json({ ok: true, approvalId: parsed.data.approvalId, decision: parsed.data.decision });
}
