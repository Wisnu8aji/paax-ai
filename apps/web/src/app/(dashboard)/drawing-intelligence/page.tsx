'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useProjects } from '@/lib/projects/projects-context';
import { LocalStorage } from '@/lib/local-storage';
import { DrawingIntelligenceWorkspaceV2 } from '@/components/drawing-intelligence/workspace';
import { resolveDrawingProject } from './drawing-project-selection';

import type { WorkspaceMode } from '@/components/drawing-intelligence/workspace/di-types';

function DrawingIntelligenceContent() {
  const { projects } = useProjects();
  const searchParams = useSearchParams();
  const queryProjectId = searchParams.get('projectId');
  const queryRunId = searchParams.get('runId');
  const queryMode = (searchParams.get('mode') as WorkspaceMode | null) || null;
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

  return (
    <DrawingIntelligenceWorkspaceV2
      projectName={projectName}
      projectId={project?.id ?? effectiveId ?? null}
      initialRunId={queryRunId}
      initialMode={queryMode}
    />
  );
}

export default function DrawingIntelligencePage() {
  return (
    <Suspense fallback={null}>
      <DrawingIntelligenceContent />
    </Suspense>
  );
}
