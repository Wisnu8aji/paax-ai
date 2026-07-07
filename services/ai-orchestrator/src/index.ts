import cors from "cors";
import express from "express";

import { loadConfig } from "./config";
import { createChatHandler } from "./routes/chat";
import { createStreamHandler } from "./routes/stream";
import { healthHandler } from "./routes/health";

const config = loadConfig();
const app = express();
app.use(cors());
app.use(express.json());

// Simple token bucket rate limiter per project_id or IP
const RATE_LIMIT = Number(process.env.RATE_LIMIT_PER_MINUTE || 30);
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function rateLimiter(req: express.Request, res: express.Response, next: express.NextFunction) {
  const key = req.body?.project_id || req.ip || "global";
  const now = Date.now();
  let record = rateLimitMap.get(key);
  if (!record || now > record.resetTime) {
    record = { count: 0, resetTime: now + 60000 };
  }
  record.count += 1;
  rateLimitMap.set(key, record);

  if (record.count > RATE_LIMIT) {
    const retryAfter = Math.ceil((record.resetTime - now) / 1000);
    res.setHeader("Retry-After", String(retryAfter));
    return res.status(429).json({ error: "Terlalu banyak request, silakan coba lagi nanti." });
  }
  next();
}

app.get("/health", healthHandler);

app.post(
  "/chat",
  rateLimiter,
  createChatHandler({
    geminiApiKey: config.geminiApiKey,
    coreEngineUrl: config.coreEngineUrl,
    documentIntelligenceUrl: config.documentIntelligenceUrl,
    maxTurns: config.maxToolTurns,
  }),
);

app.post(
  "/chat/stream",
  rateLimiter,
  createStreamHandler({
    geminiApiKey: config.geminiApiKey,
    coreEngineUrl: config.coreEngineUrl,
    documentIntelligenceUrl: config.documentIntelligenceUrl,
    maxTurns: config.maxToolTurns,
  }),
);

app.listen(config.port, () => {
  console.log(`AI Orchestrator berjalan di port ${config.port}`);
});
