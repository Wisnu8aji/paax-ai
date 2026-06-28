interface PrefetchProject {
  id: string;
}

const STATIC_DASHBOARD_ROUTES = [
  '/dashboard',
  '/proyek',
  '/files',
  '/database-ahsp',
  '/gambar-kerja-ai',
  '/kolaborasi',
  '/laporan',
  '/pengaturan',
  '/rab-tester',
];

const PROJECT_MODULE_SEGMENTS = ['', '/gambar-kerja', '/rab', '/schedule', '/chat', '/site-agent'];

export function buildDashboardPrefetchRoutes(projects: PrefetchProject[]): string[] {
  const routes = new Set(STATIC_DASHBOARD_ROUTES);
  const projectIds = [...new Set(projects.map((project) => project.id).filter(Boolean))].slice(0, 4);

  for (const projectId of projectIds) {
    for (const segment of PROJECT_MODULE_SEGMENTS) {
      routes.add(`/proyek/${projectId}${segment}`);
    }
  }

  return [...routes];
}
