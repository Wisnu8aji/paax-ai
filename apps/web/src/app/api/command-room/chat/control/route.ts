import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { steerTurn, stopTurn } from "../runtime-control";

export const runtime = "nodejs";

const ControlPayload = z.object({
  turnId: z.string().min(1).max(160),
  action: z.enum(["stop", "steer", "queue", "resume"]),
  message: z.string().max(8_000).optional(),
});

export async function POST(request: NextRequest) {
  const parsed = ControlPayload.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Control payload tidak valid." }, { status: 400 });
  const { turnId, action, message } = parsed.data;
  if (action === "stop") {
    stopTurn(turnId);
    return NextResponse.json({ turnId, status: "interrupted", resumable: true });
  }
  if (action === "steer") {
    if (!message?.trim()) return NextResponse.json({ error: "Pesan steer kosong." }, { status: 400 });
    steerTurn(turnId, message);
    return NextResponse.json({ turnId, status: "steer_queued" });
  }
  // Queue/resume are acknowledged as durable-intent commands. The browser
  // store owns FIFO ordering and sends the next turn only after the active
  // stream reaches a terminal state.
  return NextResponse.json({ turnId, status: action === "queue" ? "queued" : "resume_requested" });
}
