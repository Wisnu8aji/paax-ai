import { InProcessPlatformAdapter } from "./in-process";
import type { PlatformAdapter } from "./types";

export interface PlatformRegistryOptions {
  allowlist?: readonly string[];
  adapters?: readonly PlatformAdapter[];
}

export class PlatformAdapterRegistry {
  private readonly adapters = new Map<string, PlatformAdapter>();
  private readonly allowlist: ReadonlySet<string>;

  constructor(options: PlatformRegistryOptions = {}) {
    this.allowlist = new Set(options.allowlist ?? ["in-process"]);
    for (const adapter of options.adapters ?? []) this.register(adapter);
  }

  register(adapter: PlatformAdapter): void {
    if (!this.allowlist.has(adapter.id)) throw new Error("platform adapter is not allowlisted");
    if (this.adapters.has(adapter.id)) throw new Error("platform adapter id collision");
    this.adapters.set(adapter.id, adapter);
  }

  get(id: string): PlatformAdapter | undefined {
    return this.allowlist.has(id) ? this.adapters.get(id) : undefined;
  }

  list(): string[] {
    return [...this.adapters.keys()].sort();
  }
}

export function createPlatformRegistry(options: PlatformRegistryOptions = {}): PlatformAdapterRegistry {
  const registry = new PlatformAdapterRegistry(options);
  const allowlist = options.allowlist ?? ["in-process"];
  if (allowlist.includes("in-process") && !registry.get("in-process")) registry.register(new InProcessPlatformAdapter());
  return registry;
}

export * from "./types";
export * from "./in-process";
export * from "./unsupported";
