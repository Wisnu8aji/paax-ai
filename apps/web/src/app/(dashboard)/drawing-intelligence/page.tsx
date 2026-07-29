'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useProjects } from '@/lib/projects/projects-context';
import { LocalStorage } from '@/lib/local-storage';
import { DrawingIntelligenceWorkspaceV2 } from '@/components/drawing-intelligence/workspace';
import { resolveDrawingProject } from './drawing-project-selection';

/**
 * Route Drawing Intelligence — workspace teknik full-height (blueprint
 * PAAX_DRAWING_INTELLIGENCE_UI_BLUEPRINT). Proyek aktif diambil dari
 * konteks proyek existing atau searchParams projectId.
 */
export default function DrawingIntelligencePage() {
  const { projects } = useProjects();
  const searchParams = useSearchParams();
  const queryProjectId = searchParams.get('projectId');
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setActiveProjectId(LocalStorage.getActiveProjectId());
    setReady(true);
  }, []);

  if (!ready) return null;

  const effectiveId = queryProjectId || activeProjectId;
  const project = resolveDrawingProject(effectiveId, projects);
  const projectName = project?.name ?? 'Proyek aktif';

  return <DrawingIntelligenceWorkspaceV2 projectName={projectName} projectId={effectiveId ?? project?.id ?? null} />;
}
