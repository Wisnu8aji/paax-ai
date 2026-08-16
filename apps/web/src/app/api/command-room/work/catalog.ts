import { getWorkToolMetadata } from "./tools";

export interface WorkCatalog {
  tools: Array<{ name: string; description: string; available: boolean }>;
  blueprints: { configured: boolean; items: string[] };
  knowledge: { available: boolean; mode: "session" | "persistent" };
  archive: { available: boolean; mode: "local-replay" };
  subagents: { available: boolean; reason: string };
  extensions: { configured: boolean; servers: Array<{ name: string; transport: string; health: "unknown" | "ready" }> };
}

export function buildWorkCatalog(): WorkCatalog {
  let servers: Array<{ name: string; transport: string; health: "unknown" | "ready" }> = [];
  const rawServers = process.env.PAAX_MCP_SERVERS?.trim();
  if (rawServers) {
    try {
      const parsed = JSON.parse(rawServers) as unknown;
      if (Array.isArray(parsed)) {
        servers = parsed
          .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
          .map((item, index) => ({
            name: typeof item.name === "string" ? item.name.slice(0, 80) : `extension-${index + 1}`,
            transport: typeof item.transport === "string" ? item.transport.slice(0, 20) : "unknown",
            health: "unknown" as const,
          }));
      }
    } catch {
      servers = [];
    }
  }

  return {
    tools: Object.entries(getWorkToolMetadata()).map(([name, metadata]) => ({ name, ...metadata })),
    blueprints: { configured: Boolean(process.env.PAAX_BLUEPRINT_DIR?.trim()), items: [] },
    knowledge: { available: Boolean(process.env.DB_API_URL?.trim()), mode: process.env.DB_API_URL?.trim() ? "persistent" : "session" },
    archive: { available: true, mode: "local-replay" },
    subagents: { available: false, reason: "Worker adapter belum dikonfigurasi." },
    extensions: { configured: servers.length > 0, servers },
  };
}
