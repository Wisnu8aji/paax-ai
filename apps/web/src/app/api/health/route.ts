import { NextResponse } from "next/server";
import path from "path";
import { execSync } from "child_process";

const START_TIME = new Date().toISOString();

export async function GET() {
  const repoRoot = process.env.PAAX_REPO_ROOT || path.resolve(process.cwd(), "../..");
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

  return NextResponse.json({
    status: "ok",
    service: "web",
    runtime_identity: {
      repo_root: repoRoot,
      commit,
      branch,
      dirty,
      service_name: "web",
      pid: process.pid,
      process_start_time: START_TIME,
      data_root: process.env.PAAX_DATA_ROOT || "G:\\PAAX-Data",
    },
  });
}
