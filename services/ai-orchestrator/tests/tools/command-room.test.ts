import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createCommandRoomTools } from "../../src/tools/command-room";
import type { BaseEnvironment, EnvironmentRequest, EnvironmentResult } from "../../src/tools/environments/base";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function rootFixture() {
  const root = await mkdtemp(join(tmpdir(), "paax-command-room-tool-"));
  roots.push(root);
  await mkdir(join(root, "nested"));
  await writeFile(join(root, "README.md"), "workspace text\nneedle\n", "utf8");
  await writeFile(join(root, "nested", "notes.txt"), "needle appears here\n", "utf8");
  await writeFile(join(root, ".env.local"), "PAAX_API_KEY=do-not-expose\n", "utf8");
  return root;
}

function findTool(registry: ReturnType<typeof createCommandRoomTools>, name: string) {
  const found = registry.find((item) => item.declaration.name === name);
  if (!found) throw new Error(`missing tool ${name}`);
  return found;
}

describe("service-side Command Room safe tools", () => {
  it("lists, reads, and searches only bounded workspace content", async () => {
    const root = await rootFixture();
    const registry = createCommandRoomTools({ workspaceRoot: root });
    const listing = await findTool(registry, "workspace_list").execute({ path: "." });
    expect(listing.entries).toEqual(expect.arrayContaining([expect.objectContaining({ name: "README.md", kind: "file" })]));
    const read = await findTool(registry, "file_read").execute({ path: "README.md" });
    expect(read).toMatchObject({ path: "README.md", content: expect.stringContaining("workspace text") });
    const search = await findTool(registry, "file_search").execute({ query: "needle" });
    expect(search.matches).toHaveLength(2);
  });

  it("blocks traversal/protected paths and redacts secret-like content", async () => {
    const root = await rootFixture();
    const registry = createCommandRoomTools({ workspaceRoot: root });
    const read = await findTool(registry, "file_read").execute({ path: ".env.local" });
    const traversal = await findTool(registry, "file_read").execute({ path: "../outside.txt" });
    const terminal = await findTool(registry, "terminal_run").execute({ command: "Get-Content .env.local" });
    expect(read).toMatchObject({ error: expect.stringMatching(/dilindungi|workspace/i) });
    expect(traversal).toMatchObject({ error: expect.stringMatching(/luar|workspace/i) });
    expect(terminal).toMatchObject({ error: expect.stringMatching(/dilindungi/i) });
    expect(JSON.stringify({ read, terminal })).not.toContain("do-not-expose");
  });

  it("does not execute non-allowlisted commands or unavailable extension delegation", async () => {
    const root = await rootFixture();
    const registry = createCommandRoomTools({ workspaceRoot: root });
    const terminal = await findTool(registry, "terminal_run").execute({ command: "Remove-Item README.md" });
    const delegate = await findTool(registry, "delegate_task").execute({ task: "run child" });
    expect(terminal).toMatchObject({ approval_required: true, executed: false });
    expect(delegate).toMatchObject({ available: false, executed: false });
  });

  it("routes filesystem and command work through the injected environment boundary", async () => {
    const root = await rootFixture();
    const requests: EnvironmentRequest[] = [];
    const environment: BaseEnvironment = {
      permissions: new Set(["workspace_list", "workspace_read", "workspace_search", "read_only_command"]),
      scope: { root, protectedPathPatterns: [], maxReadBytes: 100, maxOutputChars: 100, maxSearchMatches: 10, allowSymlinks: false },
      isolation: { backend: "local", readOnly: true, network: "none", processPerCall: true },
      authorize: async () => ({ ok: true, decision: "allowed", auditId: "audit-authorize" }),
      execute: async <T>(request: EnvironmentRequest): Promise<EnvironmentResult<T>> => {
        requests.push(request);
        if (request.operation === "command") return { ok: false, decision: "command_not_allowlisted", errorCode: "command_not_allowlisted", auditId: "audit-command" };
        return { ok: true, decision: "allowed", value: { entries: [], path: "." } as T, auditId: "audit-filesystem" };
      },
      close: async () => undefined,
    };
    const registry = createCommandRoomTools({ workspaceRoot: root, environment });

    await findTool(registry, "workspace_list").execute({ path: "." }, { runId: "run-1", toolCallId: "list-1" });
    const command = await findTool(registry, "terminal_run").execute({ command: "Remove-Item README.md" }, { runId: "run-1", toolCallId: "command-1", approvalGranted: true });

    expect(requests.map((item) => item.operation)).toEqual(["list", "command"]);
    expect(requests[0].audit).toMatchObject({ runId: "run-1", toolCallId: "list-1" });
    expect(command).toMatchObject({ executed: false, errorCode: "command_not_allowlisted" });
  });
});
