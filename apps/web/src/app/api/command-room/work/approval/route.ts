import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveWorkApproval } from "../approval";

const ApprovalSchema = z.object({
  sessionId: z.string().min(1),
  approvalId: z.string().min(1),
  decision: z.enum(["approved", "denied"]),
}).strict();

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = ApprovalSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Approval request tidak valid." }, { status: 400 });
  const resolved = resolveWorkApproval(parsed.data.approvalId, parsed.data.sessionId, parsed.data.decision);
  if (!resolved) return NextResponse.json({ error: "Approval tidak ditemukan atau bukan milik session ini." }, { status: 404 });
  return NextResponse.json({ ok: true, approvalId: parsed.data.approvalId, decision: parsed.data.decision });
}
