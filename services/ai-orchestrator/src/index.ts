import express from "express";

import { loadConfig } from "./config";
import { createChatHandler } from "./routes/chat";
import { healthHandler } from "./routes/health";

const config = loadConfig();
const app = express();

app.use(express.json({ limit: "1mb" }));
app.get("/health", healthHandler);
app.post("/chat", createChatHandler({
  geminiApiKey: config.geminiApiKey,
  coreEngineUrl: config.coreEngineUrl,
  maxTurns: config.maxToolTurns,
}));

app.listen(config.port, () => {
  console.log(`ai-orchestrator listening on ${config.port}`);
});
