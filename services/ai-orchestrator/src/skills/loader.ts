import { createHash } from "node:crypto";
import { lstat, open, readdir, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { parseSkillDocument, type ParsedSkillDocument } from "./format";
import type { LoadedSkill, SkillLoader, SkillLoaderOptions, SkillMetadata, SkillProvenance, SkillRootConfig, SkillSummary } from "./types";

export class SkillLoadError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "SkillLoadError";
  }
}

interface SkillFile {
  readonly root: SkillRootConfig;
  readonly rootRealpath: string;
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly parsed: ParsedSkillDocument;
}

function safePositive(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && Number.isInteger(value) && (value as number) > 0 ? Math.floor(value as number) : fallback;
}

function validName(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,64}$/u.test(value) && !value.includes("..");
}

function inside(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return !isAbsolute(path) && path !== ".." && !path.startsWith("..\\") && !path.startsWith("../");
}

async function readBounded(path: string, maxBytes: number, signal?: AbortSignal): Promise<string> {
  const handle = await open(path, "r");
  try {
    const buffer = new Uint8Array(new ArrayBuffer(maxBytes + 1));
    let offset = 0;
    while (offset < buffer.length) {
      if (signal?.aborted) throw new SkillLoadError("aborted", "skill read aborted");
      const result = await handle.read(buffer, offset, buffer.length - offset, offset);
      if (result.bytesRead === 0) break;
      offset += result.bytesRead;
    }
    if (offset > maxBytes) throw new SkillLoadError("skill_body_too_large", "skill file exceeds bounded read limit");
    return Buffer.from(buffer.subarray(0, offset)).toString("utf8");
  } finally {
    await handle.close();
  }
}

async function readFrontmatterPrefix(path: string, maxBytes: number, signal?: AbortSignal): Promise<string> {
  const handle = await open(path, "r");
  try {
    const buffer = new Uint8Array(new ArrayBuffer(maxBytes + 1));
    let offset = 0;
    while (offset < buffer.length) {
      if (signal?.aborted) throw new SkillLoadError("aborted", "skill read aborted");
      const result = await handle.read(buffer, offset, buffer.length - offset, offset);
      if (result.bytesRead === 0) break;
      offset += result.bytesRead;
    }
    const text = Buffer.from(buffer.subarray(0, offset)).toString("utf8");
    const closing = text.indexOf("\n---\n", 4);
    if (closing < 0 && offset > maxBytes) throw new SkillLoadError("metadata_too_large", "skill metadata exceeds limit");
    return closing >= 0 ? text.slice(0, closing + "\n---\n".length) : text;
  } finally {
    await handle.close();
  }
}

function provenance(rootId: string, relativePath: string, content: string): SkillProvenance {
  return { rootId, relativePath, sha256: createHash("sha256").update(content, "utf8").digest("hex"), bytes: Buffer.byteLength(content, "utf8") };
}

export class FileSkillLoader implements SkillLoader {
  private readonly maxMetadataBytes: number;
  private readonly maxBodyBytes: number;

  constructor(private readonly options: SkillLoaderOptions) {
    this.maxMetadataBytes = safePositive(options.maxMetadataBytes, 16_000);
    this.maxBodyBytes = safePositive(options.maxBodyBytes, 128_000);
    if (!options.roots.length) throw new SkillLoadError("roots_required", "at least one explicit skill root is required");
  }

  async list(): Promise<readonly SkillSummary[]> {
    const files = await this.discover();
    const names = new Set<string>();
    const summaries: SkillSummary[] = [];
    for (const file of files) {
      if (names.has(file.parsed.metadata.name)) throw new SkillLoadError("duplicate_skill_name", "skill name is duplicated");
      names.add(file.parsed.metadata.name);
      summaries.push(Object.freeze({ ...file.parsed.metadata, provenance: provenance(file.root.id, file.relativePath, await readFrontmatterPrefix(file.absolutePath, this.maxMetadataBytes)) }));
    }
    return Object.freeze(summaries.sort((a, b) => a.name.localeCompare(b.name)));
  }

