export type WorkspaceEnvironmentMode = 'production' | 'demo' | 'test';

/** Unknown or invalid configuration is production: data must fail closed. */
export function resolveWorkspaceEnvironmentMode(value = process.env.NEXT_PUBLIC_DRAWING_INTELLIGENCE_MODE): WorkspaceEnvironmentMode {
  const normalized = value?.trim().toLowerCase();
  return normalized === 'demo' || normalized === 'test' ? normalized : 'production';
}

export function canUseWorkspaceMocks(mode: WorkspaceEnvironmentMode): boolean {
  return mode === 'demo' || mode === 'test';
}
