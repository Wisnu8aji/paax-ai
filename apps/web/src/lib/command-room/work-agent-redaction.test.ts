import { describe, expect, it } from "vitest";
import { redactWorkPayload } from "./work-agent-redaction";

describe("Work payload redaction", () => {
  it("removes credential-shaped keys recursively", () => {
    const safe = redactWorkPayload({
      command: "Get-ChildItem",
      headers: { Authorization: "Bearer secret-token", "x-api-key": "api-secret" },
      nested: { cookie: "session-cookie", password: "p@ss", visible: "ok" },
      privateKey: "-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----",
    }) as Record<string, unknown>;

    expect(safe).toMatchObject({
      command: "Get-ChildItem",
      nested: { visible: "ok" },
    });
    expect(JSON.stringify(safe)).not.toMatch(/secret|cookie|p@ss|private key/i);
  });

  it("caps long output without changing short technical values", () => {
    expect(redactWorkPayload({ text: "short", count: 2 })).toEqual({ text: "short", count: 2 });
    const capped = redactWorkPayload({ text: "x".repeat(40) }, 12) as Record<string, unknown>;
    expect(capped.text).toBe("xxxxxxxxxxx…");
  });

  it("does not expose secret-looking values in arrays", () => {
    const safe = redactWorkPayload([
      { name: "README.md" },
      { token: "token-value", result: "visible" },
    ]) as Array<Record<string, unknown>>;

    expect(safe).toEqual([{ name: "README.md" }, { result: "visible" }]);
  });
});
