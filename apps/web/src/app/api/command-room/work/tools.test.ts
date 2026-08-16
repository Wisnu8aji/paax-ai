import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createWorkToolRegistry } from "./tools";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "paax-work-tool-"));
  temporaryRoots.push(root);
  await mkdir(join(root, "nested"));
  await writeFile(join(root, "README.md"), "agent workspace\nsecond line\n", "utf8");
  await writeFile(join(root, "nested", "notes.txt"), "needle appears here\n", "utf8");
  await writeFile(join(root, ".env.local"), "PAAX_API_KEY=do-not-expose\n", "utf8");
  return root;
}

function tool(registry: ReturnType<typeof createWorkToolRegistry>, name: string) {
  const found = registry.find((item) => item.declaration.name === name);
  if (!found) throw new Error(`missing tool ${name}`);
  return found;
}

describe("Work tool registry", () => {
  it("lists and reads only files under the configured workspace root", async () => {
    const root = await fixtureRoot();
    const registry = createWorkToolRegistry({ workspaceRoot: root });

    const listing = await tool(registry, "workspace_list").execute({ path: "." });
    expect(listing.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "README.md", kind: "file" }),
      expect.objectContaining({ name: "nested", kind: "directory" }),
    ]));

    const read = await tool(registry, "file_read").execute({ path: "README.md" });
    expect(read).toMatchObject({ path: "README.md", content: expect.stringContaining("agent workspace") });
  });

  it("searches text without leaving the configured root", async () => {
    const root = await fixtureRoot();
    const registry = createWorkToolRegistry({ workspaceRoot: root });
    const result = await tool(registry, "file_search").execute({ query: "needle" });

    expect(result.matches).toEqual([
      expect.objectContaining({ path: "nested/notes.txt", line: 1 }),
    ]);
    const escape = await tool(registry, "file_read").execute({ path: "../outside.txt" });
    expect(escape).toMatchObject({ error: expect.stringMatching(/workspace|root|outside/i) });
  });

  it("requires approval for commands outside the read-only terminal allowlist", async () => {
    const root = await fixtureRoot();
    const registry = createWorkToolRegistry({ workspaceRoot: root });
    const result = await tool(registry, "terminal_run").execute({ command: "Remove-Item README.md" });

    expect(result).toMatchObject({ approval_required: true, executed: false });
  });

  it("blocks protected files before content can enter a tool result", async () => {
    const root = await fixtureRoot();
    let approvalCalled = false;
    const registry = createWorkToolRegistry({
      workspaceRoot: root,
      requestApproval: async () => {
        approvalCalled = true;
        return true;
      },
    });

    const read = await tool(registry, "file_read").execute({ path: ".env.local" });
    const search = await tool(registry, "file_search").execute({ query: "PAAX_API_KEY" });
    const terminal = await tool(registry, "terminal_run").execute({ command: "Get-Content .env.local" });

    expect(read).toMatchObject({ error: expect.stringMatching(/protected|dilindungi/i) });
    expect(search.matches).toEqual([]);
    expect(terminal).toMatchObject({ error: expect.stringMatching(/protected|dilindungi/i) });
    expect(approvalCalled).toBe(false);
    expect(JSON.stringify({ read, search, terminal })).not.toContain("do-not-expose");
  });

  it("returns a task ledger and neutral extension catalog", async () => {
    const root = await fixtureRoot();
    const registry = createWorkToolRegistry({ workspaceRoot: root });
    const tasks = await tool(registry, "todo").execute({
      tasks: [{ id: "t1", title: "Inspect files", state: "in_progress" }],
    });
    const catalog = await tool(registry, "mcp_catalog").execute({});

    expect(tasks).toMatchObject({ tasks: [{ id: "t1", state: "in_progress" }] });
    expect(catalog).toHaveProperty("servers");
  });
});
