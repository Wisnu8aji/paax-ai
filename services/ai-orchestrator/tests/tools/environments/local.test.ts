import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LocalEnvironment, type LocalEnvironmentOptions } from "../../../src/tools/environments/local";
import type { EnvironmentAuditRecord, EnvironmentRequest } from "../../../src/tools/environments/base";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "paax-local-environment-"));
  roots.push(root);
  const outside = await mkdtemp(join(tmpdir(), "paax-local-environment-outside-"));
  roots.push(outside);
  await mkdir(join(root, "nested"));
  await writeFile(join(root, "README.md"), "needle one\nneedle two\n", "utf8");
  await writeFile(join(root, "nested", "notes.txt"), "nested needle\n", "utf8");
  await writeFile(join(root, ".env.local"), "SECRET=must-not-leak\n", "utf8");
  await writeFile(join(outside, "outside.txt"), "outside\n", "utf8");
  await symlink(outside, join(root, "outside-link"), "junction");
  return { root, outside };
}

function auditContext(overrides: Partial<EnvironmentRequest["audit"]> = {}): EnvironmentRequest["audit"] {
  return {
    runId: "run-local",
    toolCallId: "tool-local",
    invocationId: "inv-local",
    actor: "agent",
    ...overrides,
  };
}

function request(partial: Partial<EnvironmentRequest>): EnvironmentRequest {
  return {
    operation: "read",
    permission: "workspace_read",
    path: "README.md",
    audit: auditContext(),
    ...partial,
  };
}

function options(root: string, audit: EnvironmentAuditRecord[], extra: Partial<LocalEnvironmentOptions> = {}): LocalEnvironmentOptions {
  return {
    root,
    auditSink: { append: (record) => { audit.push(record); } },
    now: () => "2026-08-18T00:00:00.000Z",
    auditIdFactory: (() => {
      let index = 0;
      return () => `audit-${++index}`;
    })(),
    ...extra,
  };
}

