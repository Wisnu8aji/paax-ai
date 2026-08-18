import { createHash } from "node:crypto";
import { lstat, open, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { DEFAULT_PROTECTED_PATH_PATTERNS } from "../tools/environments/base";
import { scanUntrustedContent } from "../agentic/security";

export type ContextFileClass = "stable" | "volatile";

export interface ContextFileEntry {
  readonly relativePath: string;
  readonly class: ContextFileClass;
  readonly content: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly trusted: false;
  readonly injectionFindings: readonly string[];
}

export interface ContextFileSnapshot {
  readonly entries: readonly ContextFileEntry[];
  readonly stableHash: string;
  readonly totalBytes: number;
  readonly omitted: readonly { path: string; reason: string }[];
}

export interface ContextFileReadPort {
  read(input: { root: string; relativePath: string; maxBytes: number; signal?: AbortSignal }): Promise<{ content: string; truncated?: boolean }>;
}

export interface ContextFileSpec {
  readonly path: string;
  readonly class: ContextFileClass;
}

export interface ContextFileLoaderOptions {
  readonly stablePaths?: readonly string[];
  readonly volatilePaths?: readonly string[];
  readonly files?: readonly ContextFileSpec[];
  readonly allowedPaths?: readonly string[];
  readonly readPort?: ContextFileReadPort;
}

export interface ContextFileLoader {
  load(input: {
    root: string;
    signal?: AbortSignal;
    maxFileBytes: number;
    maxTotalBytes: number;
  }): Promise<ContextFileSnapshot>;
}

export const DEFAULT_CONTEXT_FILE_SPECS: readonly ContextFileSpec[] = Object.freeze([
  { path: "AGENTS.md", class: "stable" },
  { path: "CLAUDE.md", class: "stable" },
  { path: ".cursorrules", class: "stable" },
  { path: ".hermes/SOUL.md", class: "stable" },
  { path: ".hermes.md", class: "stable" },
]);

interface ConfiguredContextFile extends ContextFileSpec {
  readonly requestedPath: string;
}

interface ReadBoundedFileResult {
  readonly content: string;
  readonly truncated: boolean;
}

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n?/gu, "\n");
}

