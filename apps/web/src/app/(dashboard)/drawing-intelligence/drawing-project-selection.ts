export function resolveDrawingProject<T extends { id: string; status?: string }>(
  activeProjectId: string | null,
  projects: readonly T[],
): T | null {
  const active = activeProjectId ? projects.find((project) => project.id === activeProjectId) : null;
  if (active) return active;
  if (projects.length === 0) return null;
  // id aktif stale (project dihapus/di-reset) — fallback ke project valid
  // pertama, preferensi project berstatus active.
  const preferred = projects.find((project) => project.status === 'active');
  return preferred ?? projects[0];
}