describe("LocalEnvironment", () => {
  it("reads and lists only within its bounded capability scope", async () => {
    const { root } = await fixture();
    const audit: EnvironmentAuditRecord[] = [];
    const environment = new LocalEnvironment(options(root, audit));

    expect(environment.permissions).toEqual(new Set([
      "workspace_list",
      "workspace_read",
      "workspace_search",
      "read_only_command",
    ]));
    expect(environment.scope.root).toBe(root);
    expect(environment.isolation).toMatchObject({ backend: "local", readOnly: true, network: "none", processPerCall: true });

    const read = await environment.execute(request({}));
    const list = await environment.execute(request({ operation: "list", permission: "workspace_list", path: "." }));

    expect(read).toMatchObject({ ok: true, decision: "allowed", value: { content: expect.stringContaining("needle one") } });
    expect(list).toMatchObject({ ok: true, decision: "allowed", value: { entries: expect.arrayContaining([{ name: "README.md", kind: "file" }]) } });
    expect(audit).toHaveLength(2);
    expect(audit.every((record) => record.decision === "allowed" && record.runId === "run-local" && record.invocationId === "inv-local")).toBe(true);
  });

  it("denies traversal, absolute outside paths, protected paths, and symlink escapes", async () => {
    const { root, outside } = await fixture();
    const audit: EnvironmentAuditRecord[] = [];
    const environment = new LocalEnvironment(options(root, audit));

    const results = await Promise.all([
      environment.execute(request({ path: "../outside.txt" })),
      environment.execute(request({ path: join(outside, "outside.txt") })),
      environment.execute(request({ path: ".env.local" })),
      environment.execute(request({ path: "outside-link/outside.txt" })),
    ]);

    expect(results[0]).toMatchObject({ ok: false, decision: "path_outside_scope" });
    expect(results[1]).toMatchObject({ ok: false, decision: "path_outside_scope" });
    expect(results[2]).toMatchObject({ ok: false, decision: "protected_path" });
    expect(results[3]).toMatchObject({ ok: false, decision: "symlink_outside_scope" });
    expect(audit).toHaveLength(4);
    expect(JSON.stringify(results)).not.toContain("SECRET=must-not-leak");
  });

  it("enforces read, output, and search match limits", async () => {
    const { root } = await fixture();
    await writeFile(join(root, "large.txt"), "1234567890", "utf8");
    const audit: EnvironmentAuditRecord[] = [];
    const environment = new LocalEnvironment(options(root, audit, {
        scope: {
        maxReadBytes: 5,
      },
    }));
    const searchEnvironment = new LocalEnvironment(options(root, audit, {
      scope: {
        maxOutputChars: 5,
        maxSearchMatches: 1,
        maxSearchFiles: 20,
      },
    }));

    const tooLarge = await environment.execute(request({ path: "large.txt" }));
    const search = await searchEnvironment.execute(request({ operation: "search", permission: "workspace_search", query: "needle", path: ".", maxChars: 5 }));

    expect(tooLarge).toMatchObject({ ok: false, decision: "request_too_large", errorCode: "read_bytes_exceeded" });
    expect(search).toMatchObject({ ok: true, decision: "allowed", value: { matches: expect.any(Array) } });
    expect((search.value as { matches: unknown[] }).matches).toHaveLength(1);
    expect(JSON.stringify(search.value)).not.toContain("needle one");
  });

  it("allows only fixed read-only commands and never treats approval as a shell escape", async () => {
    const { root } = await fixture();
    const audit: EnvironmentAuditRecord[] = [];
    const runner = vi.fn(async (executable: string, args: readonly string[]) => ({ stdout: `${executable} ${args.join(" ")}`, stderr: "" }));
    const environment = new LocalEnvironment(options(root, audit, { commandRunner: runner }));

    const pwd = await environment.execute(request({ operation: "command", permission: "read_only_command", command: "pwd" }));
    const version = await environment.execute(request({ operation: "command", permission: "read_only_command", command: "node --version" }));
    const denied = await environment.execute(request({ operation: "command", permission: "read_only_command", command: "Remove-Item README.md" }));
    const injected = await environment.execute(request({ operation: "command", permission: "read_only_command", command: "pwd; Remove-Item README.md" }));

    expect(pwd).toMatchObject({ ok: true, decision: "allowed", value: { stdout: expect.stringContaining(root) } });
    expect(version).toMatchObject({ ok: true, decision: "allowed", value: { stdout: expect.stringContaining("node") } });
    expect(denied).toMatchObject({ ok: false, decision: "command_not_allowlisted" });
    expect(injected).toMatchObject({ ok: false, decision: "command_not_allowlisted" });
    expect(runner).toHaveBeenCalledTimes(1);
    expect(await readFile(join(root, "README.md"), "utf8")).toContain("needle one");
  });

  it("records aborts and close prevents late command execution", async () => {
    const { root } = await fixture();
    const audit: EnvironmentAuditRecord[] = [];
    let release!: () => void;
    const runner = vi.fn((_executable: string, _args: readonly string[], runOptions: { signal: AbortSignal }) => new Promise<{ stdout: string; stderr: string }>((resolve) => {
      release = () => resolve({ stdout: "late", stderr: "" });
      runOptions.signal.addEventListener("abort", () => resolve({ stdout: "aborted", stderr: "" }), { once: true });
    }));
    const environment = new LocalEnvironment(options(root, audit, { commandRunner: runner }));

    const pending = environment.execute(request({ operation: "command", permission: "read_only_command", command: "node --version" }));
    await vi.waitFor(() => expect(runner).toHaveBeenCalledTimes(1));
    await environment.close();
    release();
    const aborted = await pending;
    const afterClose = await environment.execute(request({ operation: "command", permission: "read_only_command", command: "node --version" }));

    expect(aborted).toMatchObject({ ok: false, decision: "aborted" });
    expect(afterClose).toMatchObject({ ok: false, decision: "execution_failed", errorCode: "environment_closed" });
    expect(audit.map((record) => record.decision)).toEqual(["aborted", "execution_failed"]);
  });
});
