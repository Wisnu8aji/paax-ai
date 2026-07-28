'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { projectRepository, type ProjectBackend } from './project-repository';
import type { Project, ProjectCreateInput, ProjectUpdateInput } from './types';
import { LocalStorage } from '@/lib/local-storage';

interface ProjectsContextValue {
  projects: Project[];
  loading: boolean;
  error: string | null;
  backend: ProjectBackend;
  refreshProjects: () => Promise<void>;
  getProject: (id: string) => Project | null;
  createProject: (input: ProjectCreateInput) => Promise<Project>;
  updateProject: (id: string, input: ProjectUpdateInput) => Promise<Project | null>;
  deleteProject: (id: string) => Promise<void>;
  setActiveProject: (id: string) => Promise<void>;
}

const ProjectsContext = createContext<ProjectsContextValue | null>(null);

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const backend = projectRepository.backend();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await projectRepository.list();
      setProjects(rows);
      
      // Load workspace head if using postgres
      let serverActiveProjectId: string | null = null;
      if (backend === 'postgres') {
        const head = await projectRepository.getWorkspaceHead();
        if (head && head.active_project_id) {
          serverActiveProjectId = head.active_project_id;
        }
      }

      const current = LocalStorage.getActiveProjectId();
      
      // Validation: Prefer server state, fallback to local cache, then fallback to default reference
      let nextActiveId: string | null = null;
      if (serverActiveProjectId && rows.some((p) => p.id === serverActiveProjectId)) {
        nextActiveId = serverActiveProjectId;
      } else if (current && rows.some((p) => p.id === current)) {
        nextActiveId = current;
      } else {
        // Fallback to designated default reference project instead of hardcoded ID
        // The cast to any is safe here because we injected isDefaultReference in db-api.ts normalization
        const defaultRef = rows.find((project) => (project as any).isDefaultReference);
        if (defaultRef) {
          nextActiveId = defaultRef.id;
        } else if (rows.length > 0) {
          nextActiveId = rows[0].id;
        }
      }
      
      if (nextActiveId) {
        LocalStorage.setActiveProjectId(nextActiveId);
        // If local is out of sync with server, sync it up
        if (backend === 'postgres' && serverActiveProjectId !== nextActiveId) {
          projectRepository.patchWorkspaceHead({ active_project_id: nextActiveId }).catch(console.error);
        }
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat proyek.');
    } finally {
      setLoading(false);
    }
  }, [backend]);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  const createProject = useCallback(async (input: ProjectCreateInput) => {
    const project = await projectRepository.create(input);
    setProjects((current) => [project, ...current].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    return project;
  }, []);

  const updateProject = useCallback(async (id: string, input: ProjectUpdateInput) => {
    const updated = await projectRepository.update(id, input);
    if (updated) {
      setProjects((current) =>
        current.map((project) => (project.id === id ? updated : project)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      );
    }
    return updated;
  }, []);

  const deleteProject = useCallback(async (id: string) => {
    await projectRepository.delete(id);
    setProjects((current) => current.filter((project) => project.id !== id));
  }, []);

  const getProject = useCallback(
    (id: string) => projects.find((project) => project.id === id) ?? null,
    [projects],
  );

  const setActiveProject = useCallback(
    async (id: string) => {
      LocalStorage.setActiveProjectId(id);
      if (backend === 'postgres') {
        try {
          await projectRepository.patchWorkspaceHead({ active_project_id: id });
        } catch (e) {
          console.error("Failed to sync active project to server:", e);
        }
      }
      // Re-render handled by local storage event or parent state if needed,
      // or we can refresh projects to ensure consistency.
    },
    [backend],
  );

  const value = useMemo<ProjectsContextValue>(
    () => ({
      projects,
      loading,
      error,
      backend,
      refreshProjects,
      getProject,
      createProject,
      updateProject,
      deleteProject,
      setActiveProject,
    }),
    [projects, loading, error, backend, refreshProjects, getProject, createProject, updateProject, deleteProject, setActiveProject],
  );

  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
}

export function useProjects() {
  const context = useContext(ProjectsContext);
  if (!context) {
    throw new Error('useProjects must be used inside ProjectsProvider');
  }
  return context;
}
