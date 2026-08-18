import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../../src/index";
import { loadConfig } from "../../src/config";

describe("legacy /api/chat compatibility contract", () => {
  it("registers /api/chat with the same safe fallback as /chat", async () => {
    const runtimeRoot = mkdtempSync(join(tmpdir(), "paax-api-chat-contract-"));
    const previousKey = process.env.INTERNAL_SERVICE_KEY;
    const previousCompat = process.env.PAAX_ENABLE_LEGACY_SINGLE_KEY_COMPAT;
    process.env.INTERNAL_SERVICE_KEY = "api-chat-test-key";
    process.env.PAAX_ENABLE_LEGACY_SINGLE_KEY_COMPAT = "1";

    const config = loadConfig({ PAAX_RUNTIME_HOME: runtimeRoot });
    const app = createApp({ config });
    const server = app.listen(0);
    const port = (server.address() as { port: number }).port;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Internal-Key": "api-chat-test-key", "X-User-Id": "api-chat-actor" },
        body: JSON.stringify({ message: "halo" }),
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        provider: "local-fallback",
        fallback: true,
        answer: "GEMINI_API_KEY belum disetel di ai-orchestrator.",
        tool_calls: [],
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await (app as typeof app & { locals: { paaxShutdown: () => Promise<void> } }).locals.paaxShutdown();
      if (previousKey === undefined) delete process.env.INTERNAL_SERVICE_KEY;
      else process.env.INTERNAL_SERVICE_KEY = previousKey;
      if (previousCompat === undefined) delete process.env.PAAX_ENABLE_LEGACY_SINGLE_KEY_COMPAT;
      else process.env.PAAX_ENABLE_LEGACY_SINGLE_KEY_COMPAT = previousCompat;
      await rm(runtimeRoot, { recursive: true, force: true });
    }
  });
});
