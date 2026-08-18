import { isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { ToolDefinition } from "../tools/types";

export type PluginCapability = "tools" | "platform" | "provider" | "context" | "skills" | "hooks" | "middleware";

export interface PluginManifest {
  id: string;
  version: string;
  entry: string;
  enabled: boolean;
  capabilities: readonly PluginCapability[];
  permissions: readonly string[];
}

export interface PluginContribution {
  tools?: readonly ToolDefinition[];
  middleware?: readonly unknown[];
  hooks?: readonly unknown[];
}

export interface PluginModule {
  activate?: () => void | PluginContribution | Promise<void | PluginContribution>;
  deactivate?: () => void | Promise<void>;
  contributions?: PluginContribution;
}

export type PluginStatus = "discovered" | "loading" | "active" | "disabled" | "failed";

export interface PluginRecord {
  manifest: PluginManifest;
  status: PluginStatus;
  entryPath: string;
  errorCode?: "not_allowlisted" | "disabled" | "manifest_invalid" | "load_failed" | "contribution_invalid" | "lifecycle_failed";
}

export interface PluginAuditEvent {
  pluginId: string;
  event: "discovered" | "activated" | "deactivated" | "disabled" | "failed" | "unloaded";
  code?: string;
}

export interface PluginManagerOptions {
  root: string;
  allowlist?: readonly string[];
  enabled?: boolean;
  loader?: (entryPath: string, manifest: PluginManifest) => Promise<PluginModule>;
  audit?: (event: PluginAuditEvent) => void;
  reservedToolNames?: readonly string[];
  privilegedOverrideEnabled?: boolean;
  operatorAllowlist?: readonly string[];
  requiredPluginIds?: readonly string[];
}

export class PluginManagerError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "PluginManagerError";
  }
}

const CAPABILITIES = new Set<PluginCapability>(["tools", "platform", "provider", "context", "skills", "hooks", "middleware"]);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const SAFE_PERMISSION = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;

export function validatePluginManifest(value: unknown): PluginManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PluginManagerError("manifest_invalid", "plugin manifest is invalid");
  const input = value as Record<string, unknown>;
  if (typeof input.id !== "string" || !SAFE_ID.test(input.id)) throw new PluginManagerError("manifest_invalid", "plugin manifest id is invalid");
  if (typeof input.version !== "string" || !input.version.trim() || input.version.length > 64) throw new PluginManagerError("manifest_invalid", "plugin manifest version is invalid");
  if (typeof input.entry !== "string" || !input.entry.trim() || input.entry.length > 512 || /[\u0000-\u001f\u007f]/u.test(input.entry) || isAbsolute(input.entry) || input.entry.split(/[\\/]/u).includes("..")) throw new PluginManagerError("manifest_invalid", "plugin entry path is invalid");
  if (typeof input.enabled !== "boolean") throw new PluginManagerError("manifest_invalid", "plugin enabled flag is invalid");
  if (!Array.isArray(input.capabilities) || input.capabilities.length > CAPABILITIES.size || input.capabilities.some((item) => typeof item !== "string" || !CAPABILITIES.has(item as PluginCapability))) throw new PluginManagerError("manifest_invalid", "plugin capabilities are invalid");
  const capabilities = [...new Set(input.capabilities as PluginCapability[])];
  if (!Array.isArray(input.permissions) || input.permissions.length > 128 || input.permissions.some((item) => typeof item !== "string" || !SAFE_PERMISSION.test(item))) throw new PluginManagerError("manifest_invalid", "plugin permissions are invalid");
  return Object.freeze({ id: input.id, version: input.version.trim(), entry: input.entry.trim(), enabled: input.enabled, capabilities: Object.freeze(capabilities), permissions: Object.freeze([...new Set(input.permissions as string[])]) });
}

function safeErrorCode(error: unknown): PluginRecord["errorCode"] {
  if (error instanceof PluginManagerError && ["manifest_invalid", "contribution_invalid"].includes(error.code)) return error.code as PluginRecord["errorCode"];
  return "load_failed";
}

