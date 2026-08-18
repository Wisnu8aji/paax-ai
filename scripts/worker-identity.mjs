import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MANIFEST_RELATIVE_PATH = "data/portable/worker-manifest.json";
export const WORKER_MANIFEST_SCHEMA = 1;

export const SCOPE_PATTERNS = Object.freeze([
  "services/ai-orchestrator/src/**/*.ts",
  "services/ai-orchestrator/package.json",
  "services/ai-orchestrator/tsconfig.json",
  "services/ai-orchestrator/vitest.config.ts",
  "apps/web/src/app/(dashboard)/command-room/**",
  "apps/web/src/components/command-room/**",
  "apps/web/src/app/api/command-room/**",
  "apps/web/src/lib/command-room/**",
  "apps/web/src/lib/chat/**",
  "apps/web/src/lib/ai/**",
  "apps/web/src/lib/paax-models.ts",
  "packages/schemas/src/**",
  "docs/ai-map/WORKER_IDENTITY.md",
  "docs/ai-map/ARCHITECTURE_LAYERS.md",
  "docs/ai-map/DIRECTORY_MAP.md",
  "scripts/worker-identity.mjs",
]);

export const EXCLUDE_PATTERNS = Object.freeze([
  "node_modules",
  ".next",
  ".git",
  "graphify-out",
  "dist",
  "build",
  ".local-runtime",
  ".local-test-logs",
  "data/**",
  "*.log",
  ".env*",
  "pnpm-lock.yaml",
  MANIFEST_RELATIVE_PATH,
  "agent-runs.json",
]);

const EXCLUDED_DIRECTORY_NAMES = new Set([
  "node_modules",
  ".next",
  ".git",
  "graphify-out",
  "dist",
  "build",
  ".local-runtime",
  ".local-test-logs",
]);

const BINARY_EXTENSIONS = new Set([
  ".7z",
  ".avi",
  ".bmp",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".mkv",
  ".mov",
  ".mp3",
  ".mp4",
  ".pdf",
  ".png",
  ".svg",
  ".tar",
  ".wav",
  ".webp",
  ".zip",
]);

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function normalizeRelativePath(root, absolutePath) {
  return toPosix(path.relative(root, absolutePath));
}

function isExcluded(relativePath) {
  const normalized = toPosix(relativePath);
  const segments = normalized.split("/");
  const basename = segments.at(-1) ?? "";
  const extension = path.extname(basename).toLowerCase();

  if (segments.some((segment) => EXCLUDED_DIRECTORY_NAMES.has(segment))) {
    return true;
  }
  if (normalized === MANIFEST_RELATIVE_PATH || normalized.startsWith("data/")) {
    return true;
  }
  if (basename === "pnpm-lock.yaml" || basename === "agent-runs.json") {
    return true;
  }
  if (basename.startsWith(".env") || basename.endsWith(".log")) {
    return true;
  }
  return BINARY_EXTENSIONS.has(extension);
}

function globToRegExp(pattern) {
  let expression = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "*" && pattern[index + 1] === "*") {
      if (pattern[index + 2] === "/") {
        expression += "(?:.*/)?";
        index += 2;
      } else {
        expression += ".*";
        index += 1;
      }
      continue;
    }
    if (character === "*") {
      expression += "[^/]*";
      continue;
    }
    if (character === "?") {
      expression += "[^/]";
      continue;
    }
    expression += character.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
  }
  return new RegExp(`${expression}$`);
}

function walkDirectory(root, directory, output) {
  if (!existsSync(directory)) {
    return;
  }

  const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = normalizeRelativePath(root, absolutePath);
    if (isExcluded(relativePath)) {
      continue;
    }
    if (entry.isDirectory()) {
      walkDirectory(root, absolutePath, output);
    } else if (entry.isFile()) {
      output.push(absolutePath);
    }
  }
}

function patternRoot(root, pattern) {
  const wildcardIndex = pattern.search(/[?*]/);
  const relativeRoot = wildcardIndex === -1
    ? pattern
    : pattern.slice(0, wildcardIndex).replace(/\/$/, "");
  return path.resolve(root, relativeRoot || ".");
}

export function collectScopedFiles(rootDirectory) {
  const root = path.resolve(rootDirectory);
  const collected = new Map();

  for (const pattern of SCOPE_PATTERNS) {
    const matcher = globToRegExp(pattern);
    const absolutePatternRoot = patternRoot(root, pattern);
    if (pattern.search(/[?*]/) === -1) {
      if (existsSync(absolutePatternRoot)) {
        const relativePath = normalizeRelativePath(root, absolutePatternRoot);
        if (!isExcluded(relativePath) && statSync(absolutePatternRoot).isFile()) {
          collected.set(relativePath, absolutePatternRoot);
        }
      }
      continue;
    }

    const candidates = [];
    walkDirectory(root, absolutePatternRoot, candidates);
    for (const candidate of candidates) {
      const relativePath = normalizeRelativePath(root, candidate);
      if (matcher.test(relativePath) && !isExcluded(relativePath)) {
        collected.set(relativePath, candidate);
      }
    }
  }

  return [...collected.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, absolutePath]) => absolutePath);
}

