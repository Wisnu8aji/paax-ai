import { describe, expect, it } from "vitest";
import { DockerEnvironment } from "../../../src/tools/environments/docker";
import { SSHEnvironment } from "../../../src/tools/environments/ssh";
import type { EnvironmentRequest } from "../../../src/tools/environments/base";

const request: EnvironmentRequest = {
  operation: "read",
  permission: "workspace_read",
  path: "README.md",
  audit: {
    runId: "run-base",
    toolCallId: "tool-base",
    invocationId: "inv-base",
    actor: "agent",
  },
};

describe("execution environment contract", () => {
  it("fails closed for unsupported remote backends", async () => {
    const backends = [new DockerEnvironment(), new SSHEnvironment()];

    for (const backend of backends) {
      const result = await backend.execute(request);

      expect(result).toMatchObject({
        ok: false,
        decision: "unsupported_backend",
        errorCode: "unsupported_backend",
      });
      expect(result.auditId).toEqual(expect.any(String));
      await backend.close();
      await backend.close();
    }
  });
});