function normalizePath(value: string): string {
  return value.trim().replace(/\\/gu, "/").replace(/^\.\//u, "");
}

function unsafeRelativePath(value: string): boolean {
  const normalized = normalizePath(value);
  return !normalized
    || normalized.includes("\u0000")
    || isAbsolute(value)
    || /^[A-Za-z]:[\\/]/u.test(value)
    || normalized.startsWith("//")
    || normalized.split("/").some((part) => part === "..");
}

function comparablePath(value: string): string {
  const normalized = resolve(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function isInside(root: string, candidate: string): boolean {
  const relativePath = relative(comparablePath(root), comparablePath(candidate));
  return !isAbsolute(relativePath) && relativePath !== ".." && !relativePath.startsWith("..\\") && !relativePath.startsWith("../");
}

function matchesProtected(relativePath: string): boolean {
  return DEFAULT_PROTECTED_PATH_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(relativePath);
  });
}

function safeLimit(value: number): number | undefined {
  return Number.isFinite(value) && Number.isInteger(value) && value > 0 ? value : undefined;
}

function configuredFiles(options: ContextFileLoaderOptions): readonly ConfiguredContextFile[] {
  if (options.files) return options.files.map((file) => ({ ...file, requestedPath: file.path }));
  const stablePaths = options.stablePaths ?? DEFAULT_CONTEXT_FILE_SPECS.filter((file) => file.class === "stable").map((file) => file.path);
  const volatilePaths = options.volatilePaths ?? [];
  return [
    ...stablePaths.map((path) => ({ path, class: "stable" as const, requestedPath: path })),
    ...volatilePaths.map((path) => ({ path, class: "volatile" as const, requestedPath: path })),
  ];
}

function allowedPathSet(options: ContextFileLoaderOptions, files: readonly ConfiguredContextFile[]): ReadonlySet<string> {
  const paths = options.allowedPaths ?? files.map((file) => file.path);
  return new Set(paths.map(normalizePath));
}

function stableHash(entries: readonly ContextFileEntry[]): string {
  const hash = createHash("sha256").update("context-files-stable-v1\u0000", "utf8");
  for (const entry of entries.filter((item) => item.class === "stable").sort((a, b) => a.relativePath.localeCompare(b.relativePath))) {
    hash.update(entry.relativePath, "utf8").update("\u0000", "utf8").update(entry.content, "utf8").update("\u0000", "utf8");
  }
  return hash.digest("hex");
}

async function readFileBounded(absolutePath: string, maxBytes: number, signal?: AbortSignal): Promise<ReadBoundedFileResult> {
  const handle = await open(absolutePath, "r");
  try {
    const buffer = new Uint8Array(new ArrayBuffer(maxBytes + 1));
    let offset = 0;
    while (offset < buffer.length) {
      if (signal?.aborted) return { content: "", truncated: false };
      const result = await handle.read(buffer, offset, buffer.length - offset, offset);
      if (result.bytesRead === 0) break;
      offset += result.bytesRead;
    }
    const truncated = offset > maxBytes;
    return { content: normalizeNewlines(Buffer.from(buffer.subarray(0, Math.min(offset, maxBytes))).toString("utf8")), truncated };
  } finally {
    await handle.close();
  }
}

function omission(path: string, reason: string): { path: string; reason: string } {
  return { path, reason };
}

export class BoundedContextFileLoader implements ContextFileLoader {
  private readonly files: readonly ConfiguredContextFile[];
  private readonly allowedPaths: ReadonlySet<string>;

  constructor(private readonly options: ContextFileLoaderOptions = {}) {
    this.files = Object.freeze(configuredFiles(options));
    this.allowedPaths = allowedPathSet(options, this.files);
  }

  async load(input: { root: string; signal?: AbortSignal; maxFileBytes: number; maxTotalBytes: number }): Promise<ContextFileSnapshot> {
    const maxFileBytes = safeLimit(input.maxFileBytes);
    const maxTotalBytes = safeLimit(input.maxTotalBytes);
    const orderedFiles = [...this.files].sort((a, b) => normalizePath(a.path).localeCompare(normalizePath(b.path)) || a.class.localeCompare(b.class));
    const omitted: Array<{ path: string; reason: string }> = [];
    const entries: ContextFileEntry[] = [];
    let totalBytes = 0;

    if (!maxFileBytes || !maxTotalBytes) {
      return { entries: [], stableHash: stableHash([]), totalBytes: 0, omitted: orderedFiles.map((file) => omission(file.requestedPath, "invalid_limit")) };
    }

    const root = typeof input.root === "string" && isAbsolute(input.root) ? input.root : undefined;
    let rootRealpath: string | undefined;
    if (root) {
      try {
        const rootInfo = await stat(root);
        if (rootInfo.isDirectory()) rootRealpath = await realpath(root);
      } catch {
        rootRealpath = undefined;
      }
    }

    for (const file of orderedFiles) {
      const requestedPath = file.requestedPath;
      if (input.signal?.aborted) {
        omitted.push(omission(requestedPath, "aborted"));
        continue;
      }
      const relativePath = normalizePath(file.path);
      if (unsafeRelativePath(file.path)) {
        omitted.push(omission(requestedPath, "unsafe_path"));
        continue;
      }
      if (!this.allowedPaths.has(relativePath)) {
        omitted.push(omission(requestedPath, "not_allowlisted"));
        continue;
      }
      if (!rootRealpath) {
        omitted.push(omission(requestedPath, "root_invalid"));
        continue;
      }
      if (matchesProtected(relativePath)) {
        omitted.push(omission(requestedPath, "protected_path"));
        continue;
      }
      if (totalBytes >= maxTotalBytes) {
        omitted.push(omission(requestedPath, "total_bytes_exceeded"));
        continue;
      }

      const absolutePath = resolve(rootRealpath, relativePath);
      if (!isInside(rootRealpath, absolutePath)) {
        omitted.push(omission(requestedPath, "path_outside_root"));
        continue;
      }

      try {
        let read: ReadBoundedFileResult;
        if (this.options.readPort) {
          const portResult = await this.options.readPort.read({ root: rootRealpath, relativePath, maxBytes: Math.min(maxFileBytes, maxTotalBytes - totalBytes), signal: input.signal });
          const normalized = normalizeNewlines(portResult.content);
          const bytes = Buffer.byteLength(normalized, "utf8");
          const limit = Math.min(maxFileBytes, maxTotalBytes - totalBytes);
          read = { content: Buffer.from(normalized, "utf8").subarray(0, limit).toString("utf8"), truncated: Boolean(portResult.truncated) || bytes > limit };
        } else {
          const info = await lstat(absolutePath);
          if (info.isSymbolicLink()) {
            omitted.push(omission(requestedPath, "symlink_not_allowed"));
            continue;
          }
          if (!info.isFile()) {
            omitted.push(omission(requestedPath, "not_file"));
            continue;
          }
          const targetRealpath = await realpath(absolutePath);
          if (!isInside(rootRealpath, targetRealpath) || comparablePath(targetRealpath) !== comparablePath(absolutePath)) {
            omitted.push(omission(requestedPath, "symlink_not_allowed"));
            continue;
          }
          read = await readFileBounded(targetRealpath, Math.min(maxFileBytes, maxTotalBytes - totalBytes), input.signal);
        }
        if (input.signal?.aborted) {
          omitted.push(omission(requestedPath, "aborted"));
          continue;
        }
        const content = read.content;
        const bytes = Buffer.byteLength(content, "utf8");
        const findings = scanUntrustedContent(content);
        entries.push(Object.freeze({
          relativePath,
          class: file.class,
          content,
          bytes,
          sha256: createHash("sha256").update(content, "utf8").digest("hex"),
          trusted: false,
          injectionFindings: Object.freeze([...findings]),
        }));
        totalBytes += bytes;
      } catch (error) {
        const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "unreadable";
        omitted.push(omission(requestedPath, code === "ENOENT" ? "missing" : "unreadable"));
      }
    }

    const sortedEntries = Object.freeze(entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath)));
    return Object.freeze({
      entries: sortedEntries,
      stableHash: stableHash(sortedEntries),
      totalBytes,
      omitted: Object.freeze(omitted),
    });
  }
}

export function createContextFileLoader(options: ContextFileLoaderOptions = {}): ContextFileLoader {
  return new BoundedContextFileLoader(options);
}