function cloneRecord(record: PluginRecord): PluginRecord {
  return { ...record, manifest: { ...record.manifest, capabilities: [...record.manifest.capabilities], permissions: [...record.manifest.permissions] } };
}

/** Validated plugin lifecycle manager. It returns contributions to the composition root and owns no tool registry or agent loop. */
export class PluginManager {
  private readonly records = new Map<string, PluginRecord>();
  private readonly modules = new Map<string, PluginModule>();
  private readonly contributionsByPlugin = new Map<string, PluginContribution>();
  private readonly allowlist: ReadonlySet<string>;
  private readonly reservedToolNames: ReadonlySet<string>;
  private readonly requiredPluginIds: ReadonlySet<string>;
  private readonly root: string;

  constructor(private readonly options: PluginManagerOptions) {
    this.root = resolve(options.root);
    this.allowlist = new Set(options.allowlist ?? []);
    this.reservedToolNames = new Set(options.reservedToolNames ?? []);
    this.requiredPluginIds = new Set(options.requiredPluginIds ?? []);
  }

  resolveEntry(manifest: PluginManifest): string {
    const candidate = resolve(this.root, manifest.entry);
    const within = relative(this.root, candidate);
    if (!within || within === ".." || within.startsWith(`..${within.includes("\\") ? "\\" : "/"}`) || isAbsolute(within)) throw new PluginManagerError("manifest_invalid", "plugin entry escapes configured root");
    return candidate;
  }

  discover(manifests: readonly unknown[]): PluginRecord[] {
    const discovered: PluginRecord[] = [];
    for (const value of manifests) {
      const manifest = validatePluginManifest(value);
      if (this.records.has(manifest.id)) throw new PluginManagerError("plugin_collision", "plugin id collision");
      const entryPath = this.resolveEntry(manifest);
      const overrideRequested = manifest.permissions.some((permission) => permission.startsWith("tools:override") || permission.startsWith("provider:override"));
      if (overrideRequested && !(this.options.privilegedOverrideEnabled && this.options.operatorAllowlist?.includes(manifest.id))) throw new PluginManagerError("privileged_override_rejected", "privileged plugin override is not approved");
      const allowlisted = this.allowlist.size === 0 || this.allowlist.has(manifest.id);
      const enabled = this.options.enabled !== false && manifest.enabled && allowlisted;
      const record: PluginRecord = {
        manifest,
        entryPath,
        status: enabled ? "discovered" : "disabled",
        ...(enabled ? {} : { errorCode: manifest.enabled && allowlisted ? "disabled" : "not_allowlisted" }),
      };
      this.records.set(manifest.id, record);
      this.options.audit?.({ pluginId: manifest.id, event: enabled ? "discovered" : "disabled", ...(record.errorCode ? { code: record.errorCode } : {}) });
      discovered.push(cloneRecord(record));
    }
    return discovered;
  }

  get(id: string): PluginRecord | undefined {
    const record = this.records.get(id);
    return record ? cloneRecord(record) : undefined;
  }

  list(): PluginRecord[] {
    return [...this.records.values()].map(cloneRecord);
  }

  contributions(): { tools: ToolDefinition[]; middleware: unknown[]; hooks: unknown[] } {
    const tools: ToolDefinition[] = [];
    const middleware: unknown[] = [];
    const hooks: unknown[] = [];
    for (const contribution of this.contributionsByPlugin.values()) {
      tools.push(...(contribution.tools ?? []));
      middleware.push(...(contribution.middleware ?? []));
      hooks.push(...(contribution.hooks ?? []));
    }
    return { tools, middleware, hooks };
  }

  async load(id: string): Promise<PluginRecord> {
    const record = this.requireRecord(id);
    if (record.status === "disabled") return cloneRecord(record);
    if (this.modules.has(id)) return cloneRecord(record);
    record.status = "loading";
    try {
      const module = this.options.loader
        ? await this.options.loader(record.entryPath, record.manifest)
        : await import(pathToFileURL(record.entryPath).href) as PluginModule;
      this.modules.set(id, module);
      record.status = "discovered";
      return cloneRecord(record);
    } catch {
      record.status = "failed";
      record.errorCode = "load_failed";
      this.auditFailure(id, "load_failed");
      return cloneRecord(record);
    }
  }

