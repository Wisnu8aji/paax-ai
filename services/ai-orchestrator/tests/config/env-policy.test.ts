import { describe, expect, it } from "vitest";
import {
  createEnvironmentPolicy,
  sanitizeProcessEnvironment,
} from "../../src/config/env-policy";

describe("PAAX Environment Policy (paax-env)", () => {
  it("allows safe PAAX and system variables while stripping secret variables", () => {
    const policy = createEnvironmentPolicy();
    const mockEnv = {
      PATH: "C:\\Windows\\system32",
      PAAX_TENANT_ID: "tenant-1",
      PAAX_PROFILE: "construction-pro",
      AWS_SECRET_ACCESS_KEY: "supersecret",
      DATABASE_PASSWORD: "secretpassword",
      RANDOM_UNAUTHORIZED_VAR: "dangerous",
    };

    const sanitized = policy.sanitize(mockEnv as any);

    expect(sanitized.PATH).toBe("C:\\Windows\\system32");
    expect(sanitized.PAAX_TENANT_ID).toBe("tenant-1");
    expect(sanitized.PAAX_PROFILE).toBe("construction-pro");
    expect(sanitized.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    expect(sanitized.DATABASE_PASSWORD).toBeUndefined();
    expect(sanitized.RANDOM_UNAUTHORIZED_VAR).toBeUndefined();
  });

  it("applies explicit environment overrides", () => {
    const policy = createEnvironmentPolicy({
      setEnvironment: {
        PAAX_RUNTIME_MODE: "codex-parity",
        CUSTOM_OVERRIDE: "active",
      },
    });

    const sanitized = policy.sanitize({});
    expect(sanitized.PAAX_RUNTIME_MODE).toBe("codex-parity");
    expect(sanitized.CUSTOM_OVERRIDE).toBe("active");
  });
});
