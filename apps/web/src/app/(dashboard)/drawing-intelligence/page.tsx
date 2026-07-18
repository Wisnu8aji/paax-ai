'use client';

import { useEffect, useState } from 'react';
import { useProjects } from '@/lib/projects/projects-context';
import { LocalStorage } from '@/lib/local-storage';
import { DrawingIntelligenceWorkspaceV2 } from '@/components/drawing-intelligence/workspace';

/**
 * Route Drawing Intelligence — workspace teknik full-height (blueprint
 * PAAX_DRAWING_INTELLIGENCE_UI_BLUEPRINT). Proyek aktif diambil dari
 * konteks proyek existing; tanpa proyek pun workspace tetap berfungsi
 * dengan konteks default (dummy data realistis).
 */
export default function DrawingIntelligencePage() {
  const { getProject } = useProjects();
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setActiveProjectId(LocalStorage.getActiveProjectId());
    setReady(true);
  }, []);

  if (!ready) return null;

  const project = activeProjectId ? getProject(activeProjectId) : null;
  const projectName = project?.name ?? 'PLHUT Campus – Building A';

  return <DrawingIntelligenceWorkspaceV2 projectName={projectName} projectId={project?.id ?? null} />;
}