  async activate(id: string): Promise<PluginRecord> {
    const record = this.requireRecord(id);
    if (record.status === "disabled" || record.status === "active") return cloneRecord(record);
    const loaded = await this.load(id);
    if (loaded.status === "failed") return loaded;
    const module = this.modules.get(id);
    if (!module) return this.fail(id, "load_failed");
    try {
      const activated = await module.activate?.();
      const contribution = activated && typeof activated === "object" ? activated : module.contributions ?? {};
      this.validateContribution(record.manifest, contribution);
      this.contributionsByPlugin.set(id, contribution);
      record.status = "active";
      record.errorCode = undefined;
      this.options.audit?.({ pluginId: id, event: "activated" });
      return cloneRecord(record);
    } catch (error) {
      const code = error instanceof PluginManagerError && error.code === "contribution_invalid" ? "contribution_invalid" : "lifecycle_failed";
      return this.fail(id, code);
    }
  }

  async deactivate(id: string): Promise<PluginRecord> {
    const record = this.requireRecord(id);
    const module = this.modules.get(id);
    try { await module?.deactivate?.(); } catch { record.status = "failed"; record.errorCode = "lifecycle_failed"; this.auditFailure(id, "lifecycle_failed"); return cloneRecord(record); }
    this.contributionsByPlugin.delete(id);
    if (record.status === "active") record.status = "discovered";
    this.options.audit?.({ pluginId: id, event: "deactivated" });
    return cloneRecord(record);
  }

  async reload(id: string): Promise<PluginRecord> {
    await this.deactivate(id);
    this.modules.delete(id);
    const record = this.requireRecord(id);
    if (record.status === "failed") record.status = "discovered";
    return this.activate(id);
  }

  async unload(id: string): Promise<void> {
    await this.deactivate(id);
    this.modules.delete(id);
    this.records.delete(id);
    this.options.audit?.({ pluginId: id, event: "unloaded" });
  }

  private validateContribution(manifest: PluginManifest, contribution: PluginContribution): void {
    if (!contribution || typeof contribution !== "object") throw new PluginManagerError("contribution_invalid", "plugin contribution is invalid");
    const tools = contribution.tools ?? [];
    if (tools.length && !manifest.capabilities.includes("tools")) throw new PluginManagerError("contribution_invalid", "plugin tools capability is not declared");
    if ((contribution.middleware?.length ?? 0) > 0 && !manifest.capabilities.includes("middleware")) throw new PluginManagerError("contribution_invalid", "plugin middleware capability is not declared");
    const local = new Set<string>();
    for (const tool of tools) {
      const name = tool?.declaration?.name;
      if (!tool || typeof tool.execute !== "function" || typeof name !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/u.test(name) || local.has(name) || this.reservedToolNames.has(name)) throw new PluginManagerError("contribution_invalid", "plugin tool contribution is invalid");
      local.add(name);
      for (const existing of this.contributions().tools) if (existing.declaration.name === name) throw new PluginManagerError("contribution_invalid", "plugin tool contribution collides");
    }
  }

  private requireRecord(id: string): PluginRecord {
    const record = this.records.get(id);
    if (!record) throw new PluginManagerError("plugin_not_found", "plugin is not discovered");
    return record;
  }

  private fail(id: string, errorCode: NonNullable<PluginRecord["errorCode"]>): PluginRecord {
    const record = this.requireRecord(id);
    record.status = "failed";
    record.errorCode = errorCode;
    this.contributionsByPlugin.delete(id);
    this.auditFailure(id, errorCode);
    if (this.requiredPluginIds.has(id)) throw new PluginManagerError("required_plugin_failed", "required plugin failed");
    return cloneRecord(record);
  }

  private auditFailure(id: string, code: string): void {
    this.options.audit?.({ pluginId: id, event: "failed", code });
  }
}