  async view(input: string | { name: string; maxBodyBytes?: number; signal?: AbortSignal }): Promise<LoadedSkill> {
    const name = typeof input === "string" ? input : input.name;
    const signal = typeof input === "string" ? undefined : input.signal;
    const maxBodyBytes = safePositive(typeof input === "string" ? undefined : input.maxBodyBytes, this.maxBodyBytes);
    if (!validName(name)) throw new SkillLoadError("unsafe_skill_name", "skill name is unsafe");
    const files = await this.discover();
    const matches = files.filter((file) => file.parsed.metadata.name === name);
    if (matches.length === 0) throw new SkillLoadError("skill_not_found", "skill is not available");
    if (matches.length > 1) throw new SkillLoadError("duplicate_skill_name", "skill name is duplicated");
    const file = matches[0];
    // Include a small delimiter/encoding margin so a body exactly at its
    // configured limit is not rejected because of frontmatter overhead.
    const content = await readBounded(file.absolutePath, this.maxMetadataBytes + maxBodyBytes + 256, signal);
    const parsed = parseSkillDocument(content, { maxMetadataBytes: this.maxMetadataBytes, maxBodyBytes });
    return Object.freeze({ metadata: parsed.metadata, body: parsed.body, trusted: parsed.metadata.trust === "trusted" && parsed.metadata.pinned, provenance: provenance(file.root.id, file.relativePath, content) });
  }

  private async discover(): Promise<readonly SkillFile[]> {
    const files: SkillFile[] = [];
    for (const root of this.options.roots) {
      const rootRealpath = await this.resolveRoot(root);
      const entries = await readdir(rootRealpath, { withFileTypes: true });
      const candidates: Array<{ absolutePath: string; relativePath: string }> = [];
      if (entries.some((entry) => entry.name === "SKILL.md" && entry.isFile())) candidates.push({ absolutePath: resolve(rootRealpath, "SKILL.md"), relativePath: "SKILL.md" });
      for (const entry of entries.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
        if (!validName(entry.name)) continue;
        candidates.push({ absolutePath: resolve(rootRealpath, entry.name, "SKILL.md"), relativePath: `${entry.name}/SKILL.md` });
      }
      for (const candidate of candidates) {
        try {
          const fileInfo = await lstat(candidate.absolutePath);
          if (!fileInfo.isFile() || fileInfo.isSymbolicLink()) continue;
          const target = await realpath(candidate.absolutePath);
          if (!inside(rootRealpath, target) || resolve(target) !== resolve(candidate.absolutePath)) continue;
          const metadataText = await readFrontmatterPrefix(target, this.maxMetadataBytes);
          const parsed = parseSkillDocument(metadataText, { maxMetadataBytes: this.maxMetadataBytes, maxBodyBytes: this.maxBodyBytes });
          files.push({ root, rootRealpath, absolutePath: target, relativePath: candidate.relativePath, parsed });
        } catch (error) {
          if (error instanceof SkillLoadError && error.code === "skill_body_too_large") throw error;
          if (error instanceof SkillLoadError && error.code === "metadata_too_large") throw error;
        }
      }
    }
    return Object.freeze(files);
  }

  private async resolveRoot(root: SkillRootConfig): Promise<string> {
    if (!root.id.trim() || !root.root.trim() || !isAbsolute(root.root)) throw new SkillLoadError("root_invalid", "skill root must be an absolute path");
    try {
      const info = await stat(root.root);
      if (!info.isDirectory()) throw new SkillLoadError("root_invalid", "skill root is not a directory");
      return await realpath(root.root);
    } catch (error) {
      if (error instanceof SkillLoadError) throw error;
      throw new SkillLoadError("root_unavailable", "skill root is unavailable");
    }
  }
}

export function createSkillLoader(options: SkillLoaderOptions): SkillLoader {
  return new FileSkillLoader(options);
}
