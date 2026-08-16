export const WORK_SETTINGS_KEY = "paax-work-settings-v1";

export type WorkApprovalMode = "smart" | "always";
export type WorkMemoryMode = "session" | "persistent";

export interface WorkSettings {
  persona: string;
  approvalMode: WorkApprovalMode;
  technical: boolean;
  memoryMode: WorkMemoryMode;
  enabledBlueprints: string[];
  visibleTools: string[];
}

export const DEFAULT_WORK_SETTINGS: WorkSettings = {
  persona: "General operator",
  approvalMode: "smart",
  technical: false,
  memoryMode: "session",
  enabledBlueprints: [],
  visibleTools: [],
};

type WorkSettingsStorage = Pick<Storage, "getItem" | "setItem">;

function browserStorage(): WorkSettingsStorage | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage; } catch { return null; }
}

function normalize(value: unknown): WorkSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULT_WORK_SETTINGS };
  const input = value as Record<string, unknown>;
  return {
    persona: typeof input.persona === "string" && input.persona.trim() ? input.persona.slice(0, 80) : DEFAULT_WORK_SETTINGS.persona,
    approvalMode: input.approvalMode === "always" ? "always" : DEFAULT_WORK_SETTINGS.approvalMode,
    technical: input.technical === true,
    memoryMode: input.memoryMode === "persistent" ? "persistent" : DEFAULT_WORK_SETTINGS.memoryMode,
    enabledBlueprints: Array.isArray(input.enabledBlueprints) ? input.enabledBlueprints.filter((item): item is string => typeof item === "string").slice(0, 30) : [],
    visibleTools: Array.isArray(input.visibleTools) ? input.visibleTools.filter((item): item is string => typeof item === "string").slice(0, 80) : [],
  };
}

export function loadWorkSettings(storage: WorkSettingsStorage | null = browserStorage()): WorkSettings {
  if (!storage) return { ...DEFAULT_WORK_SETTINGS };
  try {
    const value = storage.getItem(WORK_SETTINGS_KEY);
    return value ? normalize(JSON.parse(value)) : { ...DEFAULT_WORK_SETTINGS };
  } catch {
    return { ...DEFAULT_WORK_SETTINGS };
  }
}

export function saveWorkSettings(settings: WorkSettings, storage: WorkSettingsStorage | null = browserStorage()): void {
  try {
    storage?.setItem(WORK_SETTINGS_KEY, JSON.stringify(normalize(settings)));
  } catch {
    // Settings are a convenience; storage failure must not interrupt a turn.
  }
}