function hashFile(absolutePath) {
  return createHash("sha256").update(readFileSync(absolutePath)).digest("hex");
}

function readJsonIfPresent(root, relativePath) {
  const absolutePath = path.resolve(root, relativePath);
  if (!existsSync(absolutePath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(absolutePath, "utf8"));
  } catch {
    return null;
  }
}

function graphStats(root, relativePath) {
  const graph = readJsonIfPresent(root, relativePath);
  return {
    nodes: Array.isArray(graph?.nodes) ? graph.nodes.length : 0,
    edges: Array.isArray(graph?.links)
      ? graph.links.length
      : Array.isArray(graph?.edges)
        ? graph.edges.length
        : 0,
  };
}

function currentGitCommit(root) {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

function workerVersion(root) {
  const packageJson = readJsonIfPresent(root, "services/ai-orchestrator/package.json");
  return typeof packageJson?.version === "string" ? packageJson.version : "0.1.0";
}

function resolveManifestPath(root, manifestPath) {
  return path.resolve(root, manifestPath ?? MANIFEST_RELATIVE_PATH);
}

function collectFileHashes(root) {
  const files = {};
  let totalBytes = 0;
  for (const absolutePath of collectScopedFiles(root)) {
    const relativePath = normalizeRelativePath(root, absolutePath);
    const bytes = statSync(absolutePath).size;
    files[relativePath] = hashFile(absolutePath);
    totalBytes += bytes;
  }
  return { files, totalBytes };
}

export function generateManifest({ rootDirectory = process.cwd(), manifestPath } = {}) {
  const root = path.resolve(rootDirectory);
  const outputPath = resolveManifestPath(root, manifestPath);
  const { files, totalBytes } = collectFileHashes(root);
  const manifest = {
    manifestSchema: WORKER_MANIFEST_SCHEMA,
    artifact: "paax-command-room-worker",
    version: workerVersion(root),
    provenance: {
      gitCommit: currentGitCommit(root),
      generatedAt: new Date().toISOString(),
    },
    graphify: {
      "ai-orchestrator": graphStats(root, "services/ai-orchestrator/graphify-out/graph.json"),
      web: graphStats(root, "apps/web/graphify-out/graph.json"),
    },
    scope: [...SCOPE_PATTERNS],
    exclude: [...EXCLUDE_PATTERNS],
    files,
    counts: {
      totalFiles: Object.keys(files).length,
      totalBytes,
    },
  };

  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

export function verifyManifest({ rootDirectory = process.cwd(), manifestPath } = {}) {
  const root = path.resolve(rootDirectory);
  const outputPath = resolveManifestPath(root, manifestPath);
  if (!existsSync(outputPath)) {
    throw new Error(`manifest not found: ${normalizeRelativePath(root, outputPath)}`);
  }

  const manifest = JSON.parse(readFileSync(outputPath, "utf8"));
  const actual = collectFileHashes(root).files;
  const expected = manifest.files ?? {};
  const missing = Object.keys(expected).filter((relativePath) => !(relativePath in actual));
  const unexpected = Object.keys(actual).filter((relativePath) => !(relativePath in expected));
  const mismatch = Object.keys(expected).filter(
    (relativePath) => relativePath in actual && actual[relativePath] !== expected[relativePath],
  );
  const match = Object.keys(expected).filter(
    (relativePath) => relativePath in actual && actual[relativePath] === expected[relativePath],
  );

  return { manifest, missing, unexpected, mismatch, match };
}

function runCli() {
  const command = process.argv[2];
  if (command === "generate") {
    const manifest = generateManifest();
    console.log(
      `generated ${manifest.counts.totalFiles} files, ${manifest.counts.totalBytes} bytes `
      + `at ${MANIFEST_RELATIVE_PATH}`,
    );
    return;
  }

  if (command === "verify") {
    try {
      const result = verifyManifest();
      console.log(
        `missing=${JSON.stringify(result.missing)} `
        + `unexpected=${JSON.stringify(result.unexpected)} `
        + `mismatch=${JSON.stringify(result.mismatch)} `
        + `match=${result.match.length}`,
      );
      process.exitCode = result.missing.length || result.unexpected.length || result.mismatch.length
        ? 1
        : 0;
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
    return;
  }

  console.error("usage: node scripts/worker-identity.mjs <generate|verify>");
  process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli();
}
