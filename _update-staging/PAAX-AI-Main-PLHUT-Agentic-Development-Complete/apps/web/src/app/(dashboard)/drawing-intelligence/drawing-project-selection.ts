export function resolveDrawingProject<T extends { id: string }>(
  activeProjectId: string | null,
  projects: readonly T[],
): T | null {
  const active = activeProjectId ? projects.find((project) => project.id === activeProjectId) : null;
  if (active) return active;
  return projects.find((project) => project.id === 'PLHUT-SURAKARTA') ?? (projects.length === 1 ? projects[0] : null);
}
