import type { Request, Response } from "express";

export function healthHandler(_req: Request, res: Response) {
  return res.json({ status: "ok", service: "ai-orchestrator", version: "0.1.0" });
}
