import path from "path";
import { execSync } from "child_process";
import type { Request, Response } from "express";

const START_TIME = new Date().toISOString();

export function healthHandler(_req: Request, res: Response) {
  const repoRoot = process.env.PAAX_REPO_ROOT || (process.cwd().includes("services") ? path.resolve(process.cwd(), "../..") : process.cwd());
  let commit = process.env.PAAX_COMMIT || "";
  let branch = process.env.PAAX_BRANCH || "";
  let dirty = process.env.PAAX_DIRTY === "true" || process.env.PAAX_DIRTY === "1";

  if (!commit || !branch) {
    try {
      commit = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
    } catch {
      commit = "unknown";
    }
    try {
      branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
    } catch {
      branch = "unknown";
    }
    try {
      const dirtyOutput = execSync("git status --porcelain", { cwd: repoRoot, encoding: "utf8" }).trim();
      dirty = dirtyOutput.length > 0;
    } catch {
      dirty = false;
    }
  }

  return res.json({
    status: "ok",
    service: "ai-orchestrator",
    version: "0.1.0",
    runtime_identity: {
      repo_root: repoRoot,
      commit,
      branch,
      dirty,
      service_name: "ai-orchestrator",
      pid: process.pid,
      process_start_time: START_TIME,
      data_root: process.env.PAAX_DATA_ROOT || "D:\\paax-data",
    },
  });
}
